from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LearningCategory(Base):
    """
    Cây danh mục lĩnh vực và môn học động.
    Hỗ trợ đa cấp: Lĩnh vực gốc (Parent) -> Môn học / Chuyên ngành (Child).
    Ví dụ: 'Toán học' -> 'Đại số', 'Ngoại ngữ' -> 'Tiếng Anh', 'Công nghệ' -> 'Lập trình Python'.
    """
    __tablename__ = "learning_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Lucide icon name, e.g. "Calculator", "Globe", "Code"
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("learning_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Self-referential relationship
    parent: Mapped["LearningCategory | None"] = relationship(
        "LearningCategory", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["LearningCategory"]] = relationship(
        "LearningCategory", back_populates="parent", cascade="all", order_by="LearningCategory.order_index"
    )

    # Courses in this category
    courses: Mapped[list["Course"]] = relationship(  # noqa: F821
        "Course", back_populates="learning_category"
    )

    def __repr__(self) -> str:
        return f"<LearningCategory id={self.id} name={self.name!r} slug={self.slug!r}>"
