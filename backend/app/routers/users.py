"""Quản lý người dùng — chỉ admin."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..audit import log_activity
from ..database import get_connection
from ..deps import require_roles
from ..models import UserCreate, UserOut, UserUpdate
from ..notify import create_notification
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])
admin_only = require_roles("admin")

ROLE_VN = {"admin": "Quản trị", "accountant": "Kế toán", "receptionist": "Nhân viên"}


def _row_to_user(row: sqlite3.Row) -> UserOut:
    return UserOut(
        id=row["id"], username=row["username"], full_name=row["full_name"],
        role=row["role"], is_active=bool(row["is_active"]),
    )


@router.get("", response_model=list[UserOut])
def list_users(conn: sqlite3.Connection = Depends(get_connection), _=Depends(admin_only)):
    rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    return [_row_to_user(r) for r in rows]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, conn: sqlite3.Connection = Depends(get_connection), admin=Depends(admin_only)):
    try:
        cur = conn.execute(
            "INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)",
            (body.username, body.full_name, hash_password(body.password), body.role),
        )
        log_activity(
            conn,
            admin,
            "user.create",
            target_type="user",
            target_id=cur.lastrowid,
            detail={"username": body.username, "role": body.role},
        )
        create_notification(
            conn,
            user_id=cur.lastrowid,
            type="user.welcome",
            level="success",
            title="Chào mừng đến với FinOS Hotel",
            body=f"Tài khoản của bạn đã được tạo với vai trò {ROLE_VN.get(body.role, body.role)}.",
            link="/profile",
            actor=admin,
            target_type="user",
            target_id=cur.lastrowid,
            event_key=f"user.welcome:{cur.lastrowid}",
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên đăng nhập đã tồn tại")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _row_to_user(row)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, conn: sqlite3.Connection = Depends(get_connection), admin=Depends(admin_only)):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    fields, values = [], []
    if body.full_name is not None:
        fields.append("full_name = ?"); values.append(body.full_name)
    if body.password is not None:
        fields.append("password_hash = ?"); values.append(hash_password(body.password))
    if body.role is not None:
        fields.append("role = ?"); values.append(body.role)
    if body.is_active is not None:
        fields.append("is_active = ?"); values.append(1 if body.is_active else 0)

    if fields:
        values.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        log_activity(
            conn,
            admin,
            "user.update",
            target_type="user",
            target_id=user_id,
            detail={"fields": [f.split(" = ")[0] for f in fields if " = " in f]},
        )
        # Báo cho người dùng bị tác động (trừ khi admin tự sửa mình).
        if user_id != admin.id:
            changes: list[str] = []
            if body.role is not None:
                changes.append(f"vai trò → {ROLE_VN.get(body.role, body.role)}")
            if body.is_active is not None:
                changes.append("mở khóa tài khoản" if body.is_active else "khóa tài khoản")
            if body.password is not None:
                changes.append("đặt lại mật khẩu")
            if body.full_name is not None:
                changes.append("cập nhật họ tên")
            if changes:
                deactivated = body.is_active is False
                create_notification(
                    conn,
                    user_id=user_id,
                    type="user.update",
                    level="warning" if deactivated else "info",
                    title="Tài khoản của bạn vừa được cập nhật",
                    body="Quản trị viên đã " + ", ".join(changes) + ".",
                    link="/profile",
                    actor=admin,
                    target_type="user",
                    target_id=user_id,
                )
        conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, conn: sqlite3.Connection = Depends(get_connection), admin=Depends(admin_only)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Không thể tự xóa chính mình")
    row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("UPDATE notifications SET actor_id = NULL WHERE actor_id = ?", (user_id,))
        conn.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        log_activity(conn, admin, "user.delete", target_type="user", target_id=user_id)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User đã có dữ liệu liên quan; hãy khóa tài khoản thay vì xóa",
        )
