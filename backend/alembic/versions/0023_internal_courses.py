"""Distinguish invited courses from public free and public demo-paid courses."""

import sqlalchemy as sa
from alembic import context, op

revision = "0023_internal_courses"
down_revision = "0022_audit_logs"
branch_labels = None
depends_on = None


def upgrade():
    columns = [] if context.is_offline_mode() else sa.inspect(op.get_bind()).get_columns("courses")
    if all(column["name"] != "is_internal" for column in columns):
        op.add_column("courses", sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("courses", "is_internal")
