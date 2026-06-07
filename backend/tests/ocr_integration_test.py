"""Test tích hợp: upload ảnh -> worker gọi VLM -> trả dòng đề xuất.

Chạy: PYTHONUTF8=1 ./.venv/Scripts/python.exe -m tests.ocr_integration_test
Cần: Ollama đang chạy + đã `ollama pull gemma4:31b-cloud` + có file poc/_sample.png.

Kiểm luồng chạy được (upload -> done -> rows là danh sách). Không assert nội dung
cụ thể vì kết quả VLM phụ thuộc ảnh/model.
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
        assert isinstance(rows, list), "rows phải là danh sách"
        print(f"Worker hoàn tất, {len(rows)} dòng:")
        for r in rows:
            print(f"  {r['txn_date']['value']} | {r['kind']} | {r['amount']['value']} | "
                  f"{r['room']['value']} | {r['note']['value']}")
        print("\n[OK] Luồng upload -> worker (VLM) -> kết quả hoạt động đúng.")


if __name__ == "__main__":
    main()
