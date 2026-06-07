"""Upload ảnh sổ -> tạo job OCR -> theo dõi kết quả đề xuất."""
import json
import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from ..audit import log_activity
from ..config import get_settings
from ..database import get_connection
from ..deps import get_current_user, require_roles
from ..models import JobOut, JobResult, JobSummary, OcrRow, ReocrRequest, UserOut
from ..notify import notify_admins

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_VALID_ROTATE = {0, 90, 180, 270}


def _can_access(user: UserOut, owner_id: int) -> bool:
    """Lễ tân chỉ thao tác job của mình; admin/kế toán xem mọi job."""
    return user.role != "receptionist" or owner_id == user.id


@router.post("/upload", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    rotate: int | None = Form(default=None),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    settings = get_settings()
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Định dạng ảnh không hỗ trợ")
    if rotate is not None and rotate not in _VALID_ROTATE:
        raise HTTPException(status_code=400, detail="Góc xoay phải là 0/90/180/270")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Ảnh vượt quá {settings.max_upload_mb}MB")

    name = f"{uuid.uuid4().hex}{ext}"
    dest = settings.upload_path / name
    dest.write_bytes(data)

    # rotate=None -> để NULL, worker dùng FINOS_OCR_ROTATE mặc định.
    cur = conn.execute(
        "INSERT INTO jobs (user_id, image_path, status, rotate) VALUES (?, ?, 'queued', ?)",
        (user.id, str(dest), rotate),
    )
    log_activity(
        conn,
        user,
        "ocr.upload",
        target_type="job",
        target_id=cur.lastrowid,
        detail={"filename": file.filename, "rotate": rotate},
    )
    notify_admins(
        conn,
        type="ocr.upload",
        level="info",
        title="Ảnh sổ mới được tải lên",
        body=f"{user.full_name or user.username} vừa tải ảnh sổ để nhận dạng",
        link="/uploads",
        actor=user,
        target_type="job",
        target_id=cur.lastrowid,
    )
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return JobOut(id=row["id"], status=row["status"], created_at=row["created_at"])


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(
    limit: int = 100,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Thư viện ảnh đã upload. Lễ tân thấy của mình; admin/kế toán thấy tất cả."""
    limit = max(1, min(limit, 500))
    if user.role == "receptionist":
        sql = "SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT ?"
        params: tuple = (user.id, limit)
    else:
        sql = "SELECT * FROM jobs ORDER BY id DESC LIMIT ?"
        params = (limit,)
    out: list[JobSummary] = []
    for row in conn.execute(sql, params).fetchall():
        n_rows = len(json.loads(row["result_json"])) if row["result_json"] else 0
        out.append(JobSummary(
            id=row["id"], status=row["status"], stage=row["stage"], error=row["error"],
            rotate=row["rotate"], cancelled=bool(row["cancelled"]), n_rows=n_rows,
            image_path=f"/api/ocr/image/{row['id']}",
            created_at=row["created_at"], finished_at=row["finished_at"],
        ))
    return out


@router.get("/jobs/{job_id}", response_model=JobResult)
def get_job(
    job_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, row["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền xem job này")

    rows: list[OcrRow] = []
    if row["result_json"]:
        rows = [OcrRow(**r) for r in json.loads(row["result_json"])]

    return JobResult(
        job_id=row["id"],
        status=row["status"],
        stage=row["stage"],
        rotate=row["rotate"],
        cancelled=bool(row["cancelled"]),
        image_path=f"/api/ocr/image/{row['id']}",
        rows=rows,
        error=row["error"],
    )


@router.post("/jobs/{job_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_job(
    job_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Ngưng job. Job 'queued' -> dừng ngay; 'processing' -> đánh dấu, worker bỏ kết quả."""
    row = conn.execute("SELECT user_id, status FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, row["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền với job này")
    if row["status"] not in ("queued", "processing"):
        raise HTTPException(status_code=409, detail="Job đã xong, không thể ngưng")

    if row["status"] == "queued":
        # Chưa chạy -> dừng hẳn, rời hàng đợi luôn.
        conn.execute(
            "UPDATE jobs SET cancelled=1, status='failed', stage=NULL, error='Đã ngưng', "
            "finished_at=datetime('now') WHERE id=?",
            (job_id,),
        )
    else:
        # Đang chạy -> đặt cờ + báo worker ngắt stream Ollama ngay (giải phóng GPU).
        conn.execute("UPDATE jobs SET cancelled=1 WHERE id=?", (job_id,))
        from ..jobs.worker import worker
        worker.request_cancel(job_id)
    log_activity(conn, user, "ocr.cancel", target_type="job", target_id=job_id)
    conn.commit()


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    also_delete_transactions: bool = Query(False, description="Xóa luôn chứng từ liên kết với job này"),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(require_roles("admin")),
):
    """Xóa 1 mục lịch sử (chỉ admin). Mặc định tách liên kết chứng từ; nếu also_delete_transactions=true thì xóa luôn chứng từ."""
    row = conn.execute("SELECT status, image_path FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")

    # Nếu lỡ đang chạy -> ngắt worker (giải phóng GPU) rồi xóa luôn.
    if row["status"] == "processing":
        from ..jobs.worker import worker
        worker.request_cancel(job_id)

    if also_delete_transactions:
        conn.execute("DELETE FROM transactions WHERE job_id=?", (job_id,))
    else:
        conn.execute("UPDATE transactions SET job_id=NULL WHERE job_id=?", (job_id,))
    conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    log_activity(
        conn,
        user,
        "ocr.delete",
        target_type="job",
        target_id=job_id,
        detail={"also_delete_transactions": also_delete_transactions},
    )
    conn.commit()

    if row["image_path"]:
        try:
            Path(row["image_path"]).unlink(missing_ok=True)
        except OSError:
            pass


@router.post("/jobs/{job_id}/reocr", response_model=JobResult)
def reocr_job(
    job_id: int,
    body: ReocrRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Chạy lại OCR trên ảnh cũ (tùy chọn xoay góc khác). Worker sẽ xử lý lại."""
    row = conn.execute("SELECT user_id, status FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, row["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền với job này")
    if row["status"] == "processing":
        raise HTTPException(status_code=409, detail="Job đang được xử lý, chờ xong rồi thử lại")
    if body.rotate is not None and body.rotate not in _VALID_ROTATE:
        raise HTTPException(status_code=400, detail="Góc xoay phải là 0/90/180/270")

    # Đặt lại job về hàng đợi, xóa kết quả + cờ ngưng; rotate=None -> giữ góc đang lưu.
    if body.rotate is None:
        conn.execute(
            "UPDATE jobs SET status='queued', stage=NULL, cancelled=0, result_json=NULL, "
            "raw_ocr_json=NULL, error=NULL, started_at=NULL, finished_at=NULL, duration_ms=NULL WHERE id=?",
            (job_id,),
        )
    else:
        conn.execute(
            "UPDATE jobs SET status='queued', stage=NULL, cancelled=0, result_json=NULL, "
            "raw_ocr_json=NULL, error=NULL, started_at=NULL, finished_at=NULL, duration_ms=NULL, "
            "rotate=? WHERE id=?",
            (body.rotate, job_id),
        )
    log_activity(conn, user, "ocr.reocr", target_type="job", target_id=job_id, detail={"rotate": body.rotate})
    conn.commit()
    full = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return JobResult(
        job_id=full["id"], status=full["status"], stage=full["stage"], rotate=full["rotate"],
        image_path=f"/api/ocr/image/{full['id']}", rows=[], error=full["error"],
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
