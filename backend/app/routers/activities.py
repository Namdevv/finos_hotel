"""Nhật ký hoạt động — chỉ admin xem."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..database import get_connection
from ..deps import require_roles
from ..models import ActivityOut, UserOut

router = APIRouter(prefix="/api/activities", tags=["activities"])
admin_only = require_roles("admin")


@router.get("", response_model=list[ActivityOut])
def list_activities(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_connection),
    _: UserOut = Depends(admin_only),
):
    sql = (
        "SELECT a.*, u.username, u.full_name, u.role "
        "FROM activity_logs a "
        "LEFT JOIN users u ON u.id = a.user_id "
        "WHERE 1=1"
    )
    params: list = []
    if user_id:
        sql += " AND a.user_id = ?"
        params.append(user_id)
    if action:
        sql += " AND a.action = ?"
        params.append(action)
    sql += " ORDER BY a.id DESC LIMIT ? OFFSET ?"
    params.append(limit)
    params.append(offset)
    return [
        ActivityOut(
            id=row["id"],
            user_id=row["user_id"],
            username=row["username"],
            full_name=row["full_name"],
            role=row["role"],
            action=row["action"],
            target_type=row["target_type"],
            target_id=row["target_id"],
            detail=row["detail"],
            created_at=row["created_at"],
        )
        for row in conn.execute(sql, params).fetchall()
    ]
