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
 * Nén & resize ảnh phía client TRƯỚC khi upload.
 * Mục tiêu: giảm RAM/băng thông cho server 4GB. Cạnh dài tối đa ~2000px,
 * xuất JPEG chất lượng 0.85.
 */
export async function compressImage(
  file: File,
  maxSide = 2000,
  quality = 0.85,
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
