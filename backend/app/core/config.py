from __future__ import annotations

import logging
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Cac gia tri SECRET_KEY khong an toan bi ship kem trong ma nguon/mau.
_INSECURE_SECRET_KEYS = {
    "changeme-at-least-32-characters-long!!",
    "supersecretkey_change_in_production_123456789",
    "your-secret-key-here",
    "secret",
}
_INSECURE_SECRET_PREFIXES = ("changeme", "supersecret", "your-secret", "your_secret", "dev_", "test_")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────
    APP_NAME: str = "Smart LMS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ── API ──
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ── Database ───────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/smart_lms"
    DATABASE_ECHO: bool = False

    # ── Security ───────
    SECRET_KEY: str = "changeme-at-least-32-characters-long!!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SEED_SECRET_KEY: str = "smartlms_super_admin_seed_secure_987654321"

    # ── Redis / Celery ─
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ── AWS S3 ─────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-southeast-1"
    S3_BUCKET_NAME: str = "smart-lms-media"

    # ── AI Service ─────
    AI_SERVICE_URL: str = "http://localhost:8001"
    AI_SERVICE_TIMEOUT: int = 120
    # Khoa noi bo gui kem header X-Internal-Api-Key khi goi AI Service.
    # De rong neu AI Service khong bat kiem tra (dev cuc bo).
    AI_SERVICE_INTERNAL_KEY: str = ""

    @property
    def ai_service_headers(self) -> dict[str, str]:
        """Header dung chung khi Backend goi AI Service."""
        headers: dict[str, str] = {}
        if self.AI_SERVICE_INTERNAL_KEY:
            headers["X-Internal-Api-Key"] = self.AI_SERVICE_INTERNAL_KEY
        return headers

    @model_validator(mode="after")
    def _validate_secret_key(self) -> "Settings":
        """Chan SECRET_KEY mac dinh/yeu: bao loi o production, canh bao o dev."""
        secret = (self.SECRET_KEY or "").strip()
        insecure = (
            not secret
            or secret in _INSECURE_SECRET_KEYS
            or len(secret) < 32
            or secret.lower().startswith(_INSECURE_SECRET_PREFIXES)
        )
        if insecure:
            if self.ENVIRONMENT.strip().lower() in ("production", "prod"):
                raise ValueError(
                    "SECRET_KEY chua an toan cho moi truong production. Hay dat bien moi truong "
                    "SECRET_KEY la chuoi ngau nhien >= 32 ky tu, vi du: "
                    'python -c "import secrets; print(secrets.token_urlsafe(48))"'
                )
            logger.warning(
                "SECRET_KEY dang dung gia tri mac dinh/khong an toan. "
                "Hay dat SECRET_KEY trong .env truoc khi trien khai thuc te."
            )
        return self


settings = Settings()
