"""Đăng nhập / lấy thông tin user hiện tại."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_connection
from ..deps import get_current_user
from ..models import LoginRequest, TokenResponse, UserOut
from ..security import create_access_token, verify_password

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
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(get_current_user)):
    return user
