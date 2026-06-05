"""Bọc RapidOCR (PaddleOCR PP-OCR chạy trên ONNX Runtime).

Thiết kế cho máy 4GB:
- Lazy-load: chỉ nạp model khi job đầu tiên chạy.
- unload(): cho phép worker giải phóng model khỏi RAM khi nhàn rỗi.
- Trả về danh sách (box, text, confidence) đã chuẩn hóa.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass
class Word:
    text: str
    confidence: float
    cx: float          # tâm x
    cy: float          # tâm y
    x0: float
    y0: float
    x1: float
    y1: float


class OcrEngine:
    """Singleton có khóa: đảm bảo concurrency = 1 cho phần nặng RAM."""

    def __init__(self) -> None:
        self._engine = None
        self._lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        if self._engine is None:
            # Import trong hàm để khỏi kéo thư viện nặng lúc khởi động web.
            from rapidocr_onnxruntime import RapidOCR

            self._engine = RapidOCR()

    def unload(self) -> None:
        """Giải phóng model khỏi RAM (gọi khi nhàn rỗi)."""
        with self._lock:
            self._engine = None

    @property
    def loaded(self) -> bool:
        return self._engine is not None

    def recognize(self, image_bgr) -> list[Word]:
        """Chạy OCR; trả về danh sách Word. Có khóa để chỉ 1 job chạy 1 lúc."""
        with self._lock:
            self._ensure_loaded()
            result, _elapse = self._engine(image_bgr)

        words: list[Word] = []
        if not result:
            return words
        for box, text, score in result:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            x0, x1 = min(xs), max(xs)
            y0, y1 = min(ys), max(ys)
            words.append(
                Word(
                    text=str(text).strip(),
                    confidence=float(score),
                    cx=(x0 + x1) / 2,
                    cy=(y0 + y1) / 2,
                    x0=x0, y0=y0, x1=x1, y1=y1,
                )
            )
        return words


# Một instance dùng chung toàn tiến trình.
engine = OcrEngine()
