"""Worker chạy nền: poll bảng jobs, xử lý OCR tuần tự (concurrency = 1).

Tối ưu 4GB:
- 1 thread duy nhất -> không bao giờ chạy 2 job OCR cùng lúc.
- Model OCR lazy-load ở lần job đầu, tự unload sau N phút nhàn rỗi.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time

from ..config import get_settings
from ..database import _connect
from ..ocr.engine import engine
from ..ocr.pipeline import run_ocr

_POLL_SECONDS = 2.0


class OcrWorker:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_activity = time.monotonic()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="ocr-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    # ------------------------------------------------------------------
    def _run(self) -> None:
        settings = get_settings()
        idle_unload = settings.ocr_idle_unload_minutes * 60
        while not self._stop.is_set():
            job = self._claim_next_job()
            if job is None:
                # Nhàn rỗi: giải phóng model nếu đã quá lâu không dùng.
                if engine.loaded and (time.monotonic() - self._last_activity) > idle_unload:
                    engine.unload()
                self._stop.wait(_POLL_SECONDS)
                continue
            self._process(job)
            self._last_activity = time.monotonic()

    def _claim_next_job(self) -> sqlite3.Row | None:
        """Lấy 1 job queued và đánh dấu processing (atomic)."""
        conn = _connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1"
            ).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                return None
            conn.execute(
                "UPDATE jobs SET status='processing', started_at=datetime('now') WHERE id=?",
                (row["id"],),
            )
            conn.commit()
            return row
        finally:
            conn.close()

    def _process(self, job: sqlite3.Row) -> None:
        conn = _connect()
        t0 = time.monotonic()
        try:
            result = run_ocr(job["image_path"])
            duration = int((time.monotonic() - t0) * 1000)
            conn.execute(
                "UPDATE jobs SET status='done', result_json=?, raw_ocr_json=?, "
                "duration_ms=?, finished_at=datetime('now') WHERE id=?",
                (
                    json.dumps(result["rows"], ensure_ascii=False),
                    json.dumps(result["raw"], ensure_ascii=False),
                    duration,
                    job["id"],
                ),
            )
            conn.commit()
        except Exception as exc:  # noqa: BLE001 - ghi lỗi vào job để hiển thị cho user
            conn.execute(
                "UPDATE jobs SET status='failed', error=?, finished_at=datetime('now') WHERE id=?",
                (str(exc), job["id"]),
            )
            conn.commit()
        finally:
            conn.close()


worker = OcrWorker()
