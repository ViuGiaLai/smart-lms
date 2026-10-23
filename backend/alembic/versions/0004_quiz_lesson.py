"""quiz lesson link

Revision ID: 0004_quiz_lesson
Revises: 0003_course_slug
Create Date: 2026-10-20

Gan moi bo de voi bai hoc tuong ung de dong bo noi dung khoa hoc.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_quiz_lesson"
down_revision: Union[str, None] = "0003_course_slug"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("quizzes", sa.Column("lesson_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_quizzes_lesson_id_lessons",
        "quizzes",
        "lessons",
        ["lesson_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_quizzes_lesson_id"), "quizzes", ["lesson_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_quizzes_lesson_id"), table_name="quizzes")
    op.drop_constraint("fk_quizzes_lesson_id_lessons", "quizzes", type_="foreignkey")
    op.drop_column("quizzes", "lesson_id")
