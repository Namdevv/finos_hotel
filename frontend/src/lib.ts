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
