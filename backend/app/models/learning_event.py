from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LearningEvent(Base):
    """Sự kiện học tập tối giản phục vụ phân tích và đánh giá hiệu quả.

    Chỉ ghi những sự kiện có ý nghĩa sư phạm (mở bài, xem video, mở học liệu,
    nộp bài, hỏi gia sư AI). Không lưu nội dung câu trả lời hay dữ liệu cá nhân
    ngoài mã người dùng/khóa/bài; metadata chỉ chứa thông tin kỹ thuật ngắn.
    """

    __tablename__ = "learning_events"
    __table_args__ = (
        Index("ix_learning_events_course_type_created", "course_id", "event_type", "created_at"),
        Index("ix_learning_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # lesson_view | video_play | material_open | quiz_submit | ai_chat | ...
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<LearningEvent {self.event_type} user={self.user_id} course={self.course_id}>"
