"""Seed dữ liệu DEMO để xem UI. Đọc FINOS_DB_PATH từ môi trường.

Chạy: (đặt env trỏ tới DB demo) python -m tests.seed_demo
"""
import datetime as dt

from app.database import _connect, init_db
from app.security import hash_password

init_db()  # tạo schema + admin
conn = _connect()

# --- Người dùng demo (ngoài admin) ---
for username, name, role, pw in [
    ("ketoan", "Trần Thị Kế Toán", "accountant", "ketoan123"),
    ("letan", "Lê Văn Lễ Tân", "receptionist", "letan123"),
]:
    exists = conn.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)",
            (username, name, hash_password(pw), role),
        )

# --- Xóa giao dịch cũ rồi nạp lại (DB demo) ---
conn.execute("DELETE FROM transactions")

rooms = ["P101", "P102", "P103", "P201", "P202", "P305", ""]
income_notes = ["Tiền phòng 2 đêm", "Đặt phòng đoàn", "Tiền phòng", "Phụ thu khách lẻ", "Tiền phòng + ăn sáng"]
expense_notes = ["Tiền điện", "Tiền nước", "Lương nhân viên", "Mua đồ vệ sinh", "Sửa máy lạnh", "Giặt là", "Mua vật tư"]

def d(y, m, day):
    return dt.date(y, m, day).isoformat()

rows = []
# Tháng này (06/2026) - chi tiết theo ngày
rows += [
    (d(2026, 6, 1), "P101", "Tiền phòng 2 đêm", "income", 1_800_000),
    (d(2026, 6, 1), "P102", "Đặt phòng đoàn", "income", 2_400_000),
    (d(2026, 6, 1), "", "Tiền điện tháng 5", "expense", 3_200_000),
    (d(2026, 6, 2), "P201", "Tiền phòng", "income", 950_000),
    (d(2026, 6, 2), "P103", "Tiền phòng + ăn sáng", "income", 1_250_000),
    (d(2026, 6, 2), "", "Mua đồ vệ sinh", "expense", 850_000),
    (d(2026, 6, 3), "P305", "Đặt phòng đoàn", "income", 3_600_000),
    (d(2026, 6, 3), "", "Lương nhân viên (tạm ứng)", "expense", 5_000_000),
    (d(2026, 6, 3), "P202", "Phụ thu khách lẻ", "income", 600_000),
    (d(2026, 6, 4), "P101", "Tiền phòng", "income", 900_000),
    (d(2026, 6, 4), "", "Tiền nước", "expense", 720_000),
    (d(2026, 6, 4), "P102", "Tiền phòng 3 đêm", "income", 2_700_000),
    (d(2026, 6, 5), "P201", "Tiền phòng + ăn sáng", "income", 1_350_000),
    (d(2026, 6, 5), "", "Sửa máy lạnh P305", "expense", 1_500_000),
    (d(2026, 6, 5), "P103", "Đặt phòng", "income", 1_100_000),
    (d(2026, 6, 5), "", "Giặt là", "expense", 450_000),
]
# Các tháng trước (cho biểu đồ "theo tháng")
rows += [
    (d(2026, 5, 12), "P201", "Tiền phòng", "income", 42_500_000),
    (d(2026, 5, 20), "", "Chi phí vận hành tháng 5", "expense", 28_300_000),
    (d(2026, 4, 10), "P102", "Doanh thu phòng", "income", 38_900_000),
    (d(2026, 4, 25), "", "Chi phí vận hành tháng 4", "expense", 25_100_000),
    (d(2026, 3, 15), "P101", "Doanh thu phòng", "income", 35_200_000),
    (d(2026, 3, 28), "", "Chi phí vận hành tháng 3", "expense", 22_800_000),
]

for txn_date, room, note, kind, amount in rows:
    src = "ocr" if amount % 2 == 0 and room else "manual"
    conn.execute(
        "INSERT INTO transactions (txn_date, room, note, kind, amount, source, created_by) "
        "VALUES (?,?,?,?,?,?,1)",
        (txn_date, room, note, kind, amount, src),
    )

conn.commit()
n = conn.execute("SELECT COUNT(*) c FROM transactions").fetchone()["c"]
u = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
conn.close()
print(f"Seed xong: {n} giao dich, {u} nguoi dung.")
