"""Persist practical assignments and every submission."""

import sqlalchemy as sa
from alembic import context, op

revision = "0024_assignments"
down_revision = "0023_internal_courses"
branch_labels = None
depends_on = None


def upgrade():
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    if inspector is None or not inspector.has_table("assignments"):
        op.create_table(
            "assignments",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("course_id", sa.Integer, sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(180), nullable=False),
            sa.Column("instructions", sa.Text, nullable=False),
            sa.Column("due_at", sa.DateTime(timezone=True)),
            sa.Column("max_attempts", sa.Integer, nullable=False),
            sa.Column("max_score", sa.Integer, nullable=False),
        )
        op.create_index("ix_assignments_course_id", "assignments", ["course_id"])
    if inspector is None or not inspector.has_table("assignment_submissions"):
        op.create_table(
            "assignment_submissions",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("assignment_id", sa.Integer, sa.ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("attempt", sa.Integer, nullable=False),
            sa.Column("content", sa.Text),
            sa.Column("repository_url", sa.String(1024)),
            sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("score", sa.Integer),
            sa.Column("feedback", sa.Text),
            sa.Column("graded_by", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("graded_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("assignment_id", "student_id", "attempt"),
        )
        op.create_index("ix_assignment_submissions_assignment_id", "assignment_submissions", ["assignment_id"])


def downgrade():
    op.drop_table("assignment_submissions")
    op.drop_table("assignments")
