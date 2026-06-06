"""Helpers ghi nhật ký hoạt động người dùng."""
import json
import sqlite3
from typing import Any

from .models import UserOut


def log_activity(
    conn: sqlite3.Connection,
    user: UserOut | None,
    action: str,
    *,
    target_type: str = "",
    target_id: int | None = None,
    detail: dict[str, Any] | str | None = None,
) -> None:
    if isinstance(detail, dict):
        detail_text = json.dumps(detail, ensure_ascii=False, separators=(",", ":"))
    else:
        detail_text = detail or ""
    conn.execute(
        "INSERT INTO activity_logs (user_id, action, target_type, target_id, detail) "
        "VALUES (?, ?, ?, ?, ?)",
        (user.id if user else None, action, target_type, target_id, detail_text),
    )
