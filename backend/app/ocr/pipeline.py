"""Pipeline OCR đầy đủ: ảnh -> các dòng chứng từ đề xuất (kèm confidence).

Lưu ý quan trọng: kết quả là ĐỀ XUẤT để người dùng duyệt/sửa, KHÔNG ghi thẳng
vào sổ. Mỗi field có confidence để UI highlight chỗ cần kiểm.
"""
from __future__ import annotations

import statistics
from dataclasses import asdict

from .engine import Word, engine
from .parse import (
    extract_amount,
    extract_date,
    extract_room,
    guess_kind,
)
from .preprocess import load_image, preprocess


def _group_rows(words: list[Word]) -> list[list[Word]]:
    """Gom các word thành dòng dựa trên tâm y."""
    if not words:
        return []
    heights = [w.y1 - w.y0 for w in words if w.y1 > w.y0]
    line_gap = (statistics.median(heights) if heights else 20) * 0.7

    rows: list[list[Word]] = []
    for w in sorted(words, key=lambda x: x.cy):
        if rows and abs(w.cy - statistics.mean([x.cy for x in rows[-1]])) <= line_gap:
            rows[-1].append(w)
        else:
            rows.append([w])
    return rows


def _strip_spans(text: str, spans: list[tuple[int, int] | None]) -> str:
    """Xóa các đoạn (date, amount) khỏi chuỗi để phần còn lại là phòng + nội dung."""
    keep = [True] * len(text)
    for span in spans:
        if span:
            for i in range(span[0], min(span[1], len(text))):
                keep[i] = False
    return "".join(c for c, k in zip(text, keep) if k)


def _row_to_record(row: list[Word], *, default_kind: str = "income") -> dict | None:
    """Biến một dòng (gồm 1+ box OCR) thành 1 bản ghi chứng từ đề xuất.

    RapidOCR thường trả cả dòng là 1 box, nên ta GHÉP text theo thứ tự x rồi
    parse field bằng regex trên cả chuỗi (không dựa vào tọa độ cột).
    """
    row = sorted(row, key=lambda w: w.cx)
    line_text = " ".join(w.text for w in row).strip()
    if not line_text:
        return None

    # Confidence của dòng = nhỏ nhất trong các box góp mặt (thận trọng).
    row_conf = round(min(w.confidence for w in row), 3)

    date_val, date_span = extract_date(line_text)
    amount_val, amount_span = extract_amount(line_text)

    # Bỏ dòng không có tiền -> nhiều khả năng là tiêu đề/ghi chú/nhiễu.
    if amount_val is None:
        return None

    remainder = _strip_spans(line_text, [date_span, amount_span])
    room = extract_room(remainder)
    note = " ".join(remainder.replace(room, " ", 1).split()).strip() if room else " ".join(remainder.split())

    kind = guess_kind(line_text) or default_kind

    record = {
        "txn_date": {"value": date_val or "", "confidence": row_conf},
        "room": {"value": room, "confidence": row_conf},
        "note": {"value": note, "confidence": row_conf},
        "kind": kind,
        "amount": {"value": str(amount_val), "confidence": row_conf},
        "min_confidence": row_conf,
    }
    return record


def run_ocr(image_path: str) -> dict:
    """Chạy toàn bộ pipeline trên 1 ảnh.

    Trả về dict gồm:
      - rows: danh sách bản ghi đề xuất (cho người dùng duyệt)
      - raw: text OCR thô + bbox (để truy vết)
    """
    img = load_image(image_path)
    img = preprocess(img)
    words: list[Word] = engine.recognize(img)

    raw = [
        {"text": w.text, "confidence": round(w.confidence, 3),
         "box": [round(w.x0), round(w.y0), round(w.x1), round(w.y1)]}
        for w in words
    ]

    rows: list[dict] = []
    for group in _group_rows(words):
        rec = _row_to_record(group)
        if rec is not None:
            rows.append(rec)

    return {"rows": rows, "raw": raw}
