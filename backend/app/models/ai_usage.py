from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AiUsageLog(Base):
    """Nhật ký tiêu thụ token của AI Service, phục vụ giám sát vận hành.

    AI Service ghi trực tiếp vào bảng này sau mỗi lần gọi mô hình. Số liệu có
    thể là số thật do nhà cung cấp trả về (`is_estimated = false`) hoặc ước
    lượng theo độ dài văn bản khi nhà cung cấp không trả metadata.
    """

    __tablename__ = "ai_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    feature: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # tutor | quiz | grader
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="gemini")
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    lesson_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
