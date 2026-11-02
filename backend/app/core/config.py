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
        env_file=(".env", "backend/.env"),
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

    @property
    def cors_allow_origin_regex(self) -> str | None:
        """Regex origin bổ sung cho môi trường phát triển.

        Next.js tự chọn cổng khác (vd 52816) khi 3000 đang bận. Nếu chỉ dùng
        danh sách cứng thì preflight CORS trả 400 và MỌI request dữ liệu của
        frontend thất bại (giao diện báo "Không thể tải… Vui lòng thử lại").

        Chỉ mở cho loopback khi KHÔNG phải production; production vẫn chỉ dùng
        ALLOWED_ORIGINS để không nới rộng quyền cho domain lạ.
        """
        if self.ENVIRONMENT.strip().lower() in ("production", "prod"):
            return None
        return r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"

    # ── Database ───────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/smart_lms"
    DATABASE_ECHO: bool = False
    # pool_pre_ping chạy "SELECT 1" mỗi lần mượn connection: với DB ở xa (VN→SG)
    # tốn thêm ~1 round-trip (~200 ms/request). Đo được 503 → 240 ms khi tắt.
    # Bù lại bằng pool_recycle để loại connection cũ trước khi server/pooler đóng.
    DATABASE_POOL_PRE_PING: bool = True
    DATABASE_POOL_RECYCLE: int = 240

    # ── Security ───────
    SECRET_KEY: str = "changeme-at-least-32-characters-long!!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Không đặt giá trị mặc định trong mã nguồn: secret dùng cho seed script phải
    # được cấp qua biến môi trường (SEED_SECRET_KEY) và không commit lên git.
    SEED_SECRET_KEY: str = ""
    # Đăng nhập nhanh theo vai trò (không cần mật khẩu) chỉ dành cho demo nội bộ.
    # Mặc định TẮT; production bắt buộc để false.
    ALLOW_DEMO_LOGIN: bool = False

    # ── Chống brute-force (in-process, theo IP) ───────
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 10
    REGISTER_RATE_LIMIT_PER_MINUTE: int = 5
    REFRESH_RATE_LIMIT_PER_MINUTE: int = 30

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
    # Cloudinary: luu anh bia khoa hoc / thumbnail
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_FOLDER: str = "smart-lms/courses"

    # ── YouTube Import ──
    # Chi dung YouTube Data API v3 de lay metadata; khong tai video.
    YOUTUBE_API_KEY: str = ""
    YOUTUBE_IMPORT_ENABLED: bool = False
    # yt-dlp chi la cong cu ho tro lay phu de khi duoc phep; co the tat.
    YOUTUBE_SUBTITLE_ENABLED: bool = False
    YOUTUBE_SUBTITLE_TIMEOUT: int = 60
    YOUTUBE_SUBTITLE_LANGUAGES: str = "vi,en"
    # Gioi han so video moi lan phan tich nguon (playlist/kenh rat dai).
    YOUTUBE_MAX_ITEMS: int = 200

    AI_SERVICE_URL: str = "http://localhost:8001"
    AI_SERVICE_TIMEOUT: int = 120
    # Khoa noi bo gui kem header X-Internal-Api-Key khi goi AI Service.
    # De rong neu AI Service khong bat kiem tra (dev cuc bo).
    AI_SERVICE_INTERNAL_KEY: str = ""

    # ── Quen mat khau / gui email ─────
    # Dung de tao link dat lai mat khau trong email.
    FRONTEND_URL: str = "http://localhost:3000"
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    FORGOT_RATE_LIMIT_PER_MINUTE: int = 5
    # Neu SMTP_HOST trong: backend ghi link vao log (chi o moi truong dev).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_STARTTLS: bool = True
    SMTP_SSL: bool = False

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

    @model_validator(mode="after")
    def _validate_demo_login(self) -> "Settings":
        """Chan viec bat dang nhap demo o moi truong production."""
        if self.ALLOW_DEMO_LOGIN and self.ENVIRONMENT.strip().lower() in ("production", "prod"):
            raise ValueError(
                "ALLOW_DEMO_LOGIN phai la false o moi truong production. "
                "Dang nhap demo khong yeu cau mat khau nen khong duoc phep bat."
            )
        return self


settings = Settings()
