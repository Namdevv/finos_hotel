import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Kind = "income" | "expense";
type Role = "admin" | "accountant" | "receptionist";

interface Transaction {
  id: number;
  txn_date: string;
  room: string;
  note: string;
  kind: Kind;
  amount: number;
  source: string;
  job_id?: number | null;
  image_path?: string | null;
  created_by: number;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
}

interface DemoUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

interface JobSummary {
  id: number;
  status: "queued" | "processing" | "done" | "failed";
  stage?: string | null;
  error?: string | null;
  rotate?: number | null;
  cancelled?: boolean;
  n_rows: number;
  created_at: string;
  finished_at?: string | null;
}

const fixturePath = fileURLToPath(new URL("./fixtures/demo-ledger.svg", import.meta.url));
const fixtureImage = readFileSync(fixturePath, "utf8");
const framesDir = fileURLToPath(new URL("../test-results/demo-frames/", import.meta.url));
let frameSeq = 0;

const user: DemoUser = {
  id: 1,
  username: "admin",
  full_name: "Quản trị FinOS",
  role: "admin",
  is_active: true,
};

let nextId = 20;
let jobPoll = 0;
let transactions: Transaction[] = [];
let users: DemoUser[] = [];

function resetDemoData() {
  nextId = 20;
  jobPoll = 0;
  transactions = [
    makeTransaction("2026-06-06", "P201", "Tiền phòng 1 đêm", "income", 780_000, "manual"),
    makeTransaction("2026-06-06", "P102", "Cọc giữ phòng", "income", 500_000, "manual"),
    makeTransaction("2026-06-05", "Bếp", "Mua thực phẩm sáng", "expense", 320_000, "manual"),
    makeTransaction("2026-06-04", "P305", "Phụ thu giặt sấy", "income", 120_000, "ocr"),
    makeTransaction("2026-06-03", "Kho", "Vật tư vệ sinh", "expense", 210_000, "manual"),
    // Dữ liệu các tháng trước — để biểu đồ "theo tháng" có nhiều cột.
    makeTransaction("2026-05-15", "P210", "Đoàn khách lưu trú", "income", 6_200_000, "manual"),
    makeTransaction("2026-05-15", "Bếp", "Nhập kho tháng 5", "expense", 1_800_000, "manual"),
    makeTransaction("2026-04-20", "P108", "Tiền phòng dài hạn", "income", 4_500_000, "manual"),
  ];
  users = [
    { id: 1, username: "admin", full_name: "Quản trị FinOS", role: "admin", is_active: true },
    { id: 2, username: "ketoan", full_name: "Trần Kế Toán", role: "accountant", is_active: true },
    { id: 3, username: "letan", full_name: "Lê Lễ Tân", role: "receptionist", is_active: true },
  ];
}

function makeTransaction(
  txn_date: string,
  room: string,
  note: string,
  kind: Kind,
  amount: number,
  source: string,
): Transaction {
  return {
    id: nextId++,
    txn_date,
    room,
    note,
    kind,
    amount,
    source,
    job_id: source === "ocr" ? 7001 : null,
    image_path: source === "ocr" ? "/api/ocr/image/7001" : null,
    created_by: user.id,
    created_at: `${txn_date}T09:00:00`,
    deleted_at: null,
    deleted_by: null,
  };
}

function visibleTransactions() {
  return [...transactions]
    .filter((t) => !t.deleted_at)
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.id - a.id);
}

function inRange(t: Transaction, from?: string | null, to?: string | null) {
  if (from && t.txn_date < from) return false;
  if (to && t.txn_date > to) return false;
  return true;
}

function summary(from?: string | null, to?: string | null) {
  const visible = visibleTransactions().filter((t) => inRange(t, from, to));
  const total_income = visible.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const total_expense = visible.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  return { total_income, total_expense, balance: total_income - total_expense, count: visible.length };
}

function timeseries(group: string, from?: string | null, to?: string | null) {
  const buckets = new Map<string, { period: string; income: number; expense: number }>();
  for (const t of visibleTransactions()) {
    if (!inRange(t, from, to)) continue;
    const period = group === "month" ? t.txn_date.slice(0, 7) : t.txn_date;
    const bucket = buckets.get(period) ?? { period, income: 0, expense: 0 };
    if (t.kind === "income") bucket.income += t.amount;
    else bucket.expense += t.amount;
    buckets.set(period, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function jobsList(): JobSummary[] {
  return [
    { id: 7001, status: "done", n_rows: 3, rotate: 180, created_at: "2026-06-06T09:05:00", finished_at: "2026-06-06T09:06:00" },
    { id: 7000, status: "done", n_rows: 5, rotate: 90, created_at: "2026-06-05T18:20:00", finished_at: "2026-06-05T18:21:00" },
    { id: 6999, status: "done", n_rows: 4, rotate: 90, created_at: "2026-06-04T11:42:00", finished_at: "2026-06-04T11:43:00" },
    { id: 6998, status: "failed", n_rows: 0, error: "Ảnh quá mờ", rotate: 90, created_at: "2026-06-03T08:10:00" },
  ];
}

function activitiesList() {
  return [
    { id: 9, user_id: 3, username: "letan", full_name: "Lê Lễ Tân", role: "receptionist", action: "ocr.upload", target_type: "job", target_id: 7001, detail: '{"rows": 3}', created_at: "2026-06-06T09:05:00" },
    { id: 8, user_id: 1, username: "admin", full_name: "Quản trị FinOS", role: "admin", action: "transaction.create", target_type: "transaction", target_id: 24, detail: '{"amount": 1250000}', created_at: "2026-06-06T09:12:00" },
    { id: 7, user_id: 2, username: "ketoan", full_name: "Trần Kế Toán", role: "accountant", action: "transaction.update", target_type: "transaction", target_id: 21, detail: '{"field": "amount"}', created_at: "2026-06-06T08:50:00" },
    { id: 6, user_id: 1, username: "admin", full_name: "Quản trị FinOS", role: "admin", action: "user.create", target_type: "user", target_id: 3, detail: '{"role": "receptionist"}', created_at: "2026-06-05T16:30:00" },
    { id: 5, user_id: 3, username: "letan", full_name: "Lê Lễ Tân", role: "receptionist", action: "auth.login", target_type: "session", target_id: null, detail: "", created_at: "2026-06-05T08:00:00" },
  ];
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockApi(page: Page) {
  resetDemoData();

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    const q = url.searchParams;

    // --- Auth ---
    if (path === "/auth/login" && method === "POST") {
      return json(route, { access_token: "demo-token", user });
    }
    if (path === "/auth/me" && method === "GET") {
      if (!request.headers().authorization) return json(route, { detail: "Chưa đăng nhập" }, 401);
      return json(route, user);
    }
    if (path === "/auth/me" && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}");
      if (body.full_name) user.full_name = body.full_name;
      return json(route, user);
    }

    // --- Người dùng ---
    if (path === "/users" && method === "GET") {
      return json(route, users);
    }
    if (path === "/users" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const u: DemoUser = {
        id: nextId++,
        username: body.username,
        full_name: body.full_name || body.username,
        role: (body.role as Role) || "receptionist",
        is_active: true,
      };
      users.push(u);
      return json(route, u, 201);
    }
    if (/^\/users\/\d+$/.test(path) && method === "PATCH") {
      const id = Number(path.split("/").pop());
      const body = JSON.parse(request.postData() || "{}");
      users = users.map((u) => (u.id === id ? { ...u, ...body } : u));
      return json(route, users.find((u) => u.id === id));
    }
    if (/^\/users\/\d+$/.test(path) && method === "DELETE") {
      const id = Number(path.split("/").pop());
      users = users.filter((u) => u.id !== id);
      return json(route, null, 204);
    }

    // --- Thống kê ---
    if (path === "/stats/summary") {
      return json(route, summary(q.get("date_from"), q.get("date_to")));
    }
    if (path === "/stats/timeseries") {
      return json(route, timeseries(q.get("group") || "day", q.get("date_from"), q.get("date_to")));
    }

    // --- Chứng từ ---
    if (path === "/transactions" && method === "GET") {
      const kind = q.get("kind");
      const from = q.get("date_from");
      const to = q.get("date_to");
      const items = visibleTransactions().filter(
        (t) => (!kind || t.kind === kind) && inRange(t, from, to),
      );
      return json(route, items);
    }
    if (path === "/transactions" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const item = makeTransaction(
        body.txn_date,
        body.room,
        body.note,
        body.kind,
        Number(body.amount),
        body.source || "manual",
      );
      item.job_id = body.job_id ?? (body.source === "ocr" ? 7001 : null);
      transactions.push(item);
      return json(route, item, 201);
    }
    if (/^\/transactions\/\d+$/.test(path) && method === "PATCH") {
      const id = Number(path.split("/").pop());
      const body = JSON.parse(request.postData() || "{}");
      transactions = transactions.map((t) => (t.id === id ? { ...t, ...body } : t));
      return json(route, transactions.find((t) => t.id === id));
    }
    if (/^\/transactions\/\d+$/.test(path) && method === "DELETE") {
      const id = Number(path.split("/").pop());
      transactions = transactions.map((t) => (t.id === id ? { ...t, deleted_at: "2026-06-06T10:00:00" } : t));
      return json(route, null, 204);
    }
    if (path === "/transactions" && method === "DELETE") {
      const body = JSON.parse(request.postData() || "{}");
      const ids: number[] = body.ids || [];
      transactions = transactions.map((t) => (ids.includes(t.id) ? { ...t, deleted_at: "2026-06-06T10:00:00" } : t));
      return json(route, null, 204);
    }

    // --- Nhật ký hoạt động ---
    if (path === "/activities") {
      const action = q.get("action");
      const items = activitiesList().filter((a) => !action || a.action === action);
      return json(route, items);
    }

    // --- OCR ---
    if (path === "/ocr/jobs" && method === "GET") {
      return json(route, jobsList());
    }
    if (path === "/ocr/upload" && method === "POST") {
      jobPoll = 0;
      return json(route, { id: 7001, status: "queued" }, 201);
    }
    if (/^\/ocr\/jobs\/\d+\/reocr$/.test(path) && method === "POST") {
      jobPoll = 0;
      return json(route, { job_id: 7001, status: "queued", stage: null, rotate: 90, rows: [] });
    }
    if (/^\/ocr\/jobs\/\d+\/cancel$/.test(path) && method === "POST") {
      return json(route, null, 204);
    }
    if (/^\/ocr\/jobs\/\d+$/.test(path) && method === "GET") {
      jobPoll += 1;
      // Tiến trình giả lập — kéo dài bước "Nhận dạng bằng AI" cho người xem thấy rõ.
      if (jobPoll === 1) return json(route, { job_id: 7001, status: "processing", stage: "preparing", rotate: 180, rows: [] });
      if (jobPoll === 2) return json(route, { job_id: 7001, status: "processing", stage: "recognizing", rotate: 180, rows: [] });
      return json(route, {
        job_id: 7001,
        status: "done",
        stage: null,
        rotate: 180,
        image_path: "/api/ocr/image/7001",
        rows: [
          ocrRow("2026-06-06", "P203", "Tiền phòng 2 đêm", "income", "1250000", 0.62),
          ocrRow("2026-06-06", "P101", "Nước uống minibar", "income", "85000", 0.92),
          ocrRow("2026-06-06", "Bếp", "Mua rau sáng", "expense", "320000", 0.84),
        ],
      });
    }
    if (/^\/ocr\/jobs\/\d+$/.test(path) && method === "DELETE") {
      return json(route, null, 204);
    }
    if (/^\/ocr\/image\/\d+$/.test(path)) {
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: fixtureImage });
    }

    return json(route, { detail: `Demo mock chưa hỗ trợ ${method} ${path}` }, 404);
  });
}

function ocrRow(
  txn_date: string,
  room: string,
  note: string,
  kind: Kind,
  amount: string,
  confidence: number,
) {
  return {
    txn_date: { value: txn_date, confidence },
    room: { value: room, confidence },
    note: { value: note, confidence },
    kind,
    amount: { value: amount, confidence },
    min_confidence: confidence,
  };
}

// ---------------------------------------------------------------------------
// Nhịp & cử động "người thật" — để video xem chậm rãi, mượt mà.
// ---------------------------------------------------------------------------

const BEAT = 470; // nhịp đọc cơ bản (ms) — giữ video tổng ~30s

/** Dừng theo bội số nhịp đọc — cho người xem kịp đọc nội dung trên màn hình. */
async function beat(page: Page, mult = 1) {
  await page.waitForTimeout(Math.round(BEAT * mult));
}

/** Di con trỏ mượt tới giữa phần tử (tạo cảm giác tay người di chuột). */
async function glide(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  }
}

/** Di chuột tới rồi bấm — có khựng nhẹ trước khi click cho tự nhiên. */
async function click(page: Page, loc: Locator) {
  await glide(page, loc);
  await beat(page, 0.35);
  await loc.click();
}

/** Gõ văn bản từng ký tự (xoá nội dung cũ trước). */
async function type(page: Page, loc: Locator, text: string, delay = 40) {
  await glide(page, loc);
  await loc.click();
  await loc.fill("");
  await loc.pressSequentially(text, { delay });
  await beat(page, 0.3);
}

async function snap(page: Page, label: string) {
  frameSeq += 1;
  await page.screenshot({
    path: join(framesDir, `${String(frameSeq).padStart(2, "0")}-${label}.png`),
    animations: "disabled",
  });
}

// slowMo vừa phải cho video demo — mỗi thao tác thấy được nhưng không lê thê.
test.use({ launchOptions: { slowMo: 80 } });

test("quay video demo luồng FinOS Hotel", async ({ page }) => {
  test.setTimeout(120_000);
  frameSeq = 0;
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  // Tự đồng ý các hộp thoại confirm() (nếu có).
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await mockApi(page);
  await page.setViewportSize({ width: 1180, height: 740 });

  // ----- Cảnh 1: Đăng nhập -----
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await beat(page, 0.7);
  await snap(page, "login");
  await type(page, page.getByLabel("Tên đăng nhập"), "admin");
  await type(page, page.getByLabel("Mật khẩu"), "admin123");
  await beat(page, 0.4);
  await click(page, page.getByRole("button", { name: /Đăng nhập/ }));

  // ----- Cảnh 2: Tổng quan -----
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expect(page.getByText("Số liệu tháng này")).toBeVisible();
  await beat(page, 1.1);
  await snap(page, "dashboard");

  // Xem nhanh biểu đồ theo tháng rồi trở lại theo ngày.
  await page.getByRole("combobox").selectOption("month");
  await expect(page.getByText("Thu / Chi theo tháng")).toBeVisible();
  await beat(page, 1.2);
  await snap(page, "dashboard-thang");
  await page.getByRole("combobox").selectOption("day");
  await expect(page.getByText("Số liệu tháng này")).toBeVisible();
  await beat(page, 0.5);

  // ----- Cảnh 3: Chụp / tải ảnh sổ -----
  await click(page, page.getByRole("link", { name: /Chụp sổ/ }));
  await expect(page.getByRole("heading", { name: "Chụp / tải ảnh sổ" })).toBeVisible();
  await beat(page, 0.5);
  const chooserPromise = page.waitForEvent("filechooser");
  await click(page, page.getByRole("button", { name: /Từ album/ }));
  const chooser = await chooserPromise;
  await chooser.setFiles(fixturePath);
  await expect(page.getByAltText("Xem trước ảnh sổ")).toBeVisible();
  await beat(page, 0.9);
  await snap(page, "preview");
  await click(page, page.getByRole("button", { name: /OCR & duyệt/ }));

  // ----- Cảnh 4: Tiến trình xử lý -----
  await expect(page.getByRole("heading", { name: "Đang xử lý ảnh sổ" })).toBeVisible();
  await expect(page.getByText("Nhận dạng bằng AI")).toBeVisible();
  await snap(page, "processing");

  // ----- Cảnh 5: Duyệt & sửa chứng từ -----
  await expect(page.getByText("Duyệt lại từng dòng trước khi lưu.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByAltText("Ảnh sổ gốc")).toBeVisible();
  // Cảnh báo độ tin cậy thấp (ô vàng) — điểm nhấn của bước duyệt.
  await expect(page.getByText(/độ tin cậy thấp/)).toBeVisible();
  await beat(page, 1.1);
  await snap(page, "review");
  // Sửa lại dòng đầu — nhất là ô số tiền bị tô vàng vì OCR chưa chắc chắn.
  await type(page, page.getByLabel("Phòng / khách").first(), "P203 - Anh Nam");
  await type(page, page.getByLabel(/Số tiền/).first(), "1250000");
  await beat(page, 0.6);
  await snap(page, "review-sua");
  await click(page, page.getByRole("button", { name: /Lưu tất cả/ }));

  // ----- Cảnh 6: Chứng từ + lọc nhanh -----
  await expect(page.getByRole("heading", { name: "Chứng từ" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tiền phòng 2 đêm" })).toBeVisible();
  await beat(page, 1.0);
  await snap(page, "transactions");
  await page.getByLabel("Loại").selectOption("expense");
  await click(page, page.getByRole("button", { name: /^Lọc/ }));
  await expect(page.getByRole("cell", { name: /Mua rau sáng/ })).toBeVisible();
  await beat(page, 0.9);
  await snap(page, "transactions-loc");

  // ----- Cảnh 7: Thư viện ảnh -----
  await click(page, page.getByRole("link", { name: /Thư viện/ }));
  await expect(page.getByRole("main").getByRole("heading", { name: "Thư viện ảnh" })).toBeVisible();
  await beat(page, 0.9);
  await snap(page, "thu-vien");

  // ----- Cảnh 8: Người dùng & phân quyền -----
  await click(page, page.getByRole("link", { name: /Người dùng/ }));
  await expect(page.getByRole("heading", { name: "Thêm người dùng" })).toBeVisible();
  await beat(page, 0.9);
  await snap(page, "nguoi-dung");

  // ----- Cảnh 9: Quay lại Tổng quan -----
  await click(page, page.getByRole("link", { name: /Tổng quan/ }));
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expect(page.getByText("Thu / Chi theo ngày")).toBeVisible();
  await beat(page, 1.3);
  await snap(page, "dashboard-cuoi");
});
