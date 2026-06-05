"""Tiền xử lý ảnh bằng OpenCV trước khi đưa vào OCR.

Mục tiêu: tăng độ chính xác chữ viết tay + giảm RAM (downscale ảnh lớn).
Giữ pipeline nhẹ: chỉ các bước rẻ và hiệu quả, xử lý tuần tự từng ảnh.

Lưu ý: cv2/numpy chỉ import bên trong hàm để web app khởi động được mà
không cần nạp các thư viện nặng này khi chưa chạy OCR.
"""
from __future__ import annotations

# Cạnh dài tối đa sau khi resize — chặn ảnh điện thoại quá lớn gây tốn RAM.
MAX_SIDE = 2000


def _downscale(img, max_side: int = MAX_SIDE):
    import cv2

    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return img
    scale = max_side / float(longest)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _deskew(gray):
    """Xoay ảnh về ngay ngắn dựa trên góc nghiêng của vùng chữ."""
    import cv2
    import numpy as np

    inv = cv2.bitwise_not(gray)
    thr = cv2.threshold(inv, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thr > 0))
    if coords.shape[0] < 50:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5:  # gần như thẳng rồi, khỏi xoay cho đỡ mờ
        return gray
    h, w = gray.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocess(image_bgr):
    """Nhận ảnh BGR (như cv2.imread trả về), trả ảnh BGR đã xử lý cho OCR."""
    import cv2

    img = _downscale(image_bgr)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, None, h=7, templateWindowSize=7, searchWindowSize=21)
    gray = _deskew(gray)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def load_image(path: str):
    """Đọc ảnh từ file, hỗ trợ đường dẫn Unicode (tên file tiếng Việt) trên Windows."""
    import cv2
    import numpy as np

    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Không đọc được ảnh: {path}")
    return img
