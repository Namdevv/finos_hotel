// Tiện ích dùng chung.

/** Định dạng tiền VND: 1200000 -> "1.200.000 ₫". */
export function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

/** Parse chuỗi tiền người dùng gõ -> số nguyên VND. */
export function parseVnd(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Định dạng giá trị ô nhập tiền theo từng phím gõ: "10000" -> "10.000".
 * Chỉ giữ chữ số rồi chấm phân nhóm hàng nghìn (kiểu vi-VN), không kèm ký
 * hiệu ₫ để người dùng tiếp tục gõ. Chuỗi rỗng -> "".
 */
export function fmtVndInput(s: string): string {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? new Intl.NumberFormat("vi-VN").format(parseInt(digits, 10)) : "";
}

/**
 * Resize nhẹ ảnh phía client TRƯỚC khi upload — chỉ để chặn ảnh quá khổ.
 *
 * QUAN TRỌNG cho chất lượng OCR: KHÔNG bóp quá tay ở đây, vì server (vlm.py)
 * mới là nơi resize/encode cuối cùng đưa vào VLM (FINOS_OCR_MAX_SIDE, q92).
 * Gửi rộng & nét hơn server target để server tự hạ về mức chuẩn → giữ nét chữ
 * viết tay. Cạnh dài tối đa ~3000px, JPEG chất lượng 0.92.
 */
export async function compressImage(
  file: File,
  maxSide = 3000,
  quality = 0.92,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > maxSide) {
    const scale = maxSide / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Nén ảnh thất bại"))),
      "image/jpeg",
      quality,
    ),
  );
}

/** Ngưỡng confidence để cảnh báo field cần kiểm. */
export const LOW_CONF = 0.8;

export const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";

function datePartsInAppTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function todayIso(): string {
  const { year, month, day } = datePartsInAppTz();
  return `${year}-${month}-${day}`;
}

export function firstOfMonthIso(): string {
  const { year, month } = datePartsInAppTz();
  return `${year}-${month}-01`;
}

export function previousMonthRangeIso(): { start: string; end: string } {
  const { year, month } = datePartsInAppTz();
  const curYear = Number(year);
  const curMonth = Number(month);
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const mm = String(prevMonth).padStart(2, "0");
  return {
    start: `${prevYear}-${mm}-01`,
    end: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function parseUtcTimestamp(value: string): number {
  if (!value) return NaN;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasZone ? iso : `${iso}Z`);
}

export function fmtDateTime(value: string): string {
  const t = parseUtcTimestamp(value);
  if (Number.isNaN(t)) return value || "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

/**
 * Thời gian tương đối kiểu "vừa xong / 5 phút trước / 2 giờ trước / 3 ngày trước".
 * Chuỗi từ server là UTC dạng 'YYYY-MM-DD HH:MM:SS' (datetime('now')); thêm 'Z'
 * để JS hiểu là UTC trước khi so với hiện tại.
 */
export function relTime(value: string): string {
  const t = parseUtcTimestamp(value);
  if (Number.isNaN(t)) return value;
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "vừa xong";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(t));
}
