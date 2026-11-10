from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CourseReview(Base):
    """Đánh giá khóa học của học viên đã ghi danh.

    Mỗi học viên chỉ có một đánh giá cho một khóa học; gửi lại sẽ cập nhật
    đánh giá cũ thay vì tạo bản ghi trùng.
    """

    __tablename__ = "course_reviews"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_review_user"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_course_review_rating"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    course: Mapped["Course"] = relationship("Course", back_populates="reviews")  # noqa: F821
    user: Mapped["User"] = relationship("User", back_populates="course_reviews")  # noqa: F821

    def __repr__(self) -> str:
        return f"<CourseReview course={self.course_id} user={self.user_id} rating={self.rating}>"
