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
-- Báo cáo Excel theo tháng — mỗi tháng 1 bản (period 'YYYY-MM'), file .xlsx
-- lưu ra đĩa. Bản chốt cuối tháng do hệ thống tự render; admin/kế toán có thể
-- chủ động tạo lại bất cứ lúc nào (ghi đè bản cũ cùng tháng).
-- auto: 1 = hệ thống tự tạo cuối tháng | 0 = người dùng bấm tạo.
-- generated_by: NULL = hệ thống.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    period        TEXT NOT NULL,                          -- 'YYYY-MM'
    title         TEXT NOT NULL DEFAULT '',
    file_path     TEXT NOT NULL,
    total_income  INTEGER NOT NULL DEFAULT 0,             -- VND
    total_expense INTEGER NOT NULL DEFAULT 0,             -- VND
    balance       INTEGER NOT NULL DEFAULT 0,             -- thu - chi
    txn_count     INTEGER NOT NULL DEFAULT 0,
    auto          INTEGER NOT NULL DEFAULT 0,
    generated_by  INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_period ON reports(period);

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

-- ---------------------------------------------------------------------------
-- Thông báo trong ứng dụng — mỗi dòng là 1 thông báo gửi tới 1 người dùng.
-- level: 'info' | 'success' | 'warning' | 'error' (quyết định icon + màu).
-- actor_id: người gây ra sự kiện (NULL nếu do hệ thống, vd worker OCR).
-- link: route frontend để bấm vào điều hướng (vd '/review/12', '/transactions').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- người nhận
    type        TEXT NOT NULL,                  -- vd 'ocr.done', 'transaction.create'
    level       TEXT NOT NULL DEFAULT 'info'
                CHECK (level IN ('info', 'success', 'warning', 'error')),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    link        TEXT,                           -- route frontend khi bấm vào
    actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- người gây ra (NULL = hệ thống)
    actor_name  TEXT NOT NULL DEFAULT '',       -- snapshot tên người gây ra
    target_type TEXT NOT NULL DEFAULT '',
    target_id   INTEGER,
    is_read     INTEGER NOT NULL DEFAULT 0,
    event_key   TEXT UNIQUE,                    -- khóa chống tạo trùng khi retry (NULL = không dedupe)
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, id);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at);

-- Tùy chọn nhận thông báo theo nhóm type prefix: ocr, transaction, user, auth...
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notif_type TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, notif_type)
);

-- Web Push subscriptions của từng thiết bị/trình duyệt.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

-- Outbox để chỉ gửi push sau khi transaction tạo notification đã commit.
CREATE TABLE IF NOT EXISTS notification_push_outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT NOT NULL DEFAULT '',
    delivered_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON notification_push_outbox(delivered_at, attempts, id);
