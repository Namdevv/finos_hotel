"""Thông báo trong ứng dụng — mỗi người dùng xem thông báo của CHÍNH MÌNH."""
import asyncio
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi import Request
from fastapi.responses import StreamingResponse

from ..config import get_settings
from ..database import _connect, get_connection
from ..deps import get_current_user
from ..models import (
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferencesUpdate,
    PushKeyOut,
    PushStatusOut,
    PushSubscriptionIn,
    UnreadCountOut,
    UserOut,
)
from ..notify import PREFERENCE_LABELS, notification_group

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_PREF_ORDER = ("ocr", "transaction", "user", "auth", "system")


def _pref_label(notif_type: str) -> str:
    return PREFERENCE_LABELS.get(notif_type, notif_type)


def _row_to_notif(row: sqlite3.Row) -> NotificationOut:
    return NotificationOut(
        id=row["id"], type=row["type"], level=row["level"], title=row["title"],
        body=row["body"], link=row["link"], actor_id=row["actor_id"],
        actor_name=row["actor_name"], target_type=row["target_type"],
        target_id=row["target_id"], is_read=bool(row["is_read"]),
        created_at=row["created_at"],
    )


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    only_unread: bool = Query(False),
    after_id: int | None = Query(None, ge=0),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    sql = "SELECT * FROM notifications WHERE user_id = ?"
    params: list = [user.id]
    if only_unread:
        sql += " AND is_read = 0"
    if after_id is not None:
        sql += " AND id > ?"
        params.append(after_id)
    order = "ASC" if after_id is not None else "DESC"
    sql += f" ORDER BY id {order} LIMIT ? OFFSET ?"
    params += [limit, offset]
    return [_row_to_notif(r) for r in conn.execute(sql, params).fetchall()]


@router.get("/stream")
def stream_notifications(
    only_unread: bool = Query(False),
    after_id: int | None = Query(None, ge=0),
    user: UserOut = Depends(get_current_user),
):
    """Stream notification mới bằng SSE qua fetch stream.

    Frontend dùng fetch để gửi được Authorization header. Endpoint cố tình tự mở
    connection SQLite trong generator để không giữ dependency connection vô hạn.
    """

    async def events():
        last_id = after_id
        if last_id is None:
            conn = _connect()
            try:
                row = conn.execute(
                    "SELECT COALESCE(MAX(id), 0) AS max_id FROM notifications WHERE user_id = ?",
                    (user.id,),
                ).fetchone()
                last_id = row["max_id"]
            finally:
                conn.close()
        yield "retry: 5000\n\n"
        keepalive = 0
        try:
            while True:
                conn = _connect()
                try:
                    sql = "SELECT * FROM notifications WHERE user_id = ? AND id > ?"
                    params: list = [user.id, last_id or 0]
                    if only_unread:
                        sql += " AND is_read = 0"
                    sql += " ORDER BY id ASC LIMIT 100"
                    rows = conn.execute(sql, params).fetchall()
                finally:
                    conn.close()

                if rows:
                    keepalive = 0
                    for row in rows:
                        notif = _row_to_notif(row)
                        last_id = notif.id
                        yield "event: notification\n"
                        yield "data: " + json.dumps(notif.model_dump(), ensure_ascii=False) + "\n\n"
                    continue

                keepalive += 1
                if keepalive >= 15:
                    keepalive = 0
                    yield ": keepalive\n\n"
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/unread_count", response_model=UnreadCountOut)
def unread_count(
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0",
        (user.id,),
    ).fetchone()
    return UnreadCountOut(count=row["c"])


@router.get("/preferences", response_model=list[NotificationPreferenceOut])
def list_preferences(
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    rows = conn.execute(
        "SELECT notif_type, enabled FROM notification_preferences WHERE user_id = ?",
        (user.id,),
    ).fetchall()
    stored = {row["notif_type"]: bool(row["enabled"]) for row in rows}
    keys = list(_PREF_ORDER)
    for key in stored:
        if key not in keys:
            keys.append(key)
    return [
        NotificationPreferenceOut(
            notif_type=key,
            label=_pref_label(key),
            enabled=stored.get(key, True),
        )
        for key in keys
    ]


@router.patch("/preferences", response_model=list[NotificationPreferenceOut])
def update_preferences(
    body: NotificationPreferencesUpdate,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    allowed = set(_PREF_ORDER) | set(PREFERENCE_LABELS)
    for raw_key, enabled in body.preferences.items():
        try:
            key = notification_group(f"{raw_key}.event")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Nhóm thông báo không hợp lệ: {raw_key}")
        if key not in allowed:
            raise HTTPException(status_code=400, detail=f"Nhóm thông báo không hợp lệ: {raw_key}")
        conn.execute(
            "INSERT INTO notification_preferences (user_id, notif_type, enabled, updated_at) "
            "VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(user_id, notif_type) DO UPDATE SET "
            "enabled = excluded.enabled, updated_at = datetime('now')",
            (user.id, key, 1 if enabled else 0),
        )
    conn.commit()
    return list_preferences(conn, user)


@router.get("/push/key", response_model=PushKeyOut)
def push_key():
    settings = get_settings()
    enabled = bool(settings.vapid_public_key and settings.vapid_private_key)
    return PushKeyOut(public_key=settings.vapid_public_key if enabled else "", enabled=enabled)


@router.get("/push/status", response_model=PushStatusOut)
def push_status(
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    settings = get_settings()
    enabled = bool(settings.vapid_public_key and settings.vapid_private_key)
    count = conn.execute(
        "SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?",
        (user.id,),
    ).fetchone()["c"]
    return PushStatusOut(enabled=enabled, subscribed=count > 0)


@router.post("/push/subscribe", response_model=PushStatusOut)
def subscribe_push(
    body: PushSubscriptionIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    settings = get_settings()
    if not (settings.vapid_public_key and settings.vapid_private_key):
        raise HTTPException(status_code=503, detail="Web Push chưa được cấu hình VAPID")
    user_agent = request.headers.get("user-agent", "")[:300]
    conn.execute(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at) "
        "VALUES (?, ?, ?, ?, ?, datetime('now')) "
        "ON CONFLICT(endpoint) DO UPDATE SET "
        "user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, "
        "user_agent = excluded.user_agent, updated_at = datetime('now')",
        (user.id, body.endpoint, body.p256dh, body.auth, user_agent),
    )
    conn.commit()
    return PushStatusOut(enabled=True, subscribed=True)


@router.post("/push/unsubscribe", response_model=PushStatusOut)
def unsubscribe_push(
    body: PushSubscriptionIn,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    conn.execute(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        (user.id, body.endpoint),
    )
    conn.commit()
    return push_status(conn, user)


@router.post("/{notif_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notif_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    cur = conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
        (notif_id, user.id),
    )
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")
    conn.commit()


@router.post("/read_all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
        (user.id,),
    )
    conn.commit()


@router.delete("/{notif_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notif_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    conn.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?", (notif_id, user.id)
    )
    conn.commit()
