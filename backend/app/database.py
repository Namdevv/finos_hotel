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
