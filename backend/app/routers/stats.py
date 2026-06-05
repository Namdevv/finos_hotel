"""Thống kê / báo cáo — chỉ admin & kế toán (lễ tân không xem báo cáo tổng)."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..database import get_connection
from ..deps import require_roles
from ..models import StatsBucket, StatsSummary

router = APIRouter(prefix="/api/stats", tags=["stats"])
viewer = require_roles("admin", "accountant")


def _date_filter(date_from: Optional[str], date_to: Optional[str]) -> tuple[str, list]:
    sql, params = "", []
    if date_from:
        sql += " AND txn_date >= ?"; params.append(date_from)
    if date_to:
        sql += " AND txn_date <= ?"; params.append(date_to)
    return sql, params


@router.get("/summary", response_model=StatsSummary)
def summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    conn: sqlite3.Connection = Depends(get_connection),
    _=Depends(viewer),
):
    flt, params = _date_filter(date_from, date_to)
    row = conn.execute(
        "SELECT "
        "COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS inc, "
        "COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS exp, "
        "COUNT(*) AS cnt "
        f"FROM transactions WHERE 1=1{flt}",
        params,
    ).fetchone()
    inc, exp = row["inc"], row["exp"]
    return StatsSummary(total_income=inc, total_expense=exp, balance=inc - exp, count=row["cnt"])


@router.get("/timeseries", response_model=list[StatsBucket])
def timeseries(
    group: str = Query("day", pattern="^(day|month)$"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    conn: sqlite3.Connection = Depends(get_connection),
    _=Depends(viewer),
):
    period_expr = "txn_date" if group == "day" else "substr(txn_date,1,7)"
    flt, params = _date_filter(date_from, date_to)
    rows = conn.execute(
        f"SELECT {period_expr} AS period, "
        "COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS inc, "
        "COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS exp "
        f"FROM transactions WHERE 1=1{flt} "
        "GROUP BY period ORDER BY period",
        params,
    ).fetchall()
    return [StatsBucket(period=r["period"], income=r["inc"], expense=r["exp"]) for r in rows]
