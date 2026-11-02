"""lesson source_type – nguồn học liệu (youtube | upload | external | manual)

Bổ sung theo đặc tả Smart Tutor LMS §IV (Lesson có thể bổ sung `source_type`).
Không phá dữ liệu cũ: cột thêm với server_default và backfill theo dữ liệu sẵn có.

Revision ID: 0012_lesson_source_type
Revises: 0011_multidomain_and_discovery
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_lesson_source_type"
down_revision: Union[str, None] = "0011_multidomain_and_discovery"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "lessons",
        sa.Column("source_type", sa.String(length=20), nullable=False, server_default="manual"),
    )
    op.execute(
        "UPDATE lessons SET source_type = CASE "
        "WHEN youtube_video_id IS NOT NULL THEN 'youtube' "
        "WHEN video_url IS NOT NULL AND video_url <> '' THEN 'external' "
        "ELSE 'manual' END"
    )


def downgrade() -> None:
    op.drop_column("lessons", "source_type")
