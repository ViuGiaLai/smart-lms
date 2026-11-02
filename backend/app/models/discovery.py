from __future__ import annotations

import enum
from datetime import datetime
from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DiscoveryStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    converted = "converted"


class DiscoveryJob(Base):
    """
    Theo dõi phiên tìm kiếm & khám phá học liệu bằng AI.
    Admin hoặc Giảng viên nhập chủ đề (ví dụ: 'Toán lớp 8 - Phân thức đại số').
    AI tìm kiếm, đề xuất danh mục, chương trình, bài học, video và tài liệu.
    """
    __tablename__ = "discovery_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic: Mapped[str] = mapped_column(String(512), nullable=False)
    target_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    domain_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[DiscoveryStatus] = mapped_column(
        Enum(DiscoveryStatus, name="discoverystatus"), default=DiscoveryStatus.pending, nullable=False
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Lưu cấu trúc khóa học đề xuất hoàn chỉnh dạng JSON (Syllabus, Lessons, Videos, References, Quizzes)
    proposed_blueprint: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items: Mapped[list["DiscoveryItem"]] = relationship(
        "DiscoveryItem", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<DiscoveryJob id={self.id} topic={self.topic!r} status={self.status}>"


class DiscoveryItem(Base):
    """
    Chi tiết từng tài nguyên AI khám phá được:
    - Loại: 'curriculum', 'video', 'document', 'exercise', 'category'
    - Nguồn tham khảo: YouTube, OER, Bộ GD&ĐT, Đại học mở,...
    """
    __tablename__ = "discovery_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("discovery_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(String(50), nullable=False)  # video, document, exercise, topic
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # YouTube, OER, KhanAcademy, v.v.
    metadata_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[DiscoveryStatus] = mapped_column(
        Enum(DiscoveryStatus, name="discoverystatus"), default=DiscoveryStatus.pending, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    job: Mapped["DiscoveryJob"] = relationship("DiscoveryJob", back_populates="items")

    def __repr__(self) -> str:
        return f"<DiscoveryItem id={self.id} title={self.title!r} type={self.item_type}>"
