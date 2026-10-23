"""sync primary key sequences

Revision ID: 0005_sync_sequences
Revises: 0004_quiz_lesson
Create Date: 2026-10-20

Dong bo sequence cua cac bang voi du lieu da seed (seed chen id truc tiep
lam sequence tut lai, gay loi duplicate key khi tao ban ghi moi).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0005_sync_sequences"
down_revision: Union[str, None] = "0004_quiz_lesson"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            col record;
            max_id bigint;
        BEGIN
            FOR col IN
                SELECT table_schema, table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND (
                      column_default LIKE 'nextval(%'
                      OR is_identity = 'YES'
                  )
            LOOP
                EXECUTE format(
                    'SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
                    col.column_name, col.table_schema, col.table_name
                ) INTO max_id;

                IF max_id > 0 THEN
                    PERFORM setval(
                        pg_get_serial_sequence(
                            format('%I.%I', col.table_schema, col.table_name),
                            col.column_name
                        ),
                        max_id,
                        true
                    );
                END IF;
            END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    pass
