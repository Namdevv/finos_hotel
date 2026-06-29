"""Điểm vào FastAPI: gắn router, khởi tạo DB, chạy worker, phục vụ frontend tĩnh."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import BASE_DIR
from .database import init_db
from .jobs.report_scheduler import report_scheduler
from .jobs.worker import worker
from .push import push_worker
from .routers import activities, auth, notifications, ocr, reports, stats, transactions, users

# Thư mục build của frontend (Vite -> dist). Có thể chưa tồn tại lúc dev.
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()        # tạo bảng + seed admin
    worker.start()   # khởi động worker OCR nền (1 thread, concurrency=1)
    push_worker.start()
    report_scheduler.start()  # tự render báo cáo Excel chốt cuối tháng
    yield
    report_scheduler.stop()
    push_worker.stop()
    worker.stop()


app = FastAPI(title="FinOS Hotel", version="0.1.0", lifespan=lifespan)

# CORS: cho phép dev frontend (Vite chạy cổng khác) gọi API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # LAN nội bộ; siết lại nếu cần
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(transactions.router)
app.include_router(ocr.router)
app.include_router(stats.router)
app.include_router(activities.router)
app.include_router(notifications.router)
app.include_router(reports.router)


@app.get("/api/health")
def health():
    from .config import get_settings

    s = get_settings()
    return {"status": "ok", "ocr_backend": "ollama", "ocr_model": s.ocr_model}


# --- Phục vụ frontend đã build (SPA). Đặt SAU các route /api. ---
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        """Trả index.html cho mọi route không phải /api (client-side routing)."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
