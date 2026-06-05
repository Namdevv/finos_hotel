# FinOS Hotel — Ứng dụng kế toán khách sạn (OCR sổ viết tay)

Số hóa sổ sách khách sạn: **chụp ảnh sổ → OCR trích xuất → người dùng duyệt/sửa → lưu → thống kê thu/chi**.
Self-host trong mạng LAN. OCR dùng VLM (Qwen2.5-VL qua Ollama) chạy trên máy có GPU.

> **Nguyên tắc cốt lõi:** OCR chỉ *điền sẵn* form. Con người **luôn duyệt** trước khi lưu
> (chữ viết tay không đủ tin cậy để ghi thẳng vào sổ kế toán).

## Kiến trúc

| Lớp | Công nghệ |
|---|---|
| Backend | FastAPI + SQLite (WAL) + worker nền (hàng đợi bằng bảng `jobs`, concurrency = 1) |
| OCR | **VLM Qwen2.5-VL qua Ollama** — đọc tổng thể trang sổ (hiểu bảng kẻ cột, số khoanh tròn, chữ viết tay). Chạy ở Ollama trên máy có GPU; backend chỉ gọi HTTP |
| Xử lý ảnh | Pillow: xoay ảnh về đúng chiều đọc (sổ chụp ngang) + thu nhỏ trước khi gửi VLM; nén ảnh phía client |
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

## Yêu cầu OCR: Ollama + Qwen2.5-VL (máy có GPU)

OCR chạy bằng VLM trên **Ollama** (nên đặt ở máy có GPU, ví dụ ≥8-12GB VRAM):

```bash
# Trên máy chạy OCR:
ollama pull qwen2.5vl:7b      # tải model (1 lần)
# Ollama tự chạy nền ở cổng 11434
```

Backend trỏ tới Ollama qua `FINOS_OLLAMA_HOST` (mặc định `http://localhost:11434`;
từ trong Docker dùng `http://host.docker.internal:11434`). Có thể đặt Ollama và app
trên cùng máy GPU, hoặc tách máy trong LAN.

## Triển khai bằng Docker (khuyến nghị — build 1 nơi, chạy nơi khác)

Trên máy đích trong LAN (đã cài Docker + Ollama như trên):

```bash
cp .env.example .env          # ĐỔI FINOS_SECRET_KEY, FINOS_ADMIN_PASSWORD, kiểm FINOS_OLLAMA_HOST
docker compose up -d --build
```

Truy cập từ điện thoại/máy khác cùng mạng: `http://<IP-máy-chạy>:8000`
(đăng nhập bằng tài khoản admin trong `.env`).

- Dữ liệu (DB + ảnh) nằm trong volume `finos_data` → bền vững qua các lần rebuild.
- Container nhẹ (không kèm model OCR); phần nặng do Ollama đảm nhiệm trên máy GPU.

## Phát triển cục bộ

Backend rất nhẹ (OCR nằm ở Ollama, không cần torch/onnx/opencv). Tầng web chạy
được mà không cần Ollama; chỉ luồng OCR mới cần Ollama đang chạy + đã pull model.

```powershell
# Backend
cd backend
py -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload     # http://localhost:8000

# Frontend (terminal khác)
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxy /api -> 8000)
```

### Kiểm thử

```powershell
cd backend
# Tầng web: auth, RBAC, transactions, parse tiền/ngày
$env:PYTHONUTF8=1; ./.venv/Scripts/python.exe -m tests.smoke_test
# Luồng OCR đầy đủ (cần Ollama đang chạy + đã pull model + có ảnh poc/_sample.png)
./.venv/Scripts/python.exe -m tests.ocr_integration_test
```

### Nạp dữ liệu DEMO để xem UI

```powershell
cd backend
# Nạp 22 giao dịch + 3 user mẫu vào DB demo riêng (không đụng dữ liệu thật)
$env:FINOS_DB_PATH="demo.db"; $env:FINOS_UPLOAD_DIR="demo_uploads"; $env:PYTHONUTF8=1
./.venv/Scripts/python.exe -m tests.seed_demo
# Chạy thử với DB demo
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8011
```
Đăng nhập: `admin/admin123`, `ketoan/ketoan123`, `letan/letan123`.

## Test OCR trên ảnh sổ thật

Cần Ollama đang chạy + `ollama pull qwen2.5vl:7b`. Sổ chụp ngang thì thêm `--rotate 90`:

```bash
py backend/poc/ocr_vlm_test.py duong_dan/anh_so.jpg --rotate 90 --raw
py backend/poc/ocr_vlm_test.py duong_dan/thu_muc_anh/ --rotate 90
```

In ra phòng + tổng tiền từng dòng (đã quy ước nghìn ×1.000). `--raw` in kèm JSON
thô của model để dò chỗ đọc sai. Tinh chỉnh `--rotate` (0/90/180/270) và `--max-side`
cho khớp cách bạn chụp; giá trị tốt đặt lại vào `.env` (`FINOS_OCR_ROTATE`, ...).

## Bảo mật & sao lưu

- ĐỔI `FINOS_SECRET_KEY` và mật khẩu admin trước khi dùng thật.
- Sao lưu định kỳ volume `finos_data` (hoặc copy file `.db`) ra ổ/NAS khác trong LAN.
