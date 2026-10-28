"""backfill enrollments from progress

Revision ID: 0007_backfill_enrollments
Revises: 0006_course_outcomes
Create Date: 2026-10-28

Truoc day he thong suy ra "da ghi danh" bang hop cua bang `enrollments` va
`progress`, nen bang `enrollments` gan nhu rong. Migration nay backfill cac cap
(user_id, course_id) da co tien do hoc tap vao `enrollments`, de sau do code chi
can doc mot nguon duy nhat.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0007_backfill_enrollments"
down_revision: Union[str, None] = "0006_course_outcomes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO enrollments (user_id, course_id, enrolled_at)
        SELECT
            p.user_id,
            l.course_id,
            MIN(COALESCE(p.started_at, p.updated_at, now()))
        FROM progress p
        JOIN lessons l ON l.id = p.lesson_id
        GROUP BY p.user_id, l.course_id
        ON CONFLICT ON CONSTRAINT uq_user_course_enrollment DO NOTHING
        """
    )


def downgrade() -> None:
    # Khong the phan biet ban ghi nao do backfill va ban ghi nao do nguoi dung
    # tu dang ky, nen khong xoa du lieu khi rollback.
    pass
