"""Add the pending moderation state and reviewer feedback."""

import sqlalchemy as sa
from alembic import context, op

revision = "0020_course_review"
down_revision = "0019_demo_checkout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'in_review'")
    columns = [] if context.is_offline_mode() else sa.inspect(op.get_bind()).get_columns("courses")
    if not any(column["name"] == "review_note" for column in columns):
        op.add_column("courses", sa.Column("review_note", sa.Text(), nullable=True))


def downgrade() -> None:
    # PostgreSQL cannot remove a single enum value without rebuilding the type.
    op.execute("UPDATE courses SET status = 'draft' WHERE status = 'in_review'")
    op.drop_column("courses", "review_note")
