"""Smoke test tầng web: auth, RBAC, transactions, stats, parse số tiền.

Chạy: ./.venv/Scripts/python.exe -m tests.smoke_test
Dùng DB tạm trong thư mục riêng để không đụng dữ liệu thật.
"""
import os
import tempfile

# Cấu hình môi trường TRƯỚC khi import app.
_tmp = tempfile.mkdtemp(prefix="finos_test_")
os.environ["FINOS_DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ["FINOS_UPLOAD_DIR"] = os.path.join(_tmp, "uploads")
os.environ["FINOS_SECRET_KEY"] = "test-secret"
os.environ["FINOS_ADMIN_USERNAME"] = "admin"
os.environ["FINOS_ADMIN_PASSWORD"] = "admin123"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.ocr.parse import parse_amount, parse_date  # noqa: E402

PASS, FAIL = 0, 0


def check(name, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [OK] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}")


def main():
    print("== Parse số tiền ==")
    check("1.200.000 -> 1200000", parse_amount("1.200.000") == 1200000)
    check("1,200,000 -> 1200000", parse_amount("1,200,000") == 1200000)
    check("500k -> 500000", parse_amount("500k") == 500000)
    check("1tr2 -> 1200000", parse_amount("1tr2") == 1200000)
    check("1.5tr -> 1500000", parse_amount("1.5tr") == 1500000)
    check("rác -> None", parse_amount("abc") is None)
    check("ngày 05/06/2026", parse_date("05/06/2026") == "2026-06-05")

    with TestClient(app) as c:
        print("== Health ==")
        check("health 200", c.get("/api/health").status_code == 200)

        print("== Auth ==")
        r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        check("login admin 200", r.status_code == 200)
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        check("sai mật khẩu -> 401",
              c.post("/api/auth/login", json={"username": "admin", "password": "x"}).status_code == 401)
        check("không token -> 401", c.get("/api/auth/me").status_code == 401)
        check("me trả admin", c.get("/api/auth/me", headers=h).json()["role"] == "admin")

        print("== Tạo user lễ tân (RBAC) ==")
        r = c.post("/api/users", headers=h,
                   json={"username": "letan", "password": "letan123", "role": "receptionist", "full_name": "Lễ tân A"})
        check("tạo user 201", r.status_code == 201)
        rt = c.post("/api/auth/login", json={"username": "letan", "password": "letan123"}).json()
        hr = {"Authorization": f"Bearer {rt['access_token']}"}
        check("lễ tân KHÔNG xem được /api/users (403)",
              c.get("/api/users", headers=hr).status_code == 403)
        check("lễ tân xem được summary hôm nay",
              c.get("/api/stats/summary", headers=hr).status_code == 200)

        print("== Transactions ==")
        c.post("/api/transactions", headers=h,
               json={"txn_date": "2026-06-01", "room": "P101", "note": "Tiền phòng", "kind": "income", "amount": 1200000})
        c.post("/api/transactions", headers=h,
               json={"txn_date": "2026-06-02", "room": "", "note": "Tiền điện", "kind": "expense", "amount": 300000})
        check("lễ tân ĐƯỢC thêm chứng từ (201)",
              c.post("/api/transactions", headers=hr,
                     json={"txn_date": "2026-06-02", "room": "P102", "note": "Đặt phòng", "kind": "income", "amount": 800000}).status_code == 201)
        lst = c.get("/api/transactions", headers=h).json()
        check("liệt kê 3 chứng từ", len(lst) == 3)
        txn_id = lst[0]["id"]
        check("lễ tân KHÔNG xóa được (403)",
              c.delete(f"/api/transactions/{txn_id}", headers=hr).status_code == 403)
        check("admin xóa được (204)",
              c.delete(f"/api/transactions/{txn_id}", headers=h).status_code == 204)

        print("== Stats ==")
        s = c.get("/api/stats/summary", headers=h).json()
        # còn lại: income 1.200.000 (đã xóa 800k?) tùy thứ tự — chỉ kiểm logic balance.
        check("balance = income - expense", s["balance"] == s["total_income"] - s["total_expense"])
        ts = c.get("/api/stats/timeseries?group=day", headers=h).json()
        check("timeseries có dữ liệu", len(ts) >= 1)

    print(f"\n== KẾT QUẢ: {PASS} pass, {FAIL} fail ==")
    raise SystemExit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
