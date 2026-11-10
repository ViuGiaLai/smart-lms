from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EssayGrading(Base):
    """Kết quả chấm bài tự luận bằng AI theo bảng tiêu chí (Rubric).

    Bản ghi được lưu lại để giảng viên xem lại lịch sử chấm, đối chiếu điểm
    từng tiêu chí và phản hồi đã gửi cho học viên.
    """

    __tablename__ = "essay_gradings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    instructor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    student_name: Mapped[str] = mapped_column(String(255), nullable=False)
    student_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    reference_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    rubric: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    max_total_score: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    grade_level: Mapped[str] = mapped_column(String(8), nullable=False, default="C")
    criteria_scores: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    improvements: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="gemini")
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    instructor: Mapped["User"] = relationship("User")  # noqa: F821
