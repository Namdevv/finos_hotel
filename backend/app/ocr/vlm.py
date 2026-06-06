"""Trích chứng từ từ ảnh sổ bằng VLM (Ollama + Qwen2.5-VL).

Thay cho pipeline detect-box cũ (RapidOCR/PP-OCR) vốn bỏ sót số khoanh tròn +
yếu với chữ viết tay. VLM đọc TỔNG THỂ cả trang nên hiểu được bảng kẻ cột.

Ollama chạy ngoài tiến trình này (thường trên máy có GPU), ta chỉ gọi HTTP nên
backend giữ nhẹ — không cần torch/onnx/opencv. Chỉ phụ thuộc Pillow + stdlib.
"""
from __future__ import annotations

import base64
import io
import json
import urllib.request
from typing import Callable, Optional

from ..config import get_settings


class OcrCancelled(Exception):
    """Người dùng ngưng job trong lúc VLM đang chạy."""

# Prompt mô tả cấu trúc sổ + chỉ lấy phòng & tổng tiền (cột khoanh tròn).
_PROMPT = """Đây là ảnh một trang SỔ GHI TAY của khách sạn, dạng bảng kẻ cột.
Các cột từ trái sang phải: NGÀY, PHÒNG, GIỜ VÀO, GIỜ RA, KHÁCH (giờ/ngày), PHỤ THU, GIẤY TỜ, TỔNG TIỀN.
Cột TỔNG TIỀN là cột NGOÀI CÙNG BÊN PHẢI; các số ở đó thường được KHOANH TRÒN.

Nhiệm vụ: với MỖI DÒNG có khách (có số ở cột TỔNG TIỀN), trích đúng 2 thông tin:
- "phong": số phòng ở cột PHÒNG (vd 301, 302, 202). Chỉ lấy chữ số.
- "tien": con số ở cột TỔNG TIỀN (khoanh tròn, bên phải), GHI ĐÚNG NHƯ TRONG SỔ,
  chỉ chữ số, KHÔNG quy đổi (thấy "180" thì ghi "180", thấy "60" thì ghi "60").

Bỏ qua: ngày, giờ vào/ra, số khách, phụ thu, giấy tờ, dòng tiêu đề, dòng không có tiền.
Nếu không đọc được ô nào thì để chuỗi rỗng "".

QUAN TRỌNG: đọc kỹ TỪNG DÒNG từ trên xuống dưới, KHÔNG bỏ sót dòng nào kể cả chữ
mờ hay viết khó. Số ô khoanh tròn ở cột TỔNG TIỀN = số dòng cần trả về.

CHỈ trả về JSON: {"rows": [{"phong": "...", "tien": "..."}, ...]} theo thứ tự trên xuống."""


def _image_to_b64(image_path: str, *, rotate: int) -> str:
    """Đưa ảnh vào VLM ở dạng NGUYÊN MẪU — giữ độ phân giải gốc, KHÔNG thu nhỏ.

    - rotate == 0: gửi đúng bytes file gốc (toàn vẹn tuyệt đối, không đụng pixel).
    - rotate != 0: chỉ xoay đúng chiều (bội số 90° = hoán vị pixel, không nội suy),
      vẫn KHÔNG resize; lưu lại JPEG chất lượng cao (q95, 4:4:4) gần như không mất.
      Muốn ảnh y hệt gốc thì đặt FINOS_OCR_ROTATE=0 và chụp thẳng.
    """
    if not rotate:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode()

    from PIL import Image

    im = Image.open(image_path).convert("RGB").rotate(rotate, expand=True)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=95, subsampling=0)
    return base64.b64encode(buf.getvalue()).decode()


def _generate_streaming(
    b64: str, *, settings, should_cancel: Optional[Callable[[], bool]]
) -> str:
    """Gọi Ollama dạng stream, ghép các token thành chuỗi JSON cuối.

    Kiểm should_cancel() giữa từng mảnh; nếu bị ngưng -> đóng kết nối (Ollama dừng
    sinh, GPU rảnh ngay) và ném OcrCancelled.
    """
    payload = {
        "model": settings.ocr_model,
        "prompt": _PROMPT,
        "images": [b64],
        "stream": True,
        "format": "json",
        "options": {"temperature": 0},
    }
    req = urllib.request.Request(
        f"{settings.ollama_host}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    parts: list[str] = []
    with urllib.request.urlopen(req, timeout=settings.ocr_timeout_seconds) as resp:
        for raw in resp:  # mỗi dòng = 1 JSON ({response, done})
            if should_cancel and should_cancel():
                resp.close()
                raise OcrCancelled()
            line = raw.decode("utf-8").strip()
            if not line:
                continue
            obj = json.loads(line)
            parts.append(obj.get("response", ""))
            if obj.get("done"):
                break
    return "".join(parts)


def extract_rows(
    image_path: str,
    *,
    on_stage: Optional[Callable[[str], None]] = None,
    rotate: Optional[int] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> tuple[list[dict], str]:
    """Gọi VLM, trả (danh sách {phong, tien} thô, chuỗi JSON gốc để truy vết).

    on_stage(stage): callback báo giai đoạn cho UI ('preparing'|'recognizing').
    rotate: góc xoay riêng (None = mặc định cấu hình).
    should_cancel(): trả True để ngắt giữa chừng (ném OcrCancelled).
    Ném Exception nếu không gọi được Ollama.
    """
    settings = get_settings()
    if on_stage:
        on_stage("preparing")
    b64 = _image_to_b64(
        image_path,
        rotate=settings.ocr_rotate if rotate is None else rotate,
    )
    if on_stage:
        on_stage("recognizing")
    response = _generate_streaming(b64, settings=settings, should_cancel=should_cancel)

    try:
        data = json.loads(response)
    except json.JSONDecodeError:
        return [], response
    rows = data if isinstance(data, list) else data.get("rows", [])
    return (rows if isinstance(rows, list) else []), response
