-- FinOS Hotel - SQLite schema
-- Bật WAL để đọc/ghi đồng thời tốt hơn trên 1 máy.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Người dùng & phân quyền (RBAC)
-- role: 'admin' | 'accountant' | 'receptionist'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'accountant', 'receptionist')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Job OCR — hàng đợi bằng bảng SQLite (không cần Redis/Celery)
-- status: 'queued' | 'processing' | 'done' | 'failed'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    image_path   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'processing', 'done', 'failed')),
    stage        TEXT,        -- giai đoạn xử lý hiện tại (preparing|recognizing|parsing) để UI theo dõi
    rotate       INTEGER,     -- góc xoay ảnh riêng cho job (re-OCR); NULL = dùng mặc định FINOS_OCR_ROTATE
    cancelled    INTEGER NOT NULL DEFAULT 0,  -- người dùng đã yêu cầu ngưng job
    error        TEXT,
    result_json  TEXT,        -- kết quả OCR đã parse (các dòng + field + confidence)
    raw_ocr_json TEXT,        -- text OCR thô + bbox để truy vết
    duration_ms  INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    started_at   TEXT,
    finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);

-- ---------------------------------------------------------------------------
-- Chứng từ / giao dịch — dữ liệu kế toán đã được người dùng DUYỆT
-- kind: 'income' (thu) | 'expense' (chi)
-- source: 'ocr' | 'manual'
-- amount lưu bằng đồng (INTEGER) để tránh sai số dấu phẩy động.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_date    TEXT NOT NULL,                 -- 'YYYY-MM-DD'
    room        TEXT NOT NULL DEFAULT '',      -- phòng / khách
    note        TEXT NOT NULL DEFAULT '',      -- nội dung
    kind        TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    amount      INTEGER NOT NULL CHECK (amount >= 0),  -- VND
    source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ocr', 'manual')),
    job_id      INTEGER REFERENCES jobs(id),   -- nếu phát sinh từ ảnh OCR
    image_path  TEXT,                          -- ảnh gốc để đối chiếu
    created_by  INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT,
    deleted_by  INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_kind ON transactions(kind);

-- ---------------------------------------------------------------------------
-- Nhật ký hoạt động — tracking thao tác chính của nhân viên/kế toán/admin.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   INTEGER,
    detail      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
