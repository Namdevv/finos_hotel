"""Worker chạy nền: poll bảng jobs, xử lý OCR tuần tự (concurrency = 1).

1 thread duy nhất -> không gửi 2 ảnh cùng lúc cho Ollama (VLM nặng GPU, xử lý
tuần tự cho ổn định). Bản thân OCR chạy ở Ollama ngoài tiến trình này.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time

from ..database import _connect
from ..notify import create_notification
from ..ocr.pipeline import run_ocr
from ..ocr.vlm import OcrCancelled

_POLL_SECONDS = 2.0


class OcrWorker:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._current_job_id: int | None = None
        self._cancel = threading.Event()   # yêu cầu ngắt job đang chạy

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

    def request_cancel(self, job_id: int) -> None:
        """Ngắt ngay job đang chạy (gọi từ thread request). Job khác bỏ qua."""
        if job_id == self._current_job_id:
            self._cancel.set()

    # ------------------------------------------------------------------
    def _run(self) -> None:
        while not self._stop.is_set():
            job = self._claim_next_job()
            if job is None:
                self._stop.wait(_POLL_SECONDS)
                continue
            self._process(job)

    def _claim_next_job(self) -> sqlite3.Row | None:
        """Lấy 1 job queued và đánh dấu processing (atomic)."""
        conn = _connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM jobs WHERE status = 'queued' AND cancelled = 0 ORDER BY id LIMIT 1"
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
        self._current_job_id = job["id"]
        self._cancel.clear()

        def set_stage(stage: str) -> None:
            # Ghi giai đoạn hiện tại để Review theo dõi (cùng thread, tuần tự).
            conn.execute("UPDATE jobs SET stage=? WHERE id=?", (stage, job["id"]))
            conn.commit()

        def _mark_cancelled() -> None:
            conn.execute(
                "UPDATE jobs SET status='failed', stage=NULL, cancelled=1, error='Đã ngưng', "
                "finished_at=datetime('now') WHERE id=?",
                (job["id"],),
            )
            conn.commit()

        try:
            result = run_ocr(
                job["image_path"], on_stage=set_stage, rotate=job["rotate"],
                should_cancel=self._cancel.is_set,
            )
            duration = int((time.monotonic() - t0) * 1000)
            # Cờ ngưng có thể được đặt ngay sau khi stream xong (giai đoạn parsing).
            if self._cancel.is_set():
                _mark_cancelled()
                return
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
            n_rows = len(result["rows"])
            create_notification(
                conn,
                user_id=job["user_id"],
                type="ocr.done",
                level="success",
                title="Đã nhận dạng xong sổ",
                body=(f"Nhận được {n_rows} dòng — bấm để duyệt & lưu chứng từ."
                      if n_rows else "Không trích được dòng nào — thử OCR lại với góc xoay khác."),
                link=f"/review/{job['id']}",
                target_type="job",
                target_id=job["id"],
            )
            conn.commit()
        except OcrCancelled:
            _mark_cancelled()
        except Exception as exc:  # noqa: BLE001 - ghi lỗi vào job để hiển thị cho user
            conn.execute(
                "UPDATE jobs SET status='failed', error=?, finished_at=datetime('now') WHERE id=?",
                (str(exc), job["id"]),
            )
            create_notification(
                conn,
                user_id=job["user_id"],
                type="ocr.failed",
                level="error",
                title="Nhận dạng sổ thất bại",
                body="Ảnh chưa nhận dạng được. Thử chụp rõ hơn hoặc OCR lại với góc xoay khác.",
                link=f"/review/{job['id']}",
                target_type="job",
                target_id=job["id"],
            )
            conn.commit()
        finally:
            self._current_job_id = None
            conn.close()


worker = OcrWorker()
