"""add course outcomes and prerequisites

Revision ID: 0006_course_outcomes
Revises: 0005_sync_sequences
Create Date: 2026-10-28

Truoc day giang vien nhap "Muc tieu/Chuan dau ra" va "Yeu cau tien quyet" o
trang tao khoa hoc nhung frontend noi chuoi vao `description`. Them 2 cot
JSON de luu truc tiep, hien thi doc lap va khong lam ban noi dung mo ta.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_course_outcomes"
down_revision: Union[str, None] = "0005_sync_sequences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("outcomes", sa.JSON(), nullable=True))
    op.add_column("courses", sa.Column("prerequisites", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("courses", "prerequisites")
    op.drop_column("courses", "outcomes")
