"""Chuẩn hóa field bằng rule-based + regex (không dùng LLM).

Xử lý các kiểu ghi tiền/ngày thường gặp trong sổ khách sạn Việt Nam.
"""
from __future__ import annotations

import datetime as dt
import re

# ----- Số tiền -----------------------------------------------------------------
# Bắt: 1.200.000 | 1,200,000 | 1200000 | 500k | 1tr2 | 1.5tr | 2 tr
_MONEY_TOKEN = re.compile(r"[\d.,]+\s*(?:tr|k|tỷ|ty)?", re.IGNORECASE)


def parse_amount(text: str) -> int | None:
    """Trả về số tiền VND (int) hoặc None nếu không nhận ra."""
    if not text:
        return None
    s = text.strip().lower().replace(" ", "")
    s = s.replace("đ", "").replace("vnd", "").replace("vnđ", "")

    # 1tr2 / 1.5tr / 2tr -> triệu
    m = re.fullmatch(r"(\d+)(?:[.,](\d+))?tr(\d+)?", s)
    if m:
        whole = int(m.group(1))
        frac = m.group(2)
        tail = m.group(3)
        value = whole * 1_000_000
        if frac:
            value += int(round(float("0." + frac) * 1_000_000))
        elif tail:  # "1tr2" = 1.200.000
            value += int(tail) * 100_000
        return value

    # 500k -> nghìn
    m = re.fullmatch(r"(\d+)(?:[.,](\d+))?k", s)
    if m:
        whole = int(m.group(1))
        frac = m.group(2)
        value = whole * 1_000
        if frac:
            value += int(round(float("0." + frac) * 1_000))
        return value

    # tỷ
    m = re.fullmatch(r"(\d+)(?:[.,](\d+))?(?:tỷ|ty)", s)
    if m:
        whole = int(m.group(1))
        frac = m.group(2)
        value = whole * 1_000_000_000
        if frac:
            value += int(round(float("0." + frac) * 1_000_000_000))
        return value

    # Chỉ còn chữ số + dấu phân tách ngàn (. hoặc ,) -> bỏ hết dấu phân tách
    digits = re.sub(r"[.,](?=\d{3}\b)", "", s)  # bỏ dấu đứng trước đúng 3 số
    digits = re.sub(r"[.,]", "", digits)
    if digits.isdigit():
        return int(digits)
    return None


def looks_like_money(text: str) -> bool:
    s = text.strip().lower()
    if not s:
        return False
    if re.search(r"\d", s) and re.search(r"(tr|k|tỷ|\d[.,]\d{3})", s):
        return True
    # chuỗi toàn số dài (>=4 chữ số) cũng coi là tiền
    digits = re.sub(r"\D", "", s)
    return len(digits) >= 4


# Tìm token tiền trong MỘT CHUỖI DÒNG (RapidOCR trả cả dòng là 1 box).
_MONEY_FINDER = re.compile(r"\d[\d.,]*\s*(?:tr\d*|k|tỷ|ty)?", re.IGNORECASE)


def extract_amount(text: str) -> tuple[int | None, tuple[int, int] | None]:
    """Trích số tiền lớn nhất hợp lệ trong chuỗi dòng.

    Trả (giá trị VND, (start, end) vị trí trong chuỗi) hoặc (None, None).
    Chỉ nhận token TRÔNG NHƯ tiền (>=4 chữ số hoặc có tr/k/dấu ngàn) để
    tránh nhầm số phòng '101' thành tiền.
    """
    best_val, best_span = None, None
    for m in _MONEY_FINDER.finditer(text):
        tok = m.group().strip()
        if not looks_like_money(tok):
            continue
        v = parse_amount(tok)
        if v is not None and (best_val is None or v > best_val):
            best_val, best_span = v, m.span()
    return best_val, best_span


def extract_date(text: str, *, today: dt.date | None = None) -> tuple[str | None, tuple[int, int] | None]:
    """Trích ngày đầu tiên trong chuỗi dòng; trả (ISO, span) hoặc (None, None)."""
    today = today or dt.date.today()
    m = _DATE_PATTERNS[0].search(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return _safe_date(y, mo, d), m.span()
    m = _DATE_PATTERNS[1].search(text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        return _safe_date(today.year, mo, d), m.span()
    return None, None


# Token số phòng: P101, 101, A12... (2-4 chữ số, có thể kèm 1 chữ cái đầu).
_ROOM_FINDER = re.compile(r"\b([A-Za-zP][.\-]?\d{1,4}|\d{2,4})\b")


def extract_room(text: str) -> str:
    m = _ROOM_FINDER.search(text)
    return m.group(1) if m else ""


# ----- Ngày --------------------------------------------------------------------
_DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b"),  # dd/mm/yyyy
    re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})\b"),                  # dd/mm
]


def parse_date(text: str, *, today: dt.date | None = None) -> str | None:
    """Trả về 'YYYY-MM-DD' hoặc None. Thiếu năm -> suy theo hôm nay."""
    if not text:
        return None
    today = today or dt.date.today()
    s = text.strip()

    m = _DATE_PATTERNS[0].search(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return _safe_date(y, mo, d)

    m = _DATE_PATTERNS[1].search(s)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        return _safe_date(today.year, mo, d)
    return None


def looks_like_date(text: str) -> bool:
    return any(p.search(text or "") for p in _DATE_PATTERNS)


def _safe_date(y: int, mo: int, d: int) -> str | None:
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


# ----- Phân loại thu/chi -------------------------------------------------------
_EXPENSE_HINTS = ("chi", "trả", "mua", "thanh toán", "chi phí", "tiền điện", "tiền nước", "lương")
_INCOME_HINTS = ("thu", "doanh thu", "đặt phòng", "tiền phòng", "nhận", "khách trả")


def guess_kind(text: str) -> str | None:
    s = (text or "").lower()
    if any(h in s for h in _EXPENSE_HINTS):
        return "expense"
    if any(h in s for h in _INCOME_HINTS):
        return "income"
    return None
