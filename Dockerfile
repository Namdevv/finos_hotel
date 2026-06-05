# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# FinOS Hotel — build 1 image, chạy được trên máy khác (LAN).
# Build frontend (Node) -> gộp vào backend (Python, nhẹ).
# OCR do Ollama (VLM) đảm nhiệm ở máy có GPU — container chỉ gọi HTTP.
# ─────────────────────────────────────────────────────────────

# ===== Stage 1: build frontend tĩnh =====
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build      # xuất ra /fe/dist

# ===== Stage 2: backend + phục vụ frontend =====
FROM python:3.12-slim AS runtime

# OCR chạy ở Ollama (ngoài container) -> backend thuần Python + Pillow,
# không cần thư viện hệ thống nặng (opencv/onnxruntime đã bỏ).

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1 \
    FINOS_DB_PATH=/data/finos.db \
    FINOS_UPLOAD_DIR=/data/uploads

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Gộp bản build frontend vào đúng đường dẫn main.py mong đợi (/app/frontend/dist).
COPY --from=frontend /fe/dist /app/frontend/dist

# Dữ liệu (DB + ảnh upload) đặt ở /data để gắn volume bền vững.
RUN mkdir -p /data/uploads
VOLUME ["/data"]

EXPOSE 8000
# 1 worker uvicorn — đúng ràng buộc tối ưu RAM (OCR concurrency = 1).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
