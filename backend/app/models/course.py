from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CourseStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    thumbnail: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[CourseStatus] = mapped_column(
        Enum(CourseStatus, name="coursestatus"), default=CourseStatus.draft, nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    level: Mapped[str | None] = mapped_column(String(50), nullable=True)  # beginner / intermediate / advanced

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─
    instructor: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="courses", foreign_keys=[instructor_id]
    )
    lessons: Mapped[list["Lesson"]] = relationship(  # noqa: F821
        "Lesson", back_populates="course", cascade="all, delete-orphan", order_by="Lesson.order_index"
    )
    quizzes: Mapped[list["Quiz"]] = relationship(  # noqa: F821
        "Quiz", back_populates="course", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Course id={self.id} title={self.title!r} status={self.status}>"
