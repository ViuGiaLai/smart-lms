from __future__ import annotations

from datetime import datetime
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StudentTopicMastery(Base):
    """
    Theo dõi năng lực thực tế của học viên trên từng môn/chủ đề:
    - mastery_score: 0.0 -> 100.0 (% thành thạo)
    - strong_points: Danh sách các dạng bài / khái niệm đã hiểu vững
    - weak_points: Danh sách các phần còn yếu, hay sai
    - recommended_actions: Gợi ý bài học hoặc dạng bài tiếp theo
    """
    __tablename__ = "student_topic_mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "topic_name", name="uq_user_course_topic_mastery"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mastery_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    attempts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    weak_points: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    strong_points: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    recommended_next_step: Mapped[str | None] = mapped_column(String(512), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<StudentTopicMastery user={self.user_id} course={self.course_id} topic={self.topic_name!r} score={self.mastery_score}>"
