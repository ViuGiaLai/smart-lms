"""readable material keys and background processing status

Revision ID: 0014_material_queue_status
Revises: 0013_lesson_materials
"""

from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = "0014_material_queue_status"
down_revision: Union[str, None] = "0013_lesson_materials"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("lesson_materials", sa.Column("storage_key", sa.String(length=1024), nullable=True))
    op.add_column("lesson_materials", sa.Column("status", sa.String(length=20), nullable=False, server_default="ready"))
    op.add_column("lesson_materials", sa.Column("error_message", sa.String(length=1024), nullable=True))
    op.create_unique_constraint("uq_lesson_materials_storage_key", "lesson_materials", ["storage_key"])


def downgrade() -> None:
    op.drop_constraint("uq_lesson_materials_storage_key", "lesson_materials", type_="unique")
    op.drop_column("lesson_materials", "error_message")
    op.drop_column("lesson_materials", "status")
    op.drop_column("lesson_materials", "storage_key")
