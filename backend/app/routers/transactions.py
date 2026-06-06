"""CRUD chứng từ/giao dịch đã được DUYỆT."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..database import get_connection
from ..deps import get_current_user, require_roles
from ..models import BulkDeleteRequest, TransactionCreate, TransactionOut, TransactionUpdate, UserOut

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
editor = require_roles("admin", "accountant")


def _row_to_txn(row: sqlite3.Row) -> TransactionOut:
    return TransactionOut(
        id=row["id"], txn_date=row["txn_date"], room=row["room"], note=row["note"],
        kind=row["kind"], amount=row["amount"], source=row["source"],
        job_id=row["job_id"], image_path=row["image_path"],
        created_by=row["created_by"], created_at=row["created_at"],
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    kind: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    conn: sqlite3.Connection = Depends(get_connection),
    _: UserOut = Depends(get_current_user),
):
    sql = "SELECT * FROM transactions WHERE 1=1"
    params: list = []
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
    cur = conn.execute(
        "INSERT INTO transactions (txn_date, room, note, kind, amount, source, job_id, image_path, created_by) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (body.txn_date, body.room, body.note, body.kind, body.amount,
         body.source, body.job_id, body.image_path, user.id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _row_to_txn(row)


@router.patch("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int, body: TransactionUpdate,
    conn: sqlite3.Connection = Depends(get_connection), _: UserOut = Depends(editor),
):
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
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
        conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    return _row_to_txn(row)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_transactions(
    body: BulkDeleteRequest,
    conn: sqlite3.Connection = Depends(get_connection),
    _: UserOut = Depends(editor),
):
    if not body.ids:
        return
    placeholders = ",".join("?" * len(body.ids))
    conn.execute(f"DELETE FROM transactions WHERE id IN ({placeholders})", body.ids)
    conn.commit()


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int, conn: sqlite3.Connection = Depends(get_connection), _: UserOut = Depends(editor),
):
    conn.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
    conn.commit()
