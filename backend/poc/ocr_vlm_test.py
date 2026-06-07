"""Test OCR sổ khách sạn bằng VLM (Ollama + Gemma 4 31B).

Khác với detect-box (PP-OCR), VLM ĐỌC TỔNG THỂ cả trang nên xử được số khoanh
tròn + viết tay + bảng. Script gửi ảnh cho Ollama, yêu cầu trả JSON phòng+tiền
mỗi dòng, rồi áp quy ước nghìn (×1.000) giống app để bạn so với ocr_debug.py.

CHUẨN BỊ:
  - Cài Ollama, chạy nền (mặc định http://localhost:11434)
  - ollama pull gemma4:31b-cloud

CHẠY:
  py poc/ocr_vlm_test.py duong_dan/anh_so.jpg
  py poc/ocr_vlm_test.py duong_dan/thu_muc_anh/        # cả thư mục
  py poc/ocr_vlm_test.py anh.jpg --model gemma4:31b-cloud --raw   # in thêm JSON thô

Chỉ dùng thư viện chuẩn + Pillow (đã có trong requirements). Không cần GPU lib
trong venv này — Ollama lo phần GPU.
"""
from __future__ import annotations

import base64
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ocr.pipeline import _ledger_amount  # noqa: E402 — dùng chung quy ước nghìn

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "gemma4:31b-cloud"

PROMPT = """Đây là ảnh một trang SỔ GHI TAY của khách sạn, dạng bảng kẻ cột.
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


def collect_images(target: Path) -> list[Path]:
    if target.is_dir():
        return sorted(p for p in target.iterdir() if p.suffix.lower() in IMG_EXT)
    return [target] if target.suffix.lower() in IMG_EXT else []


def image_b64(path: Path, max_side: int = 2400, rotate: int = 0) -> str:
    """Đọc ảnh -> (xoay nếu cần) -> thu nhỏ nếu quá lớn -> base64 JPEG.

    rotate: 0/90/180/270 độ NGƯỢC chiều kim đồng hồ. Dùng để xoay ảnh chụp
    ngang về đúng chiều đọc (header NGÀY/PHÒNG nằm ngang ở trên).
    """
    try:
        from PIL import Image

        im = Image.open(path).convert("RGB")
        if rotate:
            im = im.rotate(rotate, expand=True)
        w, h = im.size
        if max(w, h) > max_side:
            s = max_side / max(w, h)
            im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=92)
        data = buf.getvalue()
    except Exception:
        data = path.read_bytes()
    return base64.b64encode(data).decode()


def call_ollama(b64: str, *, model: str, host: str) -> str:
    payload = {
        "model": model,
        "prompt": PROMPT,
        "images": [b64],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
    }
    req = urllib.request.Request(
        f"{host}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read().decode("utf-8")).get("response", "")


def parse_rows(response: str) -> list[dict]:
    try:
        data = json.loads(response)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return data
    return data.get("rows", []) if isinstance(data, dict) else []


def fmt_vnd(v: int | None) -> str:
    return f"{v:,}".replace(",", ".") + "đ" if v else "—"


def process(path: Path, *, model: str, host: str, show_raw: bool,
            max_side: int, rotate: int) -> None:
    print(f"\n{'=' * 70}\nẢnh: {path.name}\n{'=' * 70}")
    t0 = time.monotonic()
    try:
        response = call_ollama(image_b64(path, max_side=max_side, rotate=rotate),
                               model=model, host=host)
    except urllib.error.URLError as exc:
        print(f"  LỖI gọi Ollama: {exc}\n  -> Ollama đã chạy chưa? đã `ollama pull {model}` chưa?")
        return
    dt_s = time.monotonic() - t0

    if show_raw:
        print("JSON thô từ model:")
        print(f"  {response}\n")

    rows = parse_rows(response)
    print(f"  {len(rows)} dòng | {dt_s:.1f}s")
    for r in rows:
        phong = str(r.get("phong", "")).strip()
        tien_raw = str(r.get("tien", "")).strip()
        tien = _ledger_amount(tien_raw)
        print(f"   • phòng={phong or '—':>5} | tiền={fmt_vnd(tien):>12}"
              f" (sổ ghi: {tien_raw or '—'}) | thu")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    target = Path(args[0])
    model = args[args.index("--model") + 1] if "--model" in args else DEFAULT_MODEL
    host = args[args.index("--host") + 1] if "--host" in args else DEFAULT_HOST
    max_side = int(args[args.index("--max-side") + 1]) if "--max-side" in args else 2400
    rotate = int(args[args.index("--rotate") + 1]) if "--rotate" in args else 0
    show_raw = "--raw" in args

    images = collect_images(target)
    if not images:
        print(f"Không tìm thấy ảnh tại: {target}")
        sys.exit(1)

    print(f"Model: {model} | Host: {host} | max_side={max_side} | rotate={rotate} | {len(images)} ảnh")
    for p in images:
        process(p, model=model, host=host, show_raw=show_raw, max_side=max_side, rotate=rotate)
    print("\nXem mắt thường: phòng & tiền đã đúng cột TỔNG TIỀN chưa?")


if __name__ == "__main__":
    main()
