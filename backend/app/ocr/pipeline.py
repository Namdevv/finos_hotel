"""Pipeline OCR: ảnh sổ -> các dòng chứng từ THU đề xuất (để người dùng duyệt).

Dùng VLM (Ollama + Qwen2.5-VL, xem vlm.py) đọc tổng thể trang sổ, lấy:
  - phòng (cột PHÒNG)
  - tiền  (cột TỔNG TIỀN, số khoanh tròn) — quy ước nghìn (×1.000), luôn là THU
  - ngày  = ngày upload (không đọc cột NGÀY trong ảnh)

Kết quả là ĐỀ XUẤT để người dùng duyệt/sửa trên trang Review, KHÔNG ghi thẳng
vào sổ kế toán.
"""
from __future__ import annotations

import re
from typing import Callable, Optional

from ..timezone import local_today
from .vlm import extract_rows

# Confidence gán cho field đọc được (VLM không trả điểm tin cậy riêng từng ô).
# Field rỗng (đọc không ra) -> để 0.0 cho UI tô vàng "kiểm tra". Xem LOW_CONF (FE).
_CONF_OK = 0.9
_CONF_EMPTY = 0.0


def _ledger_amount(token: str) -> int | None:
    """Quy số tiền ghi trong sổ ra VND theo quy ước 'nghìn'.

    - '60'  -> 60.000      (số trần 1-3 chữ số = đơn vị nghìn)
    - '180' -> 180.000
    - '100' -> 100.000
    - '1.200.000' / '180000' -> giữ nguyên (đã ghi đủ số đồng)
    """
    s = str(token).strip().lower()
    digits = re.sub(r"\D", "", s)
    if not digits or int(digits) == 0:
        return None
    # Có dấu phân tách ngàn -> coi như đã ghi đủ số đồng.
    if re.search(r"\d[.,]\d{3}", s):
        return int(re.sub(r"\D", "", s))
    n = int(digits)
    # Số trần ngắn (<=3 chữ số) hiểu theo đơn vị nghìn.
    return n * 1000 if n < 10_000 else n


def _to_record(raw: dict, *, today_iso: str) -> dict | None:
    """Biến 1 mục {phong, tien} từ VLM thành bản ghi THU đề xuất (shape OcrRow)."""
    amount = _ledger_amount(raw.get("tien", ""))
    if amount is None:
        return None  # không có tiền -> bỏ (tiêu đề/nhiễu)
    room = re.sub(r"\D", "", str(raw.get("phong", "")))
    room_conf = _CONF_OK if room else _CONF_EMPTY
    return {
        "txn_date": {"value": today_iso, "confidence": 1.0},  # ngày upload, chắc chắn
        "room": {"value": room, "confidence": room_conf},
        "note": {"value": "", "confidence": 1.0},
        "kind": "income",
        "amount": {"value": str(amount), "confidence": _CONF_OK},
        "min_confidence": round(min(room_conf, _CONF_OK), 3),
    }


def run_ocr(
    image_path: str,
    *,
    on_stage: Optional[Callable[[str], None]] = None,
    rotate: Optional[int] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> dict:
    """Chạy VLM trên 1 ảnh, trả:
      - rows: danh sách bản ghi đề xuất (cho người dùng duyệt)
      - raw : chuỗi JSON gốc model trả về (để truy vết khi sai)

    on_stage(stage): callback báo giai đoạn ('preparing'|'recognizing'|'parsing')
    để UI theo dõi tiến trình. rotate: góc xoay riêng cho lần chạy (re-OCR).
    should_cancel(): trả True để ngắt giữa chừng (ném OcrCancelled).
    """
    items, raw_response = extract_rows(
        image_path, on_stage=on_stage, rotate=rotate, should_cancel=should_cancel
    )
    if on_stage:
        on_stage("parsing")
    today_iso = local_today().isoformat()
    rows = [r for r in (_to_record(it, today_iso=today_iso) for it in items) if r]
    return {"rows": rows, "raw": raw_response}
