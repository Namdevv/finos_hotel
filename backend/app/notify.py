"""Helpers tạo thông báo trong ứng dụng (in-app notifications).

Không gọi commit() ở đây — để caller commit chung với thao tác nghiệp vụ
(vd tạo chứng từ + thông báo trong cùng 1 transaction SQLite).
"""
import sqlite3
from typing import Literal, Optional

from .models import UserOut

Level = Literal["info", "success", "warning", "error"]


def create_notification(
    conn: sqlite3.Connection,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str = "",
    level: Level = "info",
    link: Optional[str] = None,
    actor: UserOut | None = None,
    target_type: str = "",
    target_id: int | None = None,
) -> None:
    """Tạo 1 thông báo gửi tới 1 người dùng."""
    actor_name = ""
    if actor is not None:
        actor_name = actor.full_name or actor.username
    conn.execute(
        "INSERT INTO notifications "
        "(user_id, type, level, title, body, link, actor_id, actor_name, target_type, target_id) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            user_id, type, level, title, body, link,
            actor.id if actor else None, actor_name, target_type, target_id,
        ),
    )


def notify_admins(
    conn: sqlite3.Connection,
    *,
    type: str,
    title: str,
    body: str = "",
    level: Level = "info",
    link: Optional[str] = None,
    actor: UserOut | None = None,
    target_type: str = "",
    target_id: int | None = None,
) -> None:
    """Gửi thông báo tới mọi admin đang hoạt động (trừ chính người gây ra).

    Dùng cho 'admin thấy mọi hoạt động' — admin không nhận thông báo về
    thao tác do chính mình thực hiện để tránh nhiễu.
    """
    rows = conn.execute(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = 1"
    ).fetchall()
    actor_id = actor.id if actor else None
    for row in rows:
        if row["id"] == actor_id:
            continue
        create_notification(
            conn, user_id=row["id"], type=type, title=title, body=body, level=level,
            link=link, actor=actor, target_type=target_type, target_id=target_id,
        )
