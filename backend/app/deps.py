"""Dependencies: lấy user hiện tại từ JWT và kiểm tra quyền (RBAC)."""
import sqlite3

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .database import get_connection
from .models import UserOut
from .security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    conn: sqlite3.Connection = Depends(get_connection),
) -> UserOut:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Thiếu token")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")

    row = conn.execute(
        "SELECT id, username, full_name, role, is_active FROM users WHERE id = ?",
        (payload.get("sub"),),
    ).fetchone()
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không tồn tại hoặc bị khóa")

    return UserOut(
        id=row["id"],
        username=row["username"],
        full_name=row["full_name"],
        role=row["role"],
        is_active=bool(row["is_active"]),
    )


def require_roles(*allowed: str):
    """Tạo dependency yêu cầu user thuộc một trong các vai trò cho phép."""

    def checker(user: UserOut = Depends(get_current_user)) -> UserOut:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện thao tác này",
            )
        return user

    return checker
