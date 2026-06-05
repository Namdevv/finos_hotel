"""Cấu hình ứng dụng, đọc từ biến môi trường / file .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # thư mục backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FINOS_",
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    secret_key: str = "dev-insecure-secret-change-me"
    access_token_minutes: int = 720
    db_path: str = "finos.db"
    upload_dir: str = "uploads"
    max_upload_mb: int = 12

    admin_username: str = "admin"
    admin_password: str = "admin123"

    ocr_idle_unload_minutes: int = 5

    @property
    def db_file(self) -> Path:
        p = Path(self.db_path)
        return p if p.is_absolute() else BASE_DIR / p

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        return p if p.is_absolute() else BASE_DIR / p


@lru_cache
def get_settings() -> Settings:
    return Settings()
