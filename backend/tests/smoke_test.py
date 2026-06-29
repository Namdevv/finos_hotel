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
os.environ["FINOS_REPORT_DIR"] = os.path.join(_tmp, "reports")
os.environ["FINOS_AUTO_MONTHLY_REPORT"] = "0"  # tắt scheduler để test xác định
os.environ["FINOS_SECRET_KEY"] = "test-secret"
os.environ["FINOS_ADMIN_USERNAME"] = "admin"
os.environ["FINOS_ADMIN_PASSWORD"] = "admin123"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import _connect, init_db  # noqa: E402
from app.jobs.worker import OcrWorker  # noqa: E402
from app.main import app  # noqa: E402
from app.notify import create_notification  # noqa: E402
from app.ocr.pipeline import _ledger_amount  # noqa: E402
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

    check("OCR ledger 100 -> 100000", _ledger_amount("100") == 100000)
    check("OCR ledger 1000 -> 1000000", _ledger_amount("1000") == 1000000)
    check("OCR ledger 1200 -> 1200000", _ledger_amount("1200") == 1200000)
    check("OCR full VND 1000000 -> 1000000", _ledger_amount("1000000") == 1000000)

    print("== OCR queue recovery ==")
    init_db()
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO jobs (user_id, image_path, status, stage, cancelled, error, started_at) "
            "VALUES (1, 'dummy-a.jpg', 'processing', 'recognizing', 0, NULL, datetime('now'))"
        )
        retry_id = cur.lastrowid
        cur = conn.execute(
            "INSERT INTO jobs (user_id, image_path, status, stage, cancelled, error, started_at) "
            "VALUES (1, 'dummy-b.jpg', 'processing', 'recognizing', 1, NULL, datetime('now'))"
        )
        cancel_id = cur.lastrowid
        conn.commit()
        OcrWorker()._recover_interrupted_jobs()
        retry = conn.execute("SELECT status, stage, started_at FROM jobs WHERE id=?", (retry_id,)).fetchone()
        cancelled = conn.execute("SELECT status, stage, error FROM jobs WHERE id=?", (cancel_id,)).fetchone()
        check("processing chưa hủy -> queued lại", retry["status"] == "queued" and retry["stage"] is None and retry["started_at"] is None)
        check("processing đã hủy -> failed", cancelled["status"] == "failed" and cancelled["stage"] is None and cancelled["error"])
        conn.execute("DELETE FROM jobs WHERE id IN (?, ?)", (retry_id, cancel_id))
        conn.commit()
    finally:
        conn.close()

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
        let_an_id = r.json()["id"]
        r = c.post("/api/users", headers=h,
                   json={"username": "tempdel", "password": "temp123", "role": "receptionist", "full_name": "Xóa thử"})
        temp_id = r.json()["id"]
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO notifications (user_id, type, level, title, actor_id) "
                "VALUES (1, 'test.actor', 'info', 'Actor cleanup', ?)",
                (temp_id,),
            )
            conn.commit()
        finally:
            conn.close()
        check("xóa user có welcome notification không lỗi FK",
              c.delete(f"/api/users/{temp_id}", headers=h).status_code == 204)
        conn = _connect()
        try:
            orphan = conn.execute(
                "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? OR actor_id=?",
                (temp_id, temp_id),
            ).fetchone()["c"]
            check("xóa user dọn notification liên quan", orphan == 0)
        finally:
            conn.close()
        rt = c.post("/api/auth/login", json={"username": "letan", "password": "letan123"}).json()
        hr = {"Authorization": f"Bearer {rt['access_token']}"}
        check("lễ tân KHÔNG xem được /api/users (403)",
              c.get("/api/users", headers=hr).status_code == 403)
        check("lễ tân xem được summary hôm nay",
              c.get("/api/stats/summary", headers=hr).status_code == 200)

        print("== Notifications ==")
        user_notifs = c.get("/api/notifications", headers=hr).json()
        check("user thấy welcome notification của mình",
              any(n["type"] == "user.welcome" for n in user_notifs))
        admin_notifs = c.get("/api/notifications", headers=h).json()
        admin_notif_id = admin_notifs[0]["id"] if admin_notifs else -1
        check("user không mark-read notification của người khác",
              c.post(f"/api/notifications/{admin_notif_id}/read", headers=hr).status_code == 404)
        prefs = c.get("/api/notifications/preferences", headers=hr).json()
        check("preferences có nhóm OCR mặc định",
              any(p["notif_type"] == "ocr" and p["enabled"] for p in prefs))
        prefs = c.patch(
            "/api/notifications/preferences",
            headers=hr,
            json={"preferences": {"ocr": False}},
        ).json()
        check("tắt preference OCR thành công",
              any(p["notif_type"] == "ocr" and not p["enabled"] for p in prefs))
        check("preference nhóm lạ bị chặn",
              c.patch(
                  "/api/notifications/preferences",
                  headers=hr,
                  json={"preferences": {"../../bad": False}},
              ).status_code == 400)
        conn = _connect()
        try:
            before_ocr = conn.execute(
                "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND type='ocr.done'",
                (let_an_id,),
            ).fetchone()["c"]
            create_notification(
                conn,
                user_id=let_an_id,
                type="ocr.done",
                title="OCR bị tắt không nhận",
            )
            conn.commit()
            after_ocr = conn.execute(
                "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND type='ocr.done'",
                (let_an_id,),
            ).fetchone()["c"]
            check("preference tắt OCR chặn tạo notification", after_ocr == before_ocr)

            create_notification(
                conn,
                user_id=let_an_id,
                type="test.idempotent",
                title="Không tạo trùng",
                event_key="smoke:idempotent",
            )
            create_notification(
                conn,
                user_id=let_an_id,
                type="test.idempotent",
                title="Không tạo trùng",
                event_key="smoke:idempotent",
            )
            conn.commit()
            idem_count = conn.execute(
                "SELECT COUNT(*) AS c FROM notifications WHERE event_key='smoke:idempotent'"
            ).fetchone()["c"]
            check("event_key chống tạo notification trùng", idem_count == 1)

            baseline = conn.execute(
                "SELECT COALESCE(MAX(id), 0) AS max_id FROM notifications WHERE user_id=?",
                (let_an_id,),
            ).fetchone()["max_id"]
            for i in range(12):
                conn.execute(
                    "INSERT INTO notifications (user_id, type, level, title) VALUES (?, 'test.batch', 'info', ?)",
                    (let_an_id, f"Batch {i:02d}"),
                )
            conn.commit()
        finally:
            conn.close()
        rows = c.get(
            f"/api/notifications?only_unread=true&after_id={baseline}&limit=20",
            headers=hr,
        ).json()
        ids = [n["id"] for n in rows]
        check("after_id trả đủ batch notification mới", len(rows) == 12)
        check("after_id trả theo thứ tự tăng dần", ids == sorted(ids))
        check("push key trả trạng thái chưa cấu hình",
              c.get("/api/notifications/push/key", headers=hr).json()["enabled"] is False)
        check("push status trả subscribed false",
              c.get("/api/notifications/push/status", headers=hr).json()["subscribed"] is False)
        check("subscribe push khi chưa cấu hình -> 503",
              c.post(
                  "/api/notifications/push/subscribe",
                  headers=hr,
                  json={"endpoint": "https://push.example/sub", "p256dh": "k", "auth": "a"},
              ).status_code == 503)
        conn = _connect()
        try:
            queued = conn.execute(
                "SELECT COUNT(*) AS c FROM notification_push_outbox WHERE user_id=?",
                (let_an_id,),
            ).fetchone()["c"]
            check("tạo notification ghi push outbox", queued >= 1)
        finally:
            conn.close()

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

        print("== OCR commit ==")
        conn = _connect()
        try:
            cur = conn.execute(
                "INSERT INTO jobs (user_id, image_path, status, result_json) VALUES (1, 'dummy.jpg', 'done', '[]')"
            )
            job_id = cur.lastrowid
            conn.commit()
        finally:
            conn.close()
        commit_body = {
            "rows": [
                {"txn_date": "2026-06-03", "room": "P201", "note": "Tiền phòng", "kind": "income", "amount": 900000},
                {"txn_date": "2026-06-03", "room": "Bếp", "note": "Mua rau", "kind": "expense", "amount": 120000},
            ]
        }
        r = c.post(f"/api/ocr/jobs/{job_id}/commit", headers=h, json=commit_body)
        check("commit OCR tạo 2 chứng từ", r.status_code == 201 and len(r.json()) == 2)
        check("commit OCR không lưu trùng",
              c.post(f"/api/ocr/jobs/{job_id}/commit", headers=h, json=commit_body).status_code == 409)
        check("source=ocr thiếu job_id -> 400",
              c.post("/api/transactions", headers=h,
                     json={"txn_date": "2026-06-04", "room": "P301", "note": "OCR lỗi", "kind": "income", "amount": 1, "source": "ocr"}).status_code == 400)

        print("== Stats ==")
        s = c.get("/api/stats/summary", headers=h).json()
        # còn lại: income 1.200.000 (đã xóa 800k?) tùy thứ tự — chỉ kiểm logic balance.
        check("balance = income - expense", s["balance"] == s["total_income"] - s["total_expense"])
        ts = c.get("/api/stats/timeseries?group=day", headers=h).json()
        check("timeseries có dữ liệu", len(ts) >= 1)

        print("== Reports ==")
        r = c.post("/api/reports", headers=h, json={"period": "2026-06"})
        check("admin tạo báo cáo tháng (201)", r.status_code == 201)
        rep = r.json()
        check("báo cáo balance = thu - chi", rep["balance"] == rep["total_income"] - rep["total_expense"])
        check("báo cáo không tự động (auto=False)", rep["auto"] is False)
        report_id = rep["id"]
        reps = c.get("/api/reports", headers=h).json()
        check("danh sách có 1 báo cáo", len(reps) == 1)
        # Tạo lại cùng kỳ -> ghi đè, không nhân đôi.
        c.post("/api/reports", headers=h, json={"period": "2026-06"})
        check("tạo lại cùng kỳ không nhân đôi", len(c.get("/api/reports", headers=h).json()) == 1)
        dl = c.get(f"/api/reports/{report_id}/download", headers=h)
        check("tải file xlsx (200)", dl.status_code == 200)
        check("đúng content-type xlsx",
              "spreadsheetml" in dl.headers.get("content-type", ""))
        check("kỳ sai định dạng -> 422",
              c.post("/api/reports", headers=h, json={"period": "2026-13"}).status_code == 422)
        check("lễ tân KHÔNG xem báo cáo (403)",
              c.get("/api/reports", headers=hr).status_code == 403)
        check("lễ tân KHÔNG tạo báo cáo (403)",
              c.post("/api/reports", headers=hr, json={"period": "2026-06"}).status_code == 403)
        check("admin xóa báo cáo (204)",
              c.delete(f"/api/reports/{report_id}", headers=h).status_code == 204)

    print(f"\n== KẾT QUẢ: {PASS} pass, {FAIL} fail ==")
    raise SystemExit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
