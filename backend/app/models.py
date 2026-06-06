"""Pydantic models cho request/response."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["admin", "accountant", "receptionist"]
Kind = Literal["income", "expense"]


# ----- Auth -----
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ----- Users -----
class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: Role
    is_active: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = ""
    password: str = Field(min_length=6)
    role: Role


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)
    role: Optional[Role] = None
    is_active: Optional[bool] = None


# ----- Transactions -----
class TransactionBase(BaseModel):
    txn_date: str = Field(description="YYYY-MM-DD")
    room: str = ""
    note: str = ""
    kind: Kind
    amount: int = Field(ge=0, description="Số tiền VND")


class TransactionCreate(TransactionBase):
    source: Literal["ocr", "manual"] = "manual"
    job_id: Optional[int] = None
    image_path: Optional[str] = None


class TransactionUpdate(BaseModel):
    txn_date: Optional[str] = None
    room: Optional[str] = None
    note: Optional[str] = None
    kind: Optional[Kind] = None
    amount: Optional[int] = Field(default=None, ge=0)


class TransactionOut(TransactionBase):
    id: int
    source: str
    job_id: Optional[int] = None
    image_path: Optional[str] = None
    created_by: int
    created_at: str


# ----- Jobs / OCR -----
class JobOut(BaseModel):
    id: int
    status: str
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str
    finished_at: Optional[str] = None


class OcrField(BaseModel):
    """Một field đã trích, kèm độ tin cậy để UI highlight chỗ cần kiểm."""
    value: str = ""
    confidence: float = 0.0


class OcrRow(BaseModel):
    """Một dòng chứng từ do OCR đề xuất (người dùng sẽ duyệt/sửa)."""
    txn_date: OcrField
    room: OcrField
    note: OcrField
    kind: Literal["income", "expense"] = "income"
    amount: OcrField
    min_confidence: float = 0.0


class JobResult(BaseModel):
    job_id: int
    status: str
    stage: Optional[str] = None   # 'preparing'|'recognizing'|'parsing' khi đang xử lý
    rotate: Optional[int] = None  # góc xoay đã dùng (re-OCR)
    cancelled: bool = False       # người dùng đã ngưng job
    image_path: Optional[str] = None
    rows: list[OcrRow] = []
    error: Optional[str] = None


class JobSummary(BaseModel):
    """Một mục trong thư viện ảnh đã upload (trang lịch sử)."""
    id: int
    status: str
    stage: Optional[str] = None
    error: Optional[str] = None
    rotate: Optional[int] = None
    cancelled: bool = False
    n_rows: int = 0               # số dòng đã trích (nếu xong)
    image_path: Optional[str] = None
    created_at: str
    finished_at: Optional[str] = None


class ReocrRequest(BaseModel):
    rotate: Optional[int] = None  # góc xoay mới (0/90/180/270); None = giữ mặc định


# ----- Stats -----
class StatsSummary(BaseModel):
    total_income: int
    total_expense: int
    balance: int
    count: int


class StatsBucket(BaseModel):
    period: str        # 'YYYY-MM-DD' hoặc 'YYYY-MM'
    income: int
    expense: int
