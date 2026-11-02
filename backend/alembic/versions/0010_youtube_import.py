"""add YouTube import fields to lessons

Revision ID: 0010_youtube_import
Revises: 0009_password_reset
Create Date: 2026-10-31

Chức năng Import YouTube cần:
- youtube_video_id: chống tạo Lesson trùng và dựng link timestamp.
- subtitle_status/language/srt/checksum/error: theo dõi phụ đề, chống ingest
  trùng, giữ SRT gốc để ingest lại đúng mốc thời gian.
"""

from __future__ import annotations

import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_youtube_import"
down_revision: Union[str, None] = "0009_password_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_YT_PATTERN = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/))([A-Za-z0-9_-]{11})"
)


def upgrade() -> None:
    op.add_column("lessons", sa.Column("youtube_video_id", sa.String(length=32), nullable=True))
    op.add_column(
        "lessons",
        sa.Column(
            "subtitle_status",
            sa.String(length=20),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column("lessons", sa.Column("subtitle_language", sa.String(length=16), nullable=True))
    op.add_column("lessons", sa.Column("subtitle_srt", sa.Text(), nullable=True))
    op.add_column("lessons", sa.Column("subtitle_checksum", sa.String(length=64), nullable=True))
    op.add_column("lessons", sa.Column("subtitle_error", sa.Text(), nullable=True))
    op.create_index("ix_lessons_youtube_video_id", "lessons", ["youtube_video_id"])
    op.create_index(
        "uq_lessons_course_youtube_video",
        "lessons",
        ["course_id", "youtube_video_id"],
        unique=True,
        postgresql_where=sa.text("youtube_video_id IS NOT NULL"),
    )

    # Backfill ID cho các bài học đã có sẵn link YouTube để import lại không tạo trùng.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, course_id, video_url FROM lessons WHERE video_url IS NOT NULL")
    ).fetchall()
    seen: set[tuple[int, str]] = set()
    for lesson_id, course_id, video_url in rows:
        match = _YT_PATTERN.search(video_url or "")
        if not match:
            continue
        pair = (course_id, match.group(1))
        # Dữ liệu cũ có thể lặp cùng một video trong một khóa; chỉ gắn cho bản ghi đầu
        # để không vi phạm unique index mới.
        if pair in seen:
            continue
        seen.add(pair)
        bind.execute(
            sa.text("UPDATE lessons SET youtube_video_id = :vid WHERE id = :id"),
            {"vid": match.group(1), "id": lesson_id},
        )


def downgrade() -> None:
    op.drop_index("uq_lessons_course_youtube_video", table_name="lessons")
    op.drop_index("ix_lessons_youtube_video_id", table_name="lessons")
    op.drop_column("lessons", "subtitle_error")
    op.drop_column("lessons", "subtitle_checksum")
    op.drop_column("lessons", "subtitle_srt")
    op.drop_column("lessons", "subtitle_language")
    op.drop_column("lessons", "subtitle_status")
    op.drop_column("lessons", "youtube_video_id")
