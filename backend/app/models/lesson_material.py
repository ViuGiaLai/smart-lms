from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LessonMaterial(Base):
    """Tệp học liệu thực tế thuộc một bài học.

    `lessons.resources_url` cũ chỉ là trường tương thích cho một URL; bảng này
    cho phép một bài có nhiều slide/tài liệu và tách video tải lên khỏi tài liệu.
    """

    __tablename__ = "lesson_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lesson_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # document | video
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True, unique=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ready", server_default="ready")
    error_message: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="materials")  # noqa: F821
