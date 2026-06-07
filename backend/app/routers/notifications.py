"""Thông báo trong ứng dụng — mỗi người dùng xem thông báo của CHÍNH MÌNH."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..database import get_connection
from ..deps import get_current_user
from ..models import NotificationOut, UnreadCountOut, UserOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


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
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    sql = "SELECT * FROM notifications WHERE user_id = ?"
    params: list = [user.id]
    if only_unread:
        sql += " AND is_read = 0"
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    return [_row_to_notif(r) for r in conn.execute(sql, params).fetchall()]


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
