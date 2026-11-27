"""Add curriculum sections without moving existing lessons."""

import sqlalchemy as sa
from alembic import context, op

revision = "0021_course_sections"
down_revision = "0020_course_review"
branch_labels = None
depends_on = None


def upgrade():
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    if inspector is None or not inspector.has_table("course_sections"):
        op.create_table(
            "course_sections",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("course_id", sa.Integer, sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(180), nullable=False),
            sa.Column("order_index", sa.Integer, nullable=False),
        )
        op.create_index("ix_course_sections_course_id", "course_sections", ["course_id"])
    if inspector is None or all(c["name"] != "section_id" for c in inspector.get_columns("lessons")):
        op.add_column("lessons", sa.Column("section_id", sa.Integer, nullable=True))
        op.create_foreign_key("fk_lessons_section", "lessons", "course_sections", ["section_id"], ["id"], ondelete="SET NULL")
        op.create_index("ix_lessons_section_id", "lessons", ["section_id"])


def downgrade():
    op.drop_index("ix_lessons_section_id", table_name="lessons")
    op.drop_column("lessons", "section_id")
    op.drop_table("course_sections")
