"""Đăng nhập / lấy thông tin user hiện tại."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..audit import log_activity
from ..database import get_connection
from ..deps import get_current_user
from ..models import LoginRequest, ProfileUpdate, TokenResponse, UserOut
from ..notify import notify_admins
from ..security import create_access_token, hash_password, verify_password

ROLE_VN = {"admin": "Quản trị", "accountant": "Kế toán", "receptionist": "Nhân viên"}

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, conn: sqlite3.Connection = Depends(get_connection)):
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (body.username,)
    ).fetchone()
    if row is None or not row["is_active"] or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai tên đăng nhập hoặc mật khẩu",
        )
    user = UserOut(
        id=row["id"], username=row["username"], full_name=row["full_name"],
        role=row["role"], is_active=bool(row["is_active"]),
    )
    token = create_access_token(user_id=user.id, username=user.username, role=user.role)
    log_activity(conn, user, "auth.login", target_type="user", target_id=user.id)
    # Admin theo dõi hoạt động đăng nhập của nhân viên/kế toán (bỏ qua admin tự đăng nhập).
    notify_admins(
        conn,
        type="auth.login",
        level="info",
        title="Đăng nhập hệ thống",
        body=f"{user.full_name or user.username} ({ROLE_VN.get(user.role, user.role)}) vừa đăng nhập",
        link="/activities",
        actor=user,
        target_type="user",
        target_id=user.id,
    )
    conn.commit()
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Cho phép user tự sửa họ tên và đổi mật khẩu của chính mình.

    Đổi mật khẩu phải nhập đúng mật khẩu hiện tại. KHÔNG cho tự đổi vai trò.
    """
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    fields, values = [], []
    if body.full_name is not None:
        fields.append("full_name = ?"); values.append(body.full_name.strip())

    if body.new_password is not None:
        if not body.current_password or not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")
        fields.append("password_hash = ?"); values.append(hash_password(body.new_password))

    if fields:
        values.append(user.id)
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        log_activity(
            conn,
            user,
            "profile.update",
            target_type="user",
            target_id=user.id,
            detail={"fields": [f.split(" = ")[0] for f in fields if " = " in f]},
        )
        conn.commit()

    row = conn.execute(
        "SELECT id, username, full_name, role, is_active FROM users WHERE id = ?", (user.id,)
    ).fetchone()
    return UserOut(
        id=row["id"], username=row["username"], full_name=row["full_name"],
        role=row["role"], is_active=bool(row["is_active"]),
    )
