from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Progress(Base):
    __tablename__ = "progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson_progress"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    percent_complete: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False
    )  # 0.0 – 100.0
    is_completed: Mapped[bool] = mapped_column(
        # auto-derived convenience flag
        default=False,
        nullable=False,
    )
    last_position: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )  # video position in seconds

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─
    user: Mapped["User"] = relationship("User", back_populates="progress_records")  # noqa: F821
    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="progress_records")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Progress user={self.user_id} lesson={self.lesson_id} pct={self.percent_complete}>"
