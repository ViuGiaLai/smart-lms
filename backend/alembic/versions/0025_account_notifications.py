"""Add optional profile fields and inbox records."""

import sqlalchemy as sa
from alembic import context, op

revision = "0025_account_notifications"
down_revision = "0024_assignments"
branch_labels = None
depends_on = None


def upgrade():
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    if inspector is None or all(c["name"] != "profile_fields" for c in inspector.get_columns("users")):
        op.add_column("users", sa.Column("profile_fields", sa.JSON))
    if inspector is None or not inspector.has_table("notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(240), nullable=False),
            sa.Column("href", sa.String(300), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade():
    op.drop_table("notifications")
    op.drop_column("users", "profile_fields")
