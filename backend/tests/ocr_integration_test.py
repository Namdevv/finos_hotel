"""Test tích hợp: upload ảnh -> worker xử lý job -> trả dòng đề xuất.

Chạy: PYTHONUTF8=1 ./.venv/Scripts/python.exe -m tests.ocr_integration_test
Cần đã cài deps OCR + có file poc/_sample.png.
"""
import os
import tempfile
import time
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="finos_ocr_test_")
os.environ["FINOS_DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ["FINOS_UPLOAD_DIR"] = os.path.join(_tmp, "uploads")
os.environ["FINOS_SECRET_KEY"] = "x" * 40

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

SAMPLE = Path(__file__).resolve().parent.parent / "poc" / "_sample.png"


def main():
    assert SAMPLE.exists(), f"Thiếu ảnh mẫu: {SAMPLE} (chạy POC trước để tạo)"
    with TestClient(app) as c:  # lifespan khởi động worker
        tok = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}

        with open(SAMPLE, "rb") as f:
            r = c.post("/api/ocr/upload", headers=h, files={"file": ("sample.png", f, "image/png")})
        assert r.status_code == 201, r.text
        job_id = r.json()["id"]
        print(f"Đã tạo job #{job_id}, chờ worker xử lý...")

        result = None
        for _ in range(60):  # tối đa ~60s
            result = c.get(f"/api/ocr/jobs/{job_id}", headers=h).json()
            if result["status"] in ("done", "failed"):
                break
            time.sleep(1)

        assert result["status"] == "done", f"Job không done: {result}"
        rows = result["rows"]
        print(f"Worker hoàn tất, {len(rows)} dòng:")
        for r in rows:
            print(f"  {r['txn_date']['value']} | {r['kind']} | {r['amount']['value']} | "
                  f"{r['room']['value']} | {r['note']['value']}")
        assert len(rows) == 3, f"Mong đợi 3 dòng, nhận {len(rows)}"
        assert any(row["amount"]["value"] == "1200000" for row in rows), "Thiếu dòng 1.200.000"
        print("\n[OK] Luồng upload -> worker -> kết quả hoạt động đúng.")


if __name__ == "__main__":
    main()
