"""CRUD chứng từ/giao dịch đã được DUYỆT."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..audit import log_activity
from ..database import get_connection
from ..deps import get_current_user, require_roles
from ..models import BulkDeleteRequest, TransactionCreate, TransactionOut, TransactionUpdate, UserOut
from ..notify import notify_admins

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
editor = require_roles("admin", "accountant", "receptionist")
deleter = require_roles("admin", "accountant")


def _fmt_vnd(amount: int) -> str:
    """120000 -> '120.000 đ' (định dạng VN cho nội dung thông báo)."""
    return f"{amount:,.0f}".replace(",", ".") + " đ"


def _row_to_txn(row: sqlite3.Row) -> TransactionOut:
    return TransactionOut(
        id=row["id"], txn_date=row["txn_date"], room=row["room"], note=row["note"],
        kind=row["kind"], amount=row["amount"], source=row["source"],
        job_id=row["job_id"], image_path=row["image_path"],
        created_by=row["created_by"], created_at=row["created_at"],
        deleted_at=row["deleted_at"] if "deleted_at" in row.keys() else None,
        deleted_by=row["deleted_by"] if "deleted_by" in row.keys() else None,
    )


def _validated_image_path(conn: sqlite3.Connection, body: TransactionCreate, user: UserOut) -> str | None:
    if body.source == "manual":
        if body.job_id is not None:
            raise HTTPException(status_code=400, detail="Chứng từ thủ công không được gắn job OCR")
        return body.image_path
    if body.job_id is None:
        raise HTTPException(status_code=400, detail="Chứng từ OCR phải có job_id")

    job = conn.execute("SELECT id, user_id, status FROM jobs WHERE id=?", (body.job_id,)).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy job OCR")
    if user.role == "receptionist" and job["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền với job OCR này")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job OCR chưa xong, không thể tạo chứng từ")
    return f"/api/ocr/image/{body.job_id}"


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    kind: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    limit: int = Query(200, le=1000),
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),
):
    sql = "SELECT * FROM transactions WHERE 1=1"
    params: list = []
    if not include_deleted or user.role != "admin":
        sql += " AND deleted_at IS NULL"
    if date_from:
        sql += " AND txn_date >= ?"; params.append(date_from)
    if date_to:
        sql += " AND txn_date <= ?"; params.append(date_to)
    if kind in ("income", "expense"):
        sql += " AND kind = ?"; params.append(kind)
    sql += " ORDER BY txn_date DESC, id DESC LIMIT ?"; params.append(limit)
    return [_row_to_txn(r) for r in conn.execute(sql, params).fetchall()]


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(get_current_user),  # mọi vai trò đều được thêm chứng từ
):
    image_path = _validated_image_path(conn, body, user)
    cur = conn.execute(
        "INSERT INTO transactions (txn_date, room, note, kind, amount, source, job_id, image_path, created_by) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (body.txn_date, body.room, body.note, body.kind, body.amount,
         body.source, body.job_id, image_path, user.id),
    )
    log_activity(
        conn,
        user,
        "transaction.create",
        target_type="transaction",
        target_id=cur.lastrowid,
        detail={"kind": body.kind, "amount": body.amount, "source": body.source},
    )
    kind_vn = "thu" if body.kind == "income" else "chi"
    notify_admins(
        conn,
        type="transaction.create",
        level="success" if body.kind == "income" else "info",
        title=f"Chứng từ {kind_vn} mới",
        body=f"{user.full_name or user.username} vừa tạo chứng từ {kind_vn} {_fmt_vnd(body.amount)}"
             + (f" — {body.room}" if body.room else ""),
        link="/transactions",
        actor=user,
        target_type="transaction",
        target_id=cur.lastrowid,
        event_key_prefix=f"transaction.create:{cur.lastrowid}",
    )
    conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _row_to_txn(row)


@router.patch("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int, body: TransactionUpdate,
    conn: sqlite3.Connection = Depends(get_connection), user: UserOut = Depends(editor),
):
    row = conn.execute("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL", (txn_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy chứng từ")

    fields, values = [], []
    for col in ("txn_date", "room", "note", "kind", "amount"):
        val = getattr(body, col)
        if val is not None:
            fields.append(f"{col} = ?"); values.append(val)
    if fields:
        fields.append("updated_at = datetime('now')")
        values.append(txn_id)
        conn.execute(f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?", values)
        log_activity(
            conn,
            user,
            "transaction.update",
            target_type="transaction",
            target_id=txn_id,
            detail={"fields": [f.split(" = ")[0] for f in fields if " = " in f]},
        )
        conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    return _row_to_txn(row)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_transactions(
    body: BulkDeleteRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    user: UserOut = Depends(deleter),
):
    if not body.ids:
        return
    placeholders = ",".join("?" * len(body.ids))
    if user.role == "admin":
        conn.execute(f"DELETE FROM transactions WHERE id IN ({placeholders})", body.ids)
        action = "transaction.hard_delete_bulk"
    else:
        conn.execute(
            f"UPDATE transactions SET deleted_at=datetime('now'), deleted_by=? "
            f"WHERE deleted_at IS NULL AND id IN ({placeholders})",
            [user.id, *body.ids],
        )
        action = "transaction.soft_delete_bulk"
    log_activity(conn, user, action, target_type="transaction", detail={"ids": body.ids})
    notify_admins(
        conn,
        type="transaction.delete",
        level="warning",
        title="Xóa nhiều chứng từ",
        body=f"{user.full_name or user.username} vừa xóa {len(body.ids)} chứng từ",
        link="/transactions",
        actor=user,
        target_type="transaction",
        event_key_prefix="transaction.delete.bulk:" + ",".join(map(str, sorted(body.ids))),
    )
    conn.commit()


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int, conn: sqlite3.Connection = Depends(get_connection), user: UserOut = Depends(deleter),
):
    if user.role == "admin":
        conn.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
        action = "transaction.hard_delete"
    else:
        conn.execute(
            "UPDATE transactions SET deleted_at=datetime('now'), deleted_by=? "
            "WHERE id = ? AND deleted_at IS NULL",
            (user.id, txn_id),
        )
        action = "transaction.soft_delete"
    log_activity(conn, user, action, target_type="transaction", target_id=txn_id)
    notify_admins(
        conn,
        type="transaction.delete",
        level="warning",
        title="Xóa chứng từ",
        body=f"{user.full_name or user.username} vừa xóa chứng từ #{txn_id}",
        link="/transactions",
        actor=user,
        target_type="transaction",
        target_id=txn_id,
        event_key_prefix=f"transaction.delete:{txn_id}:{action}",
    )
    conn.commit()
