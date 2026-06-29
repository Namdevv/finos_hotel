"""Helpers tạo thông báo trong ứng dụng (in-app notifications).

Không gọi commit() ở đây — để caller commit chung với thao tác nghiệp vụ
(vd tạo chứng từ + thông báo trong cùng 1 transaction SQLite).
"""
import re
import sqlite3
from typing import Literal, Optional

from .models import UserOut
from .push import enqueue_push

Level = Literal["info", "success", "warning", "error"]
_LEVELS = {"info", "success", "warning", "error"}
_TYPE_RE = re.compile(r"^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$")
_TARGET_RE = re.compile(r"^[a-z][a-z0-9_-]*$")
_MAX_TYPE = 80
_MAX_TITLE = 180
_MAX_BODY = 2000
_MAX_LINK = 300
_MAX_TARGET_TYPE = 50
_MAX_EVENT_KEY = 160
PREFERENCE_LABELS = {
    "ocr": "OCR",
    "transaction": "Chứng từ",
    "user": "Tài khoản",
    "auth": "Đăng nhập",
    "report": "Báo cáo",
    "system": "Hệ thống",
}


def _bounded(value: str, max_len: int) -> str:
    return value.strip()[:max_len]


def _validate_type(value: str) -> str:
    value = _bounded(value, _MAX_TYPE)
    if not _TYPE_RE.fullmatch(value):
        raise ValueError("notification type must look like 'domain.event'")
    return value


def _validate_link(link: Optional[str]) -> Optional[str]:
    if link is None:
        return None
    link = _bounded(link, _MAX_LINK)
    if not link:
        return None
    if not link.startswith("/") or link.startswith("//") or "://" in link:
        raise ValueError("notification link must be an internal frontend route")
    return link


def _validate_target_type(value: str) -> str:
    value = _bounded(value, _MAX_TARGET_TYPE)
    if value and not _TARGET_RE.fullmatch(value):
        raise ValueError("notification target_type is invalid")
    return value


def notification_group(type: str) -> str:
    return _validate_type(type).split(".", 1)[0]


def notification_enabled(conn: sqlite3.Connection, user_id: int, type: str) -> bool:
    group = notification_group(type)
    row = conn.execute(
        "SELECT enabled FROM notification_preferences WHERE user_id = ? AND notif_type = ?",
        (user_id, group),
    ).fetchone()
    return row is None or bool(row["enabled"])


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
    event_key: str | None = None,
) -> None:
    """Tạo 1 thông báo gửi tới 1 người dùng."""
    if level not in _LEVELS:
        raise ValueError("notification level is invalid")
    notif_type = _validate_type(type)
    if not notification_enabled(conn, user_id, notif_type):
        return
    notif_title = _bounded(title, _MAX_TITLE)
    notif_body = _bounded(body, _MAX_BODY)
    notif_link = _validate_link(link)
    notif_target_type = _validate_target_type(target_type)
    notif_event_key = _bounded(event_key or "", _MAX_EVENT_KEY) or None
    actor_name = ""
    if actor is not None:
        actor_name = _bounded(actor.full_name or actor.username, 120)
    insert = "INSERT"
    if notif_event_key is not None:
        insert = "INSERT OR IGNORE"
    cur = conn.execute(
        f"{insert} INTO notifications "
        "(user_id, type, level, title, body, link, actor_id, actor_name, target_type, target_id, event_key) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            user_id, notif_type, level, notif_title, notif_body, notif_link,
            actor.id if actor else None, actor_name, notif_target_type, target_id,
            notif_event_key,
        ),
    )
    if cur.rowcount:
        enqueue_push(conn, notification_id=cur.lastrowid, user_id=user_id)


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
    event_key_prefix: str | None = None,
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
            event_key=f"{event_key_prefix}:user:{row['id']}" if event_key_prefix else None,
        )
