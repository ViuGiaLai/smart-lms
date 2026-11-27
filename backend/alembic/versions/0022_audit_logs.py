"""Add audit records for sensitive LMS changes."""

import sqlalchemy as sa
from alembic import context, op

revision = "0022_audit_logs"
down_revision = "0021_course_sections"
branch_labels = None
depends_on = None


def upgrade():
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("audit_logs"):
        return
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("details", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("audit_logs")
