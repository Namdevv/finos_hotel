"""Upload ảnh sổ -> tạo job OCR -> theo dõi kết quả đề xuất."""
import json
import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from ..config import get_settings
from ..database import get_connection
from ..deps import get_current_user
from ..models import JobOut, JobResult, OcrRow, UserOut

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


@router.post("/upload", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    settings = get_settings()
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Định dạng ảnh không hỗ trợ")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Ảnh vượt quá {settings.max_upload_mb}MB")

    name = f"{uuid.uuid4().hex}{ext}"
    dest = settings.upload_path / name
    dest.write_bytes(data)

    cur = conn.execute(
        "INSERT INTO jobs (user_id, image_path, status) VALUES (?, ?, 'queued')",
        (user.id, str(dest)),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return JobOut(id=row["id"], status=row["status"], created_at=row["created_at"])


@router.get("/jobs/{job_id}", response_model=JobResult)
def get_job(
    job_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    # Lễ tân chỉ xem job của mình; admin/kế toán xem mọi job.
    if user.role == "receptionist" and row["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xem job này")

    rows: list[OcrRow] = []
    if row["result_json"]:
        rows = [OcrRow(**r) for r in json.loads(row["result_json"])]

    return JobResult(
        job_id=row["id"],
        status=row["status"],
        image_path=f"/api/ocr/image/{row['id']}",
        rows=rows,
        error=row["error"],
    )


@router.get("/image/{job_id}")
def get_job_image(
    job_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    row = conn.execute("SELECT user_id, image_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if user.role == "receptionist" and row["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xem ảnh này")
    p = Path(row["image_path"])
    if not p.exists():
        raise HTTPException(status_code=404, detail="Ảnh không tồn tại")
    return FileResponse(p)
