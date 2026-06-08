"""Web Push delivery worker backed by SQLite outbox."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any

from .config import get_settings
from .database import _connect

try:  # pywebpush is optional at runtime; app should still run without VAPID/push.
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - exercised only when dependency is absent
    WebPushException = Exception
    webpush = None

_POLL_SECONDS = 3.0
_MAX_ATTEMPTS = 5


def enqueue_push(conn: sqlite3.Connection, *, notification_id: int, user_id: int) -> None:
    conn.execute(
        "INSERT INTO notification_push_outbox (notification_id, user_id) VALUES (?, ?)",
        (notification_id, user_id),
    )


def _push_configured() -> bool:
    settings = get_settings()
    return bool(webpush and settings.vapid_public_key and settings.vapid_private_key)


def _payload(row: sqlite3.Row) -> str:
    return json.dumps(
        {
            "id": row["notification_id"],
            "title": row["title"],
            "body": row["body"],
            "link": row["link"] or "/notifications",
            "icon": "/logo_finos.png",
        },
        ensure_ascii=False,
    )


def _send(subscription: sqlite3.Row, payload: str) -> None:
    settings = get_settings()
    info: dict[str, Any] = {
        "endpoint": subscription["endpoint"],
        "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
    }
    webpush(
        subscription_info=info,
        data=payload,
        vapid_private_key=settings.vapid_private_key,
        vapid_claims={"sub": settings.vapid_contact},
        timeout=10,
    )


class PushWorker:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="push-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                if _push_configured():
                    self._process_once()
            except Exception:
                pass
            self._stop.wait(_POLL_SECONDS)

    def _process_once(self) -> None:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT o.id AS outbox_id, o.notification_id, o.user_id, o.attempts, "
                "n.title, n.body, n.link "
                "FROM notification_push_outbox o "
                "JOIN notifications n ON n.id = o.notification_id "
                "WHERE o.delivered_at IS NULL AND o.attempts < ? "
                "ORDER BY o.id LIMIT 20",
                (_MAX_ATTEMPTS,),
            ).fetchall()
            for row in rows:
                self._deliver(conn, row)
        finally:
            conn.close()

    def _deliver(self, conn: sqlite3.Connection, row: sqlite3.Row) -> None:
        subs = conn.execute(
            "SELECT * FROM push_subscriptions WHERE user_id = ?",
            (row["user_id"],),
        ).fetchall()
        if not subs:
            conn.execute(
                "UPDATE notification_push_outbox SET delivered_at=datetime('now'), last_error='' WHERE id=?",
                (row["outbox_id"],),
            )
            conn.commit()
            return

        payload = _payload(row)
        last_error = ""
        sent = 0
        for sub in subs:
            try:
                _send(sub, payload)
                sent += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                last_error = str(exc)[:500]
                if status_code in (404, 410):
                    conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub["id"],))
            except Exception as exc:  # noqa: BLE001 - keep worker alive on delivery errors
                last_error = str(exc)[:500]

        if sent:
            conn.execute(
                "UPDATE notification_push_outbox SET delivered_at=datetime('now'), last_error='' WHERE id=?",
                (row["outbox_id"],),
            )
        else:
            conn.execute(
                "UPDATE notification_push_outbox SET attempts=attempts+1, last_error=? WHERE id=?",
                (last_error or "push delivery failed", row["outbox_id"]),
            )
        conn.commit()


push_worker = PushWorker()
