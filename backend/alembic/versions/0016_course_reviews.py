"""course reviews and ratings

Revision ID: 0016_course_reviews
Revises: 0015_ai_grading_chat_usage
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_course_reviews"
down_revision: Union[str, None] = "0015_ai_grading_chat_usage"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # Base.metadata.create_all() có thể đã tạo bảng ở môi trường dev trước khi
    # Alembic chạy; khi đó chỉ cần ghi nhận revision, không tạo lại.
    if sa.inspect(op.get_bind()).has_table("course_reviews"):
        return
    op.create_table(
        "course_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "course_id",
            sa.Integer(),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("course_id", "user_id", name="uq_course_review_user"),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_course_review_rating"),
    )
    op.create_index("ix_course_reviews_course_id", "course_reviews", ["course_id"])
    op.create_index("ix_course_reviews_user_id", "course_reviews", ["user_id"])
    op.create_index("ix_course_reviews_created_at", "course_reviews", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_course_reviews_created_at", table_name="course_reviews")
    op.drop_index("ix_course_reviews_user_id", table_name="course_reviews")
    op.drop_index("ix_course_reviews_course_id", table_name="course_reviews")
    op.drop_table("course_reviews")
