from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, event, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    duration: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # seconds
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    resources_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # ── Nguồn YouTube & phụ đề (bài giảng nhập từ playlist/kênh) ──
    # Lưu ID video để chống import trùng trong cùng khóa học và để dựng link t=…s.
    youtube_video_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # none | ready | ingested | failed | missing
    subtitle_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="none", server_default="none"
    )
    subtitle_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Giữ nguyên SRT gốc để có thể ingest lại với đúng timestamp.
    subtitle_srt: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subtitle_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Nguồn học liệu (đặc tả §IV): youtube | upload | external | manual ──
    # Suy ra tự động khi tạo Lesson nếu endpoint không truyền tường minh.
    source_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="manual", server_default="manual"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─
    course: Mapped["Course"] = relationship("Course", back_populates="lessons")  # noqa: F821
    progress_records: Mapped[list["Progress"]] = relationship(  # noqa: F821
        "Progress", back_populates="lesson", cascade="all, delete-orphan"
    )
    materials: Mapped[list["LessonMaterial"]] = relationship(  # noqa: F821
        "LessonMaterial", back_populates="lesson", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Lesson id={self.id} title={self.title!r} order={self.order_index}>"


def _derive_lesson_source_type(mapper, connection, target: "Lesson") -> None:
    """Suy ra `source_type` từ video/youtube id khi endpoint không truyền tường minh."""
    if target.source_type and target.source_type not in ("manual", ""):
        return
    url = (target.video_url or "").lower()
    if target.youtube_video_id or "youtube.com" in url or "youtu.be" in url:
        target.source_type = "youtube"
    elif url:
        target.source_type = "external"
    else:
        target.source_type = "manual"


event.listen(Lesson, "before_insert", _derive_lesson_source_type)
