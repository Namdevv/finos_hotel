# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FinOS Hotel digitizes handwritten hotel ledgers: photograph the book → OCR extracts rows → **a human always reviews/edits** → save → income/expense reporting. Built to run on weak hardware (4GB RAM, CPU-only) and self-host on a LAN.

**Core invariant:** OCR only *pre-fills* a form. It never writes directly to the accounting ledger — handwriting is not trustworthy enough. The pipeline returns *suggestions* with per-field confidence; the `transactions` table holds only human-approved data. Preserve this separation when changing the OCR or transaction flow.

The codebase comments, UI, and docs are in Vietnamese. Match that language when editing existing code/comments.

## Commands

Backend (run from `backend/`, uses a local venv at `backend/.venv`):
```powershell
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload          # http://localhost:8000

# Web-layer tests (no heavy OCR deps needed): auth, RBAC, transactions, money/date parsing
$env:PYTHONUTF8=1; ./.venv/Scripts/python.exe -m tests.smoke_test
# Full OCR flow (needs OCR deps installed + a sample image at poc/_sample.png)
./.venv/Scripts/python.exe -m tests.ocr_integration_test

# Seed demo data into a SEPARATE db (won't touch real data); logins admin/admin123, ketoan/ketoan123, letan/letan123
$env:FINOS_DB_PATH="demo.db"; $env:FINOS_UPLOAD_DIR="demo_uploads"; $env:PYTHONUTF8=1
./.venv/Scripts/python.exe -m tests.seed_demo

# OCR accuracy/RAM/speed probe against real ledger photos (run on the deploy machine)
py poc/ocr_poc.py path/to/image_or_folder/
```
There is no pytest harness — tests are plain `python -m` scripts. Always set `$env:PYTHONUTF8=1` on Windows (Vietnamese text in DB/output).

Frontend (run from `frontend/`):
```powershell
npm install
npm run dev        # http://localhost:5173, proxies /api -> :8000
npm run build      # tsc -b && vite build -> frontend/dist
```

Docker (recommended deploy — one image, runs offline):
```bash
cp .env.example .env    # then change FINOS_SECRET_KEY and FINOS_ADMIN_PASSWORD
docker compose up -d --build
```

## Architecture

**Single FastAPI process, no external services.** No Redis/Celery/Postgres. The job queue is a SQLite table.

- `backend/app/main.py` — app entry. `lifespan` calls `init_db()` (creates schema, seeds first admin) then `worker.start()`. After all `/api/*` routers it mounts the built frontend (`frontend/dist`) with an SPA fallback, so in production FastAPI serves both API and UI from port 8000.
- **OCR job flow:** `POST /api/ocr/upload` saves the image and inserts a `jobs` row with `status='queued'`. A single background thread (`jobs/worker.py`, `OcrWorker`) polls the table, claims one job atomically (`BEGIN IMMEDIATE`), runs `run_ocr`, and writes `result_json` (parsed rows + confidence) + `raw_ocr_json` (raw model JSON). The worker also writes the `jobs.stage` column (`preparing`→`recognizing`→`parsing`) via an `on_stage` callback so the Review page can show a live progress stepper + elapsed timer. The frontend polls `GET /api/ocr/jobs/{id}` until `done`/`failed`. **Concurrency is deliberately 1** — never send two images to the VLM at once.
- **Re-OCR & upload library:** `GET /api/ocr/jobs` lists past uploads (the "Lịch sử" page, `pages/Uploads.tsx`; receptionist sees own, others see all). `POST /api/ocr/jobs/{id}/reocr` re-queues an existing image, optionally with a new `jobs.rotate` (0/90/180/270) — used from the Review page's "OCR lại" modal since wrong rotation is the main cause of bad reads. Per-job `rotate` overrides `FINOS_OCR_ROTATE`. Both `stage` and `rotate` columns are added idempotently in `database.py` (ALTER TABLE migration).
- **OCR = a VLM via Ollama** (`backend/app/ocr/`): `vlm.py` rotates the image upright (`FINOS_OCR_ROTATE`, default 90° — ledgers are photographed sideways), downscales, base64-encodes, and POSTs to Ollama's `/api/generate` (`qwen2.5vl:7b`, `format:"json"`, `temperature:0`) with a prompt that asks for `{phong, tien}` per row. `pipeline.py` turns each item into an `OcrRow`-shaped record via `_ledger_amount` (the "nghìn" convention: bare `60`→60.000, `180`→180.000; a thousands-separated `1.200.000` is kept as-is). **The whole detect-box pipeline (RapidOCR/OpenCV) was removed** — it couldn't read handwriting or circled totals. `parse.py` remains only for the manual-entry/smoke-test path.
- **Why VLM:** the ledger is handwritten with circled totals; classic OCR detection missed the entire amount column. The VLM reads the page holistically. It still misreads ambiguous handwriting → the Review step (human approves, image shown side-by-side) is the safety net.
- **Backend stays light:** OCR runs in Ollama (separate process, GPU machine). The backend only does an HTTP call + Pillow image prep — no torch/onnx/opencv. Ollama must be reachable at `FINOS_OLLAMA_HOST`.
- **DB** (`database.py`, `schema.sql`): SQLite in WAL mode, `busy_timeout=30s`, `check_same_thread=False` (worker thread + request handlers each open their own connection). Three tables: `users`, `jobs`, `transactions`. Money is stored as integer VND (no floats). Schema is applied idempotently on every startup.
- **Auth/RBAC** (`security.py`, `deps.py`): JWT (HS256, PyJWT) + Argon2 password hashing. `get_current_user` resolves the bearer token; `require_roles(...)` builds per-route role guards. Roles: `admin` (everything + user mgmt + reports), `accountant` (enter/approve + reports), `receptionist` (capture + create transactions; **cannot** view aggregate reports, delete, or see other users' OCR jobs). Stats routes are guarded by `require_roles("admin","accountant")`; transaction edit/delete by the same; receptionists can only `GET` their own jobs.

**Frontend** (`frontend/src/`): React + Vite + Tailwind, PWA (installable, camera capture). `api.ts` is the single API client — it injects the bearer token, redirects to `/login` on 401, and unwraps FastAPI `detail` errors. `auth.tsx` holds the auth context + `hasRole`. Pages: `Capture` (photo→upload), `Review` (approve OCR rows), `Transactions`, `Dashboard` (recharts), `Users` (admin only). Routing/role-gating live in `main.tsx` via the `Protected` wrapper.

## Config

All settings use the `FINOS_` env prefix (read from `backend/.env` via pydantic-settings; see `config.py`). Key ones: `FINOS_SECRET_KEY`, `FINOS_ADMIN_PASSWORD` (seeds the first admin), `FINOS_DB_PATH`, `FINOS_UPLOAD_DIR`, `FINOS_MAX_UPLOAD_MB`. OCR/VLM: `FINOS_OLLAMA_HOST` (e.g. `http://localhost:11434`, or `http://host.docker.internal:11434` from Docker), `FINOS_OCR_MODEL` (`qwen2.5vl:7b`), `FINOS_OCR_ROTATE` (90), `FINOS_OCR_MAX_SIDE` (2400), `FINOS_OCR_TIMEOUT_SECONDS`. **Change `FINOS_SECRET_KEY` and the admin password before any real use.**

Running OCR requires Ollama up with the model pulled: `ollama pull qwen2.5vl:7b`. Without it, uploads queue and jobs fail. `poc/ocr_vlm_test.py <image>` is the standalone tester (supports `--rotate`, `--max-side`, `--raw`).

## UI styling

Before building new UI, consult [COLORS.md](COLORS.md) for the color palette and design tokens — keep the accounting-software (MISA-style) look consistent.
