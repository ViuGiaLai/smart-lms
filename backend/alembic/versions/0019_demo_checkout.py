"""Persist simulated orders and payments."""

from alembic import op, context
import sqlalchemy as sa

revision = "0019_demo_checkout"
down_revision = "0018_quiz_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set() if context.is_offline_mode() else set(sa.inspect(op.get_bind()).get_table_names())
    if "demo_orders" not in existing:
        op.create_table(
            "demo_orders",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("status", sa.String(12), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("user_id", "course_id"),
        )
    if "demo_payments" not in existing:
        op.create_table(
            "demo_payments",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("order_id", sa.String(32), sa.ForeignKey("demo_orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("method", sa.String(24), nullable=False),
            sa.Column("status", sa.String(12), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_demo_payments_order_id", "demo_payments", ["order_id"])


def downgrade() -> None:
    op.drop_table("demo_payments")
    op.drop_table("demo_orders")
