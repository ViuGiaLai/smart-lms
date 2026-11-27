"""Store current quiz attempts and server deadlines."""

import sqlalchemy as sa
from alembic import context, op

revision = "0018_quiz_sessions"
down_revision = "0017_learning_events_ai_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("quiz_sessions"):
        return
    op.create_table(
        "quiz_sessions",
        sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("token", sa.String(32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True)),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("quiz_submissions.id", ondelete="SET NULL")),
    )


def downgrade() -> None:
    op.drop_table("quiz_sessions")
