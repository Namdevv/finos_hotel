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
from ..models import (
    JobOut,
    JobResult,
    JobSummary,
    OcrCommitRequest,
    OcrRow,
    ReocrRequest,
    TransactionOut,
    UserOut,
)
from ..notify import notify_admins

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_VALID_ROTATE = {0, 90, 180, 270}
_THUMB_MAX = 480  # cạnh dài tối đa (px) của ảnh thu nhỏ cho lưới Thư viện
# Bytes ảnh của 1 job không bao giờ đổi -> cho trình duyệt cache vĩnh viễn.
_IMG_CACHE_HEADERS = {"Cache-Control": "private, max-age=31536000, immutable"}


def _thumb_path(job_id: int) -> Path:
    return get_settings().upload_path / "thumbs" / f"{job_id}.jpg"


def _ensure_thumb(job_id: int, src: Path) -> Path | None:
    """Tạo (nếu chưa có / cũ hơn ảnh gốc) ảnh thu nhỏ JPEG, cache ra đĩa.

    Trả về đường dẫn thumbnail, hoặc None nếu tạo lỗi -> caller fallback ảnh gốc.
    """
    dst = _thumb_path(job_id)
    try:
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            return dst
        from PIL import Image, ImageOps

        dst.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)  # tôn trọng hướng EXIF như trình duyệt
            im.thumbnail((_THUMB_MAX, _THUMB_MAX))
            im.convert("RGB").save(dst, "JPEG", quality=80, optimize=True)
        return dst
    except Exception:
        return None


def _can_access(user: UserOut, owner_id: int) -> bool:
    """Lễ tân chỉ thao tác job của mình; admin/kế toán xem mọi job."""
    return user.role != "receptionist" or owner_id == user.id


def _row_to_txn(row: sqlite3.Row) -> TransactionOut:
    return TransactionOut(
        id=row["id"], txn_date=row["txn_date"], room=row["room"], note=row["note"],
        kind=row["kind"], amount=row["amount"], source=row["source"],
        job_id=row["job_id"], image_path=row["image_path"],
        created_by=row["created_by"], created_at=row["created_at"],
        deleted_at=row["deleted_at"] if "deleted_at" in row.keys() else None,
        deleted_by=row["deleted_by"] if "deleted_by" in row.keys() else None,
    )


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
    try:
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
            event_key_prefix=f"ocr.upload:{cur.lastrowid}",
        )
        conn.commit()
    except Exception:
        conn.rollback()
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (cur.lastrowid,)).fetchone()
    return JobOut(id=row["id"], status=row["status"], created_at=row["created_at"])


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(
    limit: int = 100,
    before_id: int | None = Query(default=None, description="Phân trang theo cuộn: chỉ lấy job có id nhỏ hơn giá trị này"),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Thư viện ảnh đã upload. Lễ tân thấy của mình; admin/kế toán thấy tất cả.

    Sắp xếp id DESC; truyền before_id = id mục cuối trang trước để tải tiếp (cursor).
    """
    limit = max(1, min(limit, 500))
    # reviewed: job đã có chứng từ (chưa xóa) được lưu -> đã được người kiểm duyệt.
    base = (
        "SELECT j.*, EXISTS(SELECT 1 FROM transactions t "
        "WHERE t.job_id = j.id AND t.deleted_at IS NULL) AS reviewed FROM jobs j"
    )
    where: list[str] = []
    params: list = []
    if user.role == "receptionist":
        where.append("j.user_id = ?")
        params.append(user.id)
    if before_id is not None:
        where.append("j.id < ?")
        params.append(before_id)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""
    sql = f"{base}{where_sql} ORDER BY j.id DESC LIMIT ?"
    params.append(limit)
    out: list[JobSummary] = []
    for row in conn.execute(sql, params).fetchall():
        n_rows = len(json.loads(row["result_json"])) if row["result_json"] else 0
        out.append(JobSummary(
            id=row["id"], status=row["status"], stage=row["stage"], error=row["error"],
            rotate=row["rotate"], cancelled=bool(row["cancelled"]), n_rows=n_rows,
            reviewed=bool(row["reviewed"]),
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
        started_at=row["started_at"],
        rows=rows,
        error=row["error"],
    )


@router.post("/jobs/{job_id}/commit", response_model=list[TransactionOut], status_code=status.HTTP_201_CREATED)
def commit_job_rows(
    job_id: int,
    body: OcrCommitRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Lưu toàn bộ dòng OCR đã duyệt trong một transaction DB để tránh lưu nửa chừng."""
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, job["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền với job này")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job chưa OCR xong, không thể lưu chứng từ")

    txn_ids: list[int] = []
    try:
        conn.execute("BEGIN IMMEDIATE")
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy job")
        if job["status"] != "done":
            raise HTTPException(status_code=409, detail="Job chưa OCR xong, không thể lưu chứng từ")
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM transactions WHERE job_id=? AND deleted_at IS NULL",
            (job_id,),
        ).fetchone()["c"]
        if existing:
            raise HTTPException(status_code=409, detail="Job này đã được lưu thành chứng từ")

        for row in body.rows:
            cur = conn.execute(
                "INSERT INTO transactions (txn_date, room, note, kind, amount, source, job_id, image_path, created_by) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    row.txn_date, row.room, row.note, row.kind, row.amount,
                    "ocr", job_id, f"/api/ocr/image/{job_id}", user.id,
                ),
            )
            txn_ids.append(cur.lastrowid)

        log_activity(
            conn,
            user,
            "transaction.create",
            target_type="job",
            target_id=job_id,
            detail={"source": "ocr", "count": len(txn_ids), "job_id": job_id},
        )
        notify_admins(
            conn,
            type="transaction.create",
            level="success",
            title="Đã lưu chứng từ OCR",
            body=f"{user.full_name or user.username} vừa lưu {len(txn_ids)} chứng từ từ ảnh sổ #{job_id}",
            link="/transactions",
            actor=user,
            target_type="job",
            target_id=job_id,
            event_key_prefix=f"transaction.create:ocr:{job_id}",
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    placeholders = ",".join("?" * len(txn_ids))
    rows = conn.execute(
        f"SELECT * FROM transactions WHERE id IN ({placeholders}) ORDER BY id",
        txn_ids,
    ).fetchall()
    return [_row_to_txn(row) for row in rows]


@router.get("/jobs/{job_id}/transactions", response_model=list[TransactionOut])
def list_job_transactions(
    job_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Chứng từ (chưa xóa) đã lưu từ ảnh này — để xem lại đúng dữ liệu đã duyệt, không phải OCR gốc."""
    job = conn.execute("SELECT user_id FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, job["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền với job này")
    rows = conn.execute(
        "SELECT * FROM transactions WHERE job_id = ? AND deleted_at IS NULL ORDER BY id",
        (job_id,),
    ).fetchall()
    return [_row_to_txn(row) for row in rows]


@router.put("/jobs/{job_id}/transactions", response_model=list[TransactionOut])
def replace_job_transactions(
    job_id: int,
    body: OcrCommitRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    """Cập nhật lại toàn bộ chứng từ đã lưu từ ảnh này (thay cho bản cũ) trong một transaction DB.

    Dùng khi mở lại ảnh đã lưu để sửa: bản trên màn hình trở thành bản chính thức.
    """
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job")
    if not _can_access(user, job["user_id"]):
        raise HTTPException(status_code=403, detail="Không có quyền với job này")

    txn_ids: list[int] = []
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM transactions WHERE job_id=? AND deleted_at IS NULL",
            (job_id,),
        ).fetchone()["c"]
        if not existing:
            raise HTTPException(status_code=409, detail="Ảnh này chưa được lưu thành chứng từ")
        # Bỏ bản cũ rồi ghi lại bản đã sửa — giữ bảng transactions sạch (chỉ dữ liệu đang duyệt).
        conn.execute("DELETE FROM transactions WHERE job_id=?", (job_id,))
        for row in body.rows:
            cur = conn.execute(
                "INSERT INTO transactions (txn_date, room, note, kind, amount, source, job_id, image_path, created_by) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    row.txn_date, row.room, row.note, row.kind, row.amount,
                    "ocr", job_id, f"/api/ocr/image/{job_id}", user.id,
                ),
            )
            txn_ids.append(cur.lastrowid)
        log_activity(
            conn,
            user,
            "transaction.update",
            target_type="job",
            target_id=job_id,
            detail={"source": "ocr", "count": len(txn_ids), "job_id": job_id, "replaced": True},
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    placeholders = ",".join("?" * len(txn_ids))
    rows = conn.execute(
        f"SELECT * FROM transactions WHERE id IN ({placeholders}) ORDER BY id",
        txn_ids,
    ).fetchall()
    return [_row_to_txn(row) for row in rows]


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
    try:
        _thumb_path(job_id).unlink(missing_ok=True)
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
    thumb: bool = Query(False, description="Trả ảnh thu nhỏ (nhẹ) cho lưới Thư viện"),
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
    if thumb:
        t = _ensure_thumb(job_id, p)
        if t is not None:
            return FileResponse(t, media_type="image/jpeg", headers=_IMG_CACHE_HEADERS)
    return FileResponse(p, headers=_IMG_CACHE_HEADERS)
