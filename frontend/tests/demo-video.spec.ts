import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Kind = "income" | "expense";

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

const fixturePath = fileURLToPath(new URL("./fixtures/demo-ledger.svg", import.meta.url));
const fixtureImage = readFileSync(fixturePath, "utf8");
const framesDir = fileURLToPath(new URL("../test-results/demo-frames/", import.meta.url));
let frameSeq = 0;

const user = {
  id: 1,
  username: "admin",
  full_name: "Quản trị FinOS",
  role: "admin",
  is_active: true,
};

let nextId = 10;
let jobPoll = 0;
let transactions: Transaction[] = [];

function resetDemoData() {
  nextId = 10;
  jobPoll = 0;
  transactions = [
    makeTransaction("2026-06-06", "P201", "Tiền phòng 1 đêm", "income", 780_000, "manual"),
    makeTransaction("2026-06-06", "P102", "Cọc giữ phòng", "income", 500_000, "manual"),
    makeTransaction("2026-06-05", "Bếp", "Mua thực phẩm sáng", "expense", 320_000, "manual"),
    makeTransaction("2026-06-04", "P305", "Phụ thu giặt sấy", "income", 120_000, "ocr"),
    makeTransaction("2026-06-03", "Kho", "Vật tư vệ sinh", "expense", 210_000, "manual"),
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

function summary() {
  const visible = visibleTransactions();
  const total_income = visible.filter((t) => t.kind === "income").reduce((sum, t) => sum + t.amount, 0);
  const total_expense = visible.filter((t) => t.kind === "expense").reduce((sum, t) => sum + t.amount, 0);
  return {
    total_income,
    total_expense,
    balance: total_income - total_expense,
    count: visible.length,
  };
}

function timeseries() {
  const buckets = new Map<string, { period: string; income: number; expense: number }>();
  for (const t of visibleTransactions()) {
    const period = t.txn_date;
    const bucket = buckets.get(period) ?? { period, income: 0, expense: 0 };
    if (t.kind === "income") bucket.income += t.amount;
    else bucket.expense += t.amount;
    buckets.set(period, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockApi(page: Page) {
  resetDemoData();

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (path === "/auth/login" && method === "POST") {
      return json(route, { access_token: "demo-token", user });
    }
    if (path === "/auth/me") {
      if (!request.headers().authorization) {
        return json(route, { detail: "Chưa đăng nhập" }, 401);
      }
      return json(route, user);
    }
    if (path === "/stats/summary") {
      return json(route, summary());
    }
    if (path === "/stats/timeseries") {
      return json(route, timeseries());
    }
    if (path === "/transactions" && method === "GET") {
      const kind = url.searchParams.get("kind");
      const items = visibleTransactions().filter((t) => !kind || t.kind === kind);
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
      item.job_id = body.job_id ?? null;
      transactions.push(item);
      return json(route, item, 201);
    }
    if (/^\/transactions\/\d+$/.test(path) && method === "PATCH") {
      const id = Number(path.split("/").pop());
      const body = JSON.parse(request.postData() || "{}");
      transactions = transactions.map((t) => (t.id === id ? { ...t, ...body } : t));
      return json(route, transactions.find((t) => t.id === id));
    }
    if (path === "/ocr/upload" && method === "POST") {
      jobPoll = 0;
      return json(route, { id: 7001, status: "queued" }, 201);
    }
    if (path === "/ocr/jobs/7001") {
      jobPoll += 1;
      if (jobPoll === 1) {
        return json(route, { job_id: 7001, status: "queued", stage: null, rotate: 180, rows: [] });
      }
      if (jobPoll === 2) {
        return json(route, { job_id: 7001, status: "processing", stage: "preparing", rotate: 180, rows: [] });
      }
      if (jobPoll === 3) {
        return json(route, { job_id: 7001, status: "processing", stage: "recognizing", rotate: 180, rows: [] });
      }
      if (jobPoll === 4) {
        return json(route, { job_id: 7001, status: "processing", stage: "parsing", rotate: 180, rows: [] });
      }
      return json(route, {
        job_id: 7001,
        status: "done",
        stage: null,
        rotate: 180,
        image_path: "/api/ocr/image/7001",
        rows: [
          ocrRow("2026-06-06", "P203", "Tiền phòng 2 đêm", "income", "1250000", 0.88),
          ocrRow("2026-06-06", "P101", "Nước uống minibar", "income", "85000", 0.92),
          ocrRow("2026-06-06", "Bếp", "Mua rau sáng", "expense", "320000", 0.84),
        ],
      });
    }
    if (path === "/ocr/image/7001") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureImage,
      });
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

async function pause(page: Page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function snap(page: Page, label: string) {
  frameSeq += 1;
  await page.screenshot({
    path: join(framesDir, `${String(frameSeq).padStart(2, "0")}-${label}.png`),
    animations: "disabled",
  });
}

test("quay video demo luồng OCR và duyệt chứng từ", async ({ page }) => {
  frameSeq = 0;
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  await mockApi(page);
  await page.setViewportSize({ width: 960, height: 600 });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await snap(page, "login");
  await pause(page);

  await page.getByLabel("Tên đăng nhập").fill("admin");
  await page.getByLabel("Mật khẩu").fill("admin123");
  await pause(page, 700);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();

  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expect(page.getByText("Số liệu tháng này")).toBeVisible();
  await snap(page, "dashboard");
  await pause(page, 1_500);

  await page.getByRole("combobox").selectOption("month");
  await pause(page, 1_200);

  await page.getByRole("link", { name: /Chụp sổ/ }).click();
  await expect(page.getByRole("heading", { name: "Chụp / tải ảnh sổ" })).toBeVisible();
  await snap(page, "capture");
  await pause(page, 1_000);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Từ album/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixturePath);

  await expect(page.getByAltText("Xem trước ảnh sổ")).toBeVisible();
  await snap(page, "preview");
  await pause(page, 1_300);
  await page.getByRole("button", { name: /Xoay 90/ }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: /OCR & duyệt/ }).click();

  await expect(page.getByRole("heading", { name: "Đang xử lý ảnh sổ" })).toBeVisible();
  await expect(page.getByText("Nhận dạng bằng AI")).toBeVisible();
  await expect(page.getByText("Tách dữ liệu")).toBeVisible();
  await snap(page, "processing");

  await expect(page.getByText("Duyệt lại từng dòng trước khi lưu.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByAltText("Ảnh sổ gốc")).toBeVisible();
  await snap(page, "review");
  await pause(page, 1_600);

  await page.getByLabel("Phòng / khách").first().fill("P203 - Anh Nam");
  await page.getByLabel("Nội dung").first().fill("Tiền phòng 2 đêm");
  await page.getByLabel(/Số tiền/).first().fill("1250000");
  await pause(page, 1_000);

  await page.getByTitle("Xóa dòng").nth(2).click();
  await pause(page, 900);
  await page.getByRole("button", { name: /Thêm dòng/ }).click();
  await pause(page, 900);

  await page.getByLabel("Loại").last().selectOption("expense");
  await page.getByLabel("Phòng / khách").last().fill("P305");
  await page.getByLabel("Nội dung").last().fill("Phụ thu giặt là");
  await page.getByLabel(/Số tiền/).last().fill("120000");
  await snap(page, "review-edited");
  await pause(page, 1_200);

  await page.getByRole("button", { name: /Lưu tất cả/ }).click();

  await expect(page.getByRole("heading", { name: "Chứng từ" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "P203 - Anh Nam" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Phụ thu giặt là" })).toBeVisible();
  await snap(page, "transactions");
  await pause(page, 1_500);

  await page.getByLabel("Loại").selectOption("expense");
  await page.getByRole("button", { name: /Lọc/ }).click();
  await expect(page.getByRole("cell", { name: /Phụ thu giặt là/ })).toBeVisible();
  await snap(page, "transactions-filtered");
  await pause(page, 1_500);

  await page.getByRole("link", { name: /Tổng quan/ }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expect(page.getByText("Thu / Chi theo ngày")).toBeVisible();
  await snap(page, "dashboard-final");
  await pause(page, 2_000);
});
