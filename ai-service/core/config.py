"""
Smart LMS - AI Service Configuration
Đọc settings từ biến môi trường (.env) bằng Pydantic Settings.
"""

import os
from typing import List, Any
import json
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator, model_validator


class Settings(BaseSettings):
    """Tất cả cấu hình của AI Service."""

    # ---- App ----
    APP_NAME: str = "Smart LMS AI Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    PORT: int = 8001

    # ---- Google Gemini ----
    GOOGLE_API_KEY: str = Field(default="demo_google_api_key", description="Google Gemini API Key")
    GEMINI_MODEL: str = "gemini-flash-latest"
    GEMINI_FALLBACK_MODELS: list[str] = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-pro-latest"]
    GEMINI_EMBEDDING_MODEL: str = "models/gemini-embedding-001"

    # ---- OpenAI (fallback) ----
    OPENAI_API_KEY: str = Field(default="", description="OpenAI API Key (optional)")
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ---- Groq (fallback khi Gemini hết quota) ----
    GROQ_API_KEY: str = Field(default="", description="Groq API Key (fallback khi Gemini 429)")
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # ---- Provider Priority ----
    AI_PROVIDER: str = "gemini"       # "gemini" | "openai"
    EMBEDDING_PROVIDER: str = "gemini"  # "gemini" | "openai" | "sentence-transformers"

    # ---- Database ----
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgrespassword@localhost:5432/smart_lms"
    )
    DATABASE_SYNC_URL: str = Field(
        default="postgresql://postgres:postgrespassword@localhost:5432/smart_lms"
    )

    # ---- Redis ----
    REDIS_URL: str = "redis://localhost:6379/0"

    # ---- Bảo mật nội bộ ----
    # Khóa dùng để Backend gọi AI Service (header X-Internal-Api-Key).
    # Để rỗng = tắt kiểm tra (tiện cho dev/test cục bộ). Đặt giá trị thật khi triển khai.
    INTERNAL_API_KEY: str = Field(
        default="",
        description="Khoa noi bo backend gui qua header X-Internal-Api-Key",
    )

    # ---- CORS ----
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["http://localhost:3000", "http://localhost:8000"]
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:3000", "http://localhost:8000"]

    @model_validator(mode="after")
    def _resolve_google_key(self) -> "Settings":
        """Cho phép dùng GEMINI_API_KEY khi GOOGLE_API_KEY chưa được đặt.

        docker compose truyền biến GEMINI_API_KEY, còn code đọc GOOGLE_API_KEY.
        Chỉ fallback khi GOOGLE_API_KEY còn trống/placeholder để tránh ghi đè
        nhầm key thật đang có trong .env.
        """
        placeholders = {"", "demo_google_api_key", "your_google_api_key_here", "your_gemini_api_key_here"}
        current = (self.GOOGLE_API_KEY or "").strip()
        if current.lower() in placeholders:
            alt = (os.environ.get("GEMINI_API_KEY") or "").strip()
            if alt and alt.lower() not in placeholders:
                self.GOOGLE_API_KEY = alt
        return self

    # ---- Document Processing ----
    MAX_FILE_SIZE_MB: int = 50
    CHUNK_SIZE: int = 1000           # Số ký tự mỗi chunk
    CHUNK_OVERLAP: int = 200         # Số ký tự overlap giữa các chunk
    MAX_CHUNKS_PER_QUERY: int = 5    # Số chunk tối đa trả về cho RAG

    # ---- RAG Settings ----
    SIMILARITY_THRESHOLD: float = 0.50   # Ngưỡng cosine similarity cho Gemini embeddings
    MAX_CONTEXT_TOKENS: int = 8000       # Giới hạn tokens cho context

    # ---- Whisper (Speech-to-Text) ----
    WHISPER_MODEL: str = "base"  # tiny | base | small | medium | large

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Singleton instance - import và dùng ở mọi nơi
settings = Settings()
