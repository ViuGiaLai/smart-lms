"""learning events and AI message feedback

Revision ID: 0017_learning_events_ai_feedback
Revises: 0016_course_reviews
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_learning_events_ai_feedback"
down_revision: Union[str, None] = "0016_course_reviews"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # create_all() có thể đã tạo bảng trước khi Alembic chạy ở môi trường dev.
    if not inspector.has_table("learning_events"):
        op.create_table(
            "learning_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "course_id",
                sa.Integer(),
                sa.ForeignKey("courses.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "lesson_id",
                sa.Integer(),
                sa.ForeignKey("lessons.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("event_type", sa.String(length=40), nullable=False),
            sa.Column("duration_seconds", sa.Integer(), nullable=True),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_learning_events_user_id", "learning_events", ["user_id"])
        op.create_index("ix_learning_events_course_id", "learning_events", ["course_id"])
        op.create_index("ix_learning_events_lesson_id", "learning_events", ["lesson_id"])
        op.create_index("ix_learning_events_event_type", "learning_events", ["event_type"])
        op.create_index("ix_learning_events_created_at", "learning_events", ["created_at"])
        op.create_index(
            "ix_learning_events_course_type_created",
            "learning_events",
            ["course_id", "event_type", "created_at"],
        )
        op.create_index(
            "ix_learning_events_user_created",
            "learning_events",
            ["user_id", "created_at"],
        )

    if not inspector.has_table("ai_message_feedback"):
        op.create_table(
            "ai_message_feedback",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "message_id",
                sa.Integer(),
                sa.ForeignKey("chat_messages.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("rating", sa.String(length=8), nullable=False),
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
            sa.UniqueConstraint(
                "message_id", "user_id", name="uq_ai_feedback_message_user"
            ),
        )
        op.create_index(
            "ix_ai_message_feedback_message_id", "ai_message_feedback", ["message_id"]
        )
        op.create_index("ix_ai_message_feedback_user_id", "ai_message_feedback", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("ai_message_feedback"):
        op.drop_index("ix_ai_message_feedback_user_id", table_name="ai_message_feedback")
        op.drop_index("ix_ai_message_feedback_message_id", table_name="ai_message_feedback")
        op.drop_table("ai_message_feedback")
    if inspector.has_table("learning_events"):
        op.drop_index("ix_learning_events_user_created", table_name="learning_events")
        op.drop_index("ix_learning_events_course_type_created", table_name="learning_events")
        op.drop_index("ix_learning_events_created_at", table_name="learning_events")
        op.drop_index("ix_learning_events_event_type", table_name="learning_events")
        op.drop_index("ix_learning_events_lesson_id", table_name="learning_events")
        op.drop_index("ix_learning_events_course_id", table_name="learning_events")
        op.drop_index("ix_learning_events_user_id", table_name="learning_events")
        op.drop_table("learning_events")
