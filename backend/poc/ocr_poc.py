"""POC OCR — CỔNG QUYẾT ĐỊNH cho kiến trúc OCR.

Mục đích: chạy thử pipeline OCR trên ẢNH SỔ THẬT, ngay trên máy 4GB,
để đo 3 thứ quyết định:
  (a) Độ chính xác field thực tế (xem mắt thường + confidence)
  (b) RAM peak thực khi nạp model + xử lý 1 ảnh
  (c) Thời gian xử lý mỗi ảnh

Cách dùng (sau khi đã: pip install -r requirements.txt):
  py poc/ocr_poc.py path/to/anh.jpg
  py poc/ocr_poc.py path/to/thu_muc_anh/      # chạy tất cả ảnh trong thư mục

Kết quả in ra màn hình + lưu poc_result.json để đối chiếu.
"""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

# Cho phép import package app.* khi chạy trực tiếp file này.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ocr.pipeline import run_ocr  # noqa: E402

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


class PeakRamSampler:
    """Lấy mẫu RSS của tiến trình ở luồng nền để tìm RAM đỉnh."""

    def __init__(self, interval=0.1):
        self.interval = interval
        self.peak_mb = 0.0
        self._stop = threading.Event()
        self._proc = psutil.Process() if psutil else None
        self._thread = None

    def __enter__(self):
        if self._proc:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()
        return self

    def _loop(self):
        while not self._stop.is_set():
            rss = self._proc.memory_info().rss / 1024 / 1024
            self.peak_mb = max(self.peak_mb, rss)
            self._stop.wait(self.interval)

    def __exit__(self, *a):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)


def collect_images(target: Path) -> list[Path]:
    if target.is_dir():
        return sorted(p for p in target.iterdir() if p.suffix.lower() in IMG_EXT)
    if target.suffix.lower() in IMG_EXT:
        return [target]
    return []


def fmt_vnd(v: str) -> str:
    return f"{int(v):,}".replace(",", ".") + "đ" if v.isdigit() else (v or "—")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = Path(sys.argv[1])
    images = collect_images(target)
    if not images:
        print(f"Không tìm thấy ảnh tại: {target}")
        sys.exit(1)

    if psutil is None:
        print("[Lưu ý] Chưa cài psutil -> không đo được RAM. Cài: pip install psutil\n")

    baseline_mb = (psutil.Process().memory_info().rss / 1024 / 1024) if psutil else 0
    print(f"RAM nền trước khi nạp model: {baseline_mb:.0f} MB\n")

    all_results = []
    for i, img in enumerate(images, 1):
        print(f"[{i}/{len(images)}] {img.name}")
        t0 = time.monotonic()
        with PeakRamSampler() as sampler:
            try:
                result = run_ocr(str(img))
                err = None
            except Exception as exc:  # noqa: BLE001
                result, err = {"rows": [], "raw": []}, str(exc)
        dt_ms = (time.monotonic() - t0) * 1000

        if err:
            print(f"   LỖI: {err}\n")
            all_results.append({"image": img.name, "error": err})
            continue

        rows = result["rows"]
        print(f"   Thời gian: {dt_ms:.0f} ms | RAM peak: {sampler.peak_mb:.0f} MB "
              f"(+{sampler.peak_mb - baseline_mb:.0f} so với nền) | số dòng: {len(rows)}")
        for r in rows:
            print(f"     • {r['txn_date']['value'] or '—':>10} | "
                  f"{r['kind']:>7} | {fmt_vnd(r['amount']['value']):>14} | "
                  f"phòng={r['room']['value'] or '—'} | {r['note']['value'][:40]} "
                  f"[min_conf={r['min_confidence']}]")
        print()
        all_results.append({
            "image": img.name, "duration_ms": round(dt_ms), "ram_peak_mb": round(sampler.peak_mb),
            "rows": rows,
        })

    out = Path(__file__).parent / "poc_result.json"
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")

    # Tổng kết để ra quyết định.
    done = [r for r in all_results if "error" not in r]
    if done:
        avg_ms = sum(r["duration_ms"] for r in done) / len(done)
        peak = max(r["ram_peak_mb"] for r in done)
        print("=" * 60)
        print("TỔNG KẾT (cổng quyết định)")
        print(f"  Ảnh xử lý OK : {len(done)}/{len(images)}")
        print(f"  Thời gian TB : {avg_ms:.0f} ms/ảnh")
        print(f"  RAM peak     : {peak} MB  (ngân sách kế hoạch: < ~2600 MB)")
        print(f"  Chi tiết lưu : {out}")
        print("=" * 60)
        print("Hãy xem mắt thường độ chính xác field. Nếu sai nhiều ở chữ viết tay")
        print("=> cân nhắc fallback VietOCR seq2seq hoặc fine-tune (xem plan).")


if __name__ == "__main__":
    main()
