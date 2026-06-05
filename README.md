# FinOS Hotel — Ứng dụng kế toán khách sạn (OCR sổ viết tay)

Số hóa sổ sách khách sạn: **chụp ảnh sổ → OCR trích xuất → người dùng duyệt/sửa → lưu → thống kê thu/chi**.
Tối ưu cho máy yếu (4GB RAM, CPU-only), self-host trong mạng LAN.

> **Nguyên tắc cốt lõi:** OCR chỉ *điền sẵn* form. Con người **luôn duyệt** trước khi lưu
> (chữ viết tay không đủ tin cậy để ghi thẳng vào sổ kế toán).

## Kiến trúc

| Lớp | Công nghệ |
|---|---|
| Backend | FastAPI + SQLite (WAL) + worker nền (hàng đợi bằng bảng `jobs`, concurrency = 1) |
| OCR | RapidOCR (PaddleOCR PP-OCRv4 mobile) chạy trên **ONNX Runtime** — model đóng gói sẵn ~15MB, chạy offline, **không cần PyTorch/Paddle** |
| Tiền xử lý ảnh | OpenCV (deskew, denoise, CLAHE) + nén ảnh phía client |
| Frontend | React + Vite + Tailwind, build tĩnh, **PWA** (cài như app, dùng camera) |
| Auth | JWT + Argon2, phân quyền 3 vai trò |

**Vai trò:** `admin` (toàn quyền + quản user + báo cáo) · `accountant` (nhập/duyệt + báo cáo) · `receptionist` (chụp & tạo chứng từ, không xem báo cáo tổng, không xóa).

**Giao diện:** bảng màu & design tokens xem [COLORS.md](COLORS.md) — tham khảo file này khi làm UI mới để giữ đồng bộ.

## Cấu trúc thư mục

```
FinOS_Hotel/
├─ Dockerfile, docker-compose.yml, .env.example   # triển khai
├─ backend/
│  ├─ app/            # FastAPI: routers, ocr/, jobs/worker.py, security, db
│  ├─ poc/ocr_poc.py  # POC đo độ chính xác + RAM + tốc độ trên ảnh thật
│  ├─ tests/          # smoke_test.py + ocr_integration_test.py
│  └─ requirements.txt
└─ frontend/          # PWA React (build -> dist, gộp vào image Docker)
```

## Triển khai bằng Docker (khuyến nghị — build 1 nơi, chạy nơi khác)

Trên máy đích trong LAN (đã cài Docker):

```bash
cp .env.example .env          # rồi ĐỔI FINOS_SECRET_KEY và FINOS_ADMIN_PASSWORD
docker compose up -d --build
```

Truy cập từ điện thoại/máy khác cùng mạng: `http://<IP-máy-chạy>:8000`
(đăng nhập bằng tài khoản admin trong `.env`).

- Dữ liệu (DB + ảnh) nằm trong volume `finos_data` → bền vững qua các lần rebuild.
- `mem_limit: 3g` trong compose phù hợp máy 4GB (bỏ nếu máy mạnh hơn).
- Model OCR đóng gói sẵn trong image → **không cần internet** khi chạy.

## Phát triển cục bộ (không cần OCR)

Máy dev yếu vẫn chạy được tầng web (tách khỏi OCR vì thư viện nặng được nạp lười):

```powershell
# Backend
cd backend
py -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt   # full (gồm OCR)
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload     # http://localhost:8000

# Frontend (terminal khác)
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxy /api -> 8000)
```

### Kiểm thử

```powershell
cd backend
# Tầng web (không cần deps OCR nặng): auth, RBAC, transactions, parse tiền/ngày
$env:PYTHONUTF8=1; ./.venv/Scripts/python.exe -m tests.smoke_test
# Luồng OCR đầy đủ (cần đã cài deps OCR + có ảnh poc/_sample.png)
./.venv/Scripts/python.exe -m tests.ocr_integration_test
```

## POC OCR — cổng quyết định (chạy trên máy sẽ deploy)

Trước khi tin tưởng OCR, hãy đo trên **ảnh sổ thật**:

```bash
py backend/poc/ocr_poc.py duong_dan/anh_so.jpg
py backend/poc/ocr_poc.py duong_dan/thu_muc_anh/
```

In ra: độ chính xác từng field (xem mắt thường), **RAM peak**, thời gian/ảnh; lưu `poc_result.json`.
Nếu chữ viết tay sai nhiều → cân nhắc fallback VietOCR hoặc fine-tune (xem kế hoạch).

## Bảo mật & sao lưu

- ĐỔI `FINOS_SECRET_KEY` và mật khẩu admin trước khi dùng thật.
- Sao lưu định kỳ volume `finos_data` (hoặc copy file `.db`) ra ổ/NAS khác trong LAN.
