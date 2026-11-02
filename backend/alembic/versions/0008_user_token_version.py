"""add user token_version for logout revocation

Revision ID: 0008_user_token_version
Revises: 0007_backfill_enrollments
Create Date: 2026-10-29

Truoc day dang xuat chi xoa token o trinh duyet, token van dung duoc den khi het
han. Them cot `users.token_version` de tang len moi khi dang xuat; JWT mang claim
`ver`, token nao co `ver` thap hon gia tri hien tai se bi tu choi.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0008_user_token_version"
down_revision: Union[str, None] = "0007_backfill_enrollments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
