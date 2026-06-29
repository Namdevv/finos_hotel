"""Kết nối SQLite + khởi tạo schema + seed tài khoản admin đầu tiên."""
import sqlite3
from pathlib import Path
from typing import Iterator

from .config import get_settings
from .security import hash_password

SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"


def _connect() -> sqlite3.Connection:
    settings = get_settings()
    conn = sqlite3.connect(
        settings.db_file,
        check_same_thread=False,   # cho phép worker thread dùng (mỗi nơi mở connection riêng)
        timeout=30,                # chờ khi DB bị khóa thay vì lỗi ngay
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    return conn


def get_connection() -> Iterator[sqlite3.Connection]:
    """Dependency của FastAPI: mở connection cho mỗi request, đóng khi xong."""
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Tạo bảng (idempotent) và seed admin nếu DB chưa có user nào."""
    settings = get_settings()
    settings.db_file.parent.mkdir(parents=True, exist_ok=True)
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    settings.report_path.mkdir(parents=True, exist_ok=True)

    conn = _connect()
    try:
        conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
        conn.commit()

        # Migration nhẹ: thêm cột mới cho DB tạo từ phiên bản cũ (CREATE TABLE
        # IF NOT EXISTS không thêm cột). An toàn để chạy mỗi lần khởi động.
        job_cols = {r["name"] for r in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "stage" not in job_cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN stage TEXT")
        if "rotate" not in job_cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN rotate INTEGER")
        if "cancelled" not in job_cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0")
        conn.commit()

        txn_cols = {r["name"] for r in conn.execute("PRAGMA table_info(transactions)").fetchall()}
        if "deleted_at" not in txn_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN deleted_at TEXT")
        if "deleted_by" not in txn_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN deleted_by INTEGER REFERENCES users(id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_txn_deleted ON transactions(deleted_at)")
        conn.commit()

        notif_cols = {r["name"] for r in conn.execute("PRAGMA table_info(notifications)").fetchall()}
        if "event_key" not in notif_cols:
            conn.execute("ALTER TABLE notifications ADD COLUMN event_key TEXT")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_event_key ON notifications(event_key)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notification_preferences ("
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "notif_type TEXT NOT NULL, "
            "enabled INTEGER NOT NULL DEFAULT 1, "
            "updated_at TEXT NOT NULL DEFAULT (datetime('now')), "
            "PRIMARY KEY (user_id, notif_type))"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS push_subscriptions ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "endpoint TEXT NOT NULL UNIQUE, "
            "p256dh TEXT NOT NULL, "
            "auth TEXT NOT NULL, "
            "user_agent TEXT NOT NULL DEFAULT '', "
            "created_at TEXT NOT NULL DEFAULT (datetime('now')), "
            "updated_at TEXT NOT NULL DEFAULT (datetime('now')))"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notification_push_outbox ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "attempts INTEGER NOT NULL DEFAULT 0, "
            "last_error TEXT NOT NULL DEFAULT '', "
            "delivered_at TEXT, "
            "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_push_outbox_pending "
            "ON notification_push_outbox(delivered_at, attempts, id)"
        )
        if settings.notification_retention_days > 0:
            conn.execute(
                "DELETE FROM notifications "
                "WHERE is_read = 1 AND created_at < datetime('now', ?)",
                (f"-{settings.notification_retention_days} days",),
            )
        conn.commit()

        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count == 0:
            conn.execute(
                "INSERT INTO users (username, full_name, password_hash, role) "
                "VALUES (?, ?, ?, 'admin')",
                (
                    settings.admin_username,
                    "Quản trị viên",
                    hash_password(settings.admin_password),
                ),
            )
            conn.commit()
    finally:
        conn.close()
