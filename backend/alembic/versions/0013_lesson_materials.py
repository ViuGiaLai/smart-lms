"""many uploaded materials per lesson

Revision ID: 0013_lesson_materials
Revises: 0012_lesson_source_type
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_lesson_materials"
down_revision: Union[str, None] = "0012_lesson_source_type"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # Một số môi trường development dùng Base.metadata.create_all() khi khởi
    # động nên bảng có thể đã tồn tại trước khi Alembic được chạy lần đầu.
    # Không tạo lại bảng đó; migration tiếp theo sẽ bổ sung cột còn thiếu.
    if sa.inspect(op.get_bind()).has_table("lesson_materials"):
        return
    op.create_table(
        "lesson_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("file_url", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lesson_materials_lesson_id", "lesson_materials", ["lesson_id"])


def downgrade() -> None:
    op.drop_index("ix_lesson_materials_lesson_id", table_name="lesson_materials")
    op.drop_table("lesson_materials")
