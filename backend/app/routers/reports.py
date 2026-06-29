"""Báo cáo Excel theo tháng — danh sách / tạo ngay / tải về / xóa.

Báo cáo chỉ tổng hợp lại bảng `transactions` (dữ liệu đã duyệt). Xem/tạo dành
cho admin & kế toán (giống quyền xem thống kê); xóa chỉ admin.
"""
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from ..audit import log_activity
from ..database import get_connection
from ..deps import require_roles
from ..models import ReportGenerateRequest, ReportOut, UserOut
from ..reports import generate_report, report_filename

router = APIRouter(prefix="/api/reports", tags=["reports"])

viewer = require_roles("admin", "accountant")
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _row_to_report(row: sqlite3.Row) -> ReportOut:
    return ReportOut(
        id=row["id"],
        period=row["period"],
        title=row["title"],
        total_income=row["total_income"],
        total_expense=row["total_expense"],
        balance=row["balance"],
        txn_count=row["txn_count"],
        auto=bool(row["auto"]),
        generated_by=row["generated_by"],
        generated_by_name=row["generated_by_name"] or "",
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=list[ReportOut])
def list_reports(
    conn: sqlite3.Connection = Depends(get_connection),
    _: UserOut = Depends(viewer),
):
    rows = conn.execute(
        "SELECT r.*, COALESCE(u.full_name, u.username, '') AS generated_by_name "
        "FROM reports r LEFT JOIN users u ON u.id = r.generated_by "
        "ORDER BY r.period DESC"
    ).fetchall()
    return [_row_to_report(r) for r in rows]


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    body: ReportGenerateRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(viewer),
):
    """Tạo (hoặc tạo lại) báo cáo cho kỳ chỉ định ngay lập tức."""
    try:
        conn.execute("BEGIN IMMEDIATE")
        report_id = generate_report(conn, body.period, user=user, auto=False)
        conn.commit()
    except ValueError as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        conn.rollback()
        raise
    row = conn.execute(
        "SELECT r.*, COALESCE(u.full_name, u.username, '') AS generated_by_name "
        "FROM reports r LEFT JOIN users u ON u.id = r.generated_by WHERE r.id = ?",
        (report_id,),
    ).fetchone()
    return _row_to_report(row)


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    _: UserOut = Depends(viewer),
):
    row = conn.execute(
        "SELECT period, file_path FROM reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo")
    p = Path(row["file_path"])
    if not p.exists():
        raise HTTPException(status_code=404, detail="File báo cáo không tồn tại, hãy tạo lại")
    return FileResponse(p, media_type=_XLSX_MIME, filename=report_filename(row["period"]))


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(require_roles("admin")),
):
    row = conn.execute(
        "SELECT period, file_path FROM reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo")
    conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    log_activity(conn, user, "report.delete", target_type="report", target_id=report_id,
                 detail={"period": row["period"]})
    conn.commit()
    if row["file_path"]:
        try:
            Path(row["file_path"]).unlink(missing_ok=True)
        except OSError:
            pass
