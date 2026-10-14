"""Kiểm thử migration Alembic trên schema tạm (an toàn, tự dọn dẹp).

Script tạo schema `alembic_smoke_test`, chạy toàn bộ `upgrade()` của revision
baseline, kiểm tra các bảng được tạo, chạy `downgrade()` rồi xóa schema.
Nhờ vậy lệnh `alembic upgrade head` được xác minh thật trên PostgreSQL
mà không đụng tới dữ liệu hiện có.

Chạy: <venv>/Scripts/python.exe test_alembic_migration.py
"""
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

from sqlalchemy import text

from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from app.core.database import engine

SCHEMA = "alembic_smoke_test"
REVISION = "0001_initial_schema"
EXPECTED_TABLES = {
    "users", "courses", "lessons", "quizzes",
    "quiz_questions", "quiz_submissions", "progress",
}


def _module():
    return ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION).module


def _upgrade(conn):
    ctx = MigrationContext.configure(conn)
    # Operations.context() cài đặt proxy cho `from alembic import op` trong file migration
    with Operations.context(ctx):
        with ctx.begin_transaction():
            _module().upgrade()


def _downgrade(conn):
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        with ctx.begin_transaction():
            _module().downgrade()


async def tables_in_schema(conn) -> set[str]:
    rows = await conn.execute(
        text(
            "select table_name from information_schema.tables "
            "where table_schema = :s order by table_name"
        ),
        {"s": SCHEMA},
    )
    return {r[0] for r in rows}


async def main() -> int:
    failures = 0

    print("=" * 60)
    print("1. Tạo schema tạm và chạy upgrade() của migration baseline")
    print("=" * 60)
    async with engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE"))
        await conn.execute(text(f"CREATE SCHEMA {SCHEMA}"))

    async with engine.begin() as conn:
        await conn.execute(text(f"SET LOCAL search_path TO {SCHEMA}"))
        await conn.run_sync(_upgrade)
    print("✅ upgrade() chạy thành công, không có lỗi SQL")

    async with engine.connect() as conn:
        created = await tables_in_schema(conn)
    print(f"Bảng được tạo ({len(created)}):", sorted(created))
    missing = EXPECTED_TABLES - created
    extra = created - EXPECTED_TABLES
    if missing or extra:
        failures += 1
        print(f"❌ Sai lệch: thiếu={sorted(missing)}, thừa={sorted(extra)}")
    else:
        print("✅ Đủ 7 bảng mong đợi")

    print()
    print("=" * 60)
    print("2. Kiểm tra dữ liệu có thể ghi vào schema vừa tạo (khóa ngoại, enum)")
    print("=" * 60)
    async with engine.begin() as conn:
        await conn.execute(text(f"SET LOCAL search_path TO {SCHEMA}"))
        await conn.execute(
            text(
                "insert into users (email, name, hashed_password, role, is_active) "
                "values ('smoke@test.local', 'Smoke Test', 'x', 'instructor', true)"
            )
        )
        await conn.execute(
            text(
                "insert into courses (title, instructor_id, price, status) "
                "values ('Khóa smoke test', 1, 0, 'draft')"
            )
        )
        n_users = (await conn.execute(text("select count(*) from users"))).scalar()
        n_courses = (await conn.execute(text("select count(*) from courses"))).scalar()
    print(f"✅ Ghi dữ liệu OK: users={n_users}, courses={n_courses}")

    print()
    print("=" * 60)
    print("3. Chạy downgrade() để xác minh có thể hoàn tác migration")
    print("=" * 60)
    async with engine.begin() as conn:
        await conn.execute(text(f"SET LOCAL search_path TO {SCHEMA}"))
        await conn.run_sync(_downgrade)
    async with engine.connect() as conn:
        remaining = await tables_in_schema(conn)
    if remaining:
        failures += 1
        print("❌ Sau downgrade vẫn còn bảng:", sorted(remaining))
    else:
        print("✅ downgrade() đã xóa sạch bảng trong schema")

    print()
    print("=" * 60)
    print("4. Dọn dẹp schema tạm")
    print("=" * 60)
    async with engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE"))
        left = await tables_in_schema(conn)
    print("✅ Đã xóa schema tạm. Còn lại:", sorted(left) or "không có")

    print()
    print("KẾT QUẢ:", "PASS - migration hoạt động đúng trên DB trống" if failures == 0 else f"FAIL ({failures} lỗi)")
    return failures


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
