"""Lịch nền: tự render báo cáo Excel chốt cuối tháng.

1 thread daemon (giống push_worker): định kỳ kiểm tra tháng vừa kết thúc; nếu
chưa có báo cáo cho tháng đó thì tự tạo (auto=True) + thông báo admin. Không cần
cron/Celery — đúng triết lý self-host của dự án.
"""
from __future__ import annotations

import threading

from ..config import get_settings
from ..database import _connect
from ..reports import generate_report, previous_period

_POLL_SECONDS = 1800.0  # 30 phút — báo cáo tháng không cần kiểm tra dày


class ReportScheduler:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="report-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        # Kiểm tra ngay khi khởi động (bù báo cáo nếu máy tắt qua mốc cuối tháng).
        while not self._stop.is_set():
            try:
                if get_settings().auto_monthly_report:
                    self._ensure_previous_month()
            except Exception:
                pass  # giữ thread sống; thử lại ở lần poll sau
            self._stop.wait(_POLL_SECONDS)

    def _ensure_previous_month(self) -> None:
        period = previous_period()
        conn = _connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            exists = conn.execute(
                "SELECT 1 FROM reports WHERE period = ?", (period,)
            ).fetchone()
            if exists:
                conn.rollback()
                return
            generate_report(conn, period, user=None, auto=True)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


report_scheduler = ReportScheduler()
