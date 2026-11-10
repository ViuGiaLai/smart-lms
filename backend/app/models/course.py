from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
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
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
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
    # ── Mở rộng Đa Lĩnh Vực & Đa Trình Độ (Smart Tutor LMS Master Spec) ──
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("learning_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    education_level_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("education_levels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    grade_label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Lớp 4, Lớp 8, Đại học năm 1, v.v.
    proficiency_level: Mapped[str | None] = mapped_column(String(50), nullable=True)  # A1, A2, B1, B2, Cơ bản, Nâng cao
    target_audience: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Học sinh, Sinh viên, Người đi làm, Người tự học
    language: Mapped[str | None] = mapped_column(String(20), default="vi", nullable=True)  # vi, en
    # Mục tiêu/chuẩn đầu ra và yêu cầu tiên quyết do giảng viên nhập.
    # Lưu dạng mảng chuỗi thay vì nối vào description để hiển thị/nhận sửa độc lập.
    outcomes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    prerequisites: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

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
    learning_category: Mapped["LearningCategory | None"] = relationship(  # noqa: F821
        "LearningCategory", back_populates="courses", foreign_keys=[category_id]
    )
    education_level_rel: Mapped["EducationLevel | None"] = relationship(  # noqa: F821
        "EducationLevel", back_populates="courses", foreign_keys=[education_level_id]
    )
    lessons: Mapped[list["Lesson"]] = relationship(  # noqa: F821
        "Lesson", back_populates="course", cascade="all, delete-orphan", order_by="Lesson.order_index"
    )
    quizzes: Mapped[list["Quiz"]] = relationship(  # noqa: F821
        "Quiz", back_populates="course", cascade="all, delete-orphan"
    )
    enrollments: Mapped[list["Enrollment"]] = relationship(  # noqa: F821
        "Enrollment", back_populates="course", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["CourseReview"]] = relationship(  # noqa: F821
        "CourseReview", back_populates="course", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Course id={self.id} title={self.title!r} status={self.status}>"
