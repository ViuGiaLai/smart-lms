"""AI essay grading, chat history and token usage

Revision ID: 0015_ai_grading_chat_usage
Revises: 0014_material_queue_status
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_ai_grading_chat_usage"
down_revision: Union[str, None] = "0014_material_queue_status"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "essay_gradings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("instructor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("student_name", sa.String(length=255), nullable=False),
        sa.Column("student_email", sa.String(length=255), nullable=True),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("student_answer", sa.Text(), nullable=False),
        sa.Column("reference_answer", sa.Text(), nullable=True),
        sa.Column("rubric", sa.JSON(), nullable=False),
        sa.Column("total_score", sa.Float(), nullable=False),
        sa.Column("max_total_score", sa.Float(), nullable=False, server_default="10"),
        sa.Column("percentage", sa.Float(), nullable=False, server_default="0"),
        sa.Column("grade_level", sa.String(length=8), nullable=False, server_default="C"),
        sa.Column("criteria_scores", sa.JSON(), nullable=False),
        sa.Column("overall_feedback", sa.Text(), nullable=True),
        sa.Column("strengths", sa.JSON(), nullable=False),
        sa.Column("improvements", sa.JSON(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="gemini"),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_essay_gradings_instructor_id", "essay_gradings", ["instructor_id"])
    op.create_index("ix_essay_gradings_course_id", "essay_gradings", ["course_id"])
    op.create_index("ix_essay_gradings_lesson_id", "essay_gradings", ["lesson_id"])
    op.create_index("ix_essay_gradings_created_at", "essay_gradings", ["created_at"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])
    op.create_index("ix_chat_messages_lesson_id", "chat_messages", ["lesson_id"])
    op.create_index(
        "ix_chat_messages_user_lesson_created",
        "chat_messages",
        ["user_id", "lesson_id", "created_at"],
    )

    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("feature", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="gemini"),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("lesson_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_usage_logs_feature", "ai_usage_logs", ["feature"])
    op.create_index("ix_ai_usage_logs_user_id", "ai_usage_logs", ["user_id"])
    op.create_index("ix_ai_usage_logs_lesson_id", "ai_usage_logs", ["lesson_id"])
    op.create_index("ix_ai_usage_logs_created_at", "ai_usage_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("ai_usage_logs")
    op.drop_table("chat_messages")
    op.drop_table("essay_gradings")
