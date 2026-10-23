"""course slug

Revision ID: 0003_course_slug
Revises: 0002_enrollments
Create Date: 2026-10-20

Thêm cột `courses.slug` làm định danh URL ổn định cho khóa học.
Backfill slug từ tiêu đề (không dấu) và đảm bảo duy nhất.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_course_slug"
down_revision: Union[str, None] = "0002_enrollments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", value)
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    ascii_text = ascii_text.replace("đ", "d").replace("Đ", "D")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return re.sub(r"-{2,}", "-", slug)[:200].strip("-")


def upgrade() -> None:
    op.add_column("courses", sa.Column("slug", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, title FROM courses ORDER BY id")).fetchall()
    used: set[str] = set()
    for course_id, title in rows:
        base = _slugify(title) or f"khoa-hoc-{course_id}"
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base}-{suffix}"
            suffix += 1
        used.add(candidate)
        bind.execute(
            sa.text("UPDATE courses SET slug = :slug WHERE id = :id"),
            {"slug": candidate, "id": course_id},
        )

    op.alter_column("courses", "slug", existing_type=sa.String(length=255), nullable=False)
    op.create_index(op.f("ix_courses_slug"), "courses", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_courses_slug"), table_name="courses")
    op.drop_column("courses", "slug")
