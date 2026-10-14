from logging.config import fileConfig
import asyncio

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

# ── Load app config and models ───────
import sys
import os

# Make sure the backend package is importable when running alembic from its dir
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.core.database import Base  # noqa: F401 — registers Base.metadata

# Import all models so Alembic can detect them
from app.models import user, course, lesson, quiz, progress, enrollment  # noqa: F401

# ── Alembic Config ────────
config = context.config

# LƯU Ý: Không dùng config.set_main_option("sqlalchemy.url", ...) ở đây.
# configparser dùng BasicInterpolation nên sẽ báo lỗi với mật khẩu chứa ký tự '%'
# (ví dụ mật khẩu URL-encoded '%40' cho '@'). Vì vậy truyền thẳng settings.DATABASE_URL
# cho engine và cho chế độ offline.

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ── Bảng không thuộc quyền quản lý của backend ────────
# `document_chunks` (vector store) do AI Service tạo và quản lý.
# Nếu không loại trừ, autogenerate sẽ sinh lệnh DROP TABLE phá hỏng dữ liệu RAG.
AI_SERVICE_MANAGED_TABLES = {"document_chunks"}


def include_object(object_, name, type_, reflected, compare_to):
    """Bỏ qua các bảng/index do service khác quản lý khi so sánh schema."""
    if type_ == "table" and name in AI_SERVICE_MANAGED_TABLES:
        return False
    if type_ == "index" and getattr(getattr(object_, "table", None), "name", None) in AI_SERVICE_MANAGED_TABLES:
        return False
    return True


# ── Offline migration ─────
def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online migration ──────
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# ── Entry point ─
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
