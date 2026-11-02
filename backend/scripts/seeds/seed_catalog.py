"""Nạp catalog học liệu đa lĩnh vực vào database.

Nội dung khóa học/bài học nằm trong `backend/data/catalog_part*.json` (dữ liệu),
không hard-code trong code. Script idempotent: chạy nhiều lần không tạo bản trùng.

Cách dùng:
    cd backend
    ./venv/Scripts/python.exe seed_catalog.py                     # chỉ nạp DB
    ./venv/Scripts/python.exe seed_catalog.py --ingest 20         # nạp DB + nhúng RAG 20 bài mới
    ./venv/Scripts/python.exe seed_catalog.py --ingest-missing    # nhúng mọi bài chưa có vector
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys

import httpx
from sqlalchemy import select, text

from app.core import database as db_module
from app.core.config import settings
from app.models.category import LearningCategory
from app.models.course import Course, CourseStatus
from app.models.education_level import EducationLevel
from app.models.lesson import Lesson

DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
FALLBACK_THUMBNAIL = (
    "https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg"
)

SessionFactory = getattr(db_module, "AsyncSessionLocal", None) or getattr(db_module, "async_session")


def _force_utf8_stdout() -> None:
    """Console Windows mặc định cp1252 nên sẽ lỗi khi in tiếng Việt."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def load_catalog() -> list[dict]:
    courses: list[dict] = []
    for path in sorted(DATA_DIR.glob("catalog_part*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        courses.extend(payload.get("courses", []))
        print(f"[data] {path.name}: {len(payload.get('courses', []))} khóa học")
    return courses


def build_transcript(lesson: dict, source: str) -> str:
    concepts = ", ".join(lesson.get("concepts", []))
    return (
        f"{lesson['summary']}\n\n"
        f"Trọng tâm bài học: {concepts}.\n\n"
        f"Tài liệu tham khảo: {source}"
    )


async def seed_courses() -> list[tuple[int, int]]:
    """Trả về danh sách (lesson_id, instructor_id) đã tạo/ cập nhật để phục vụ ingest."""
    catalog = load_catalog()
    touched: list[tuple[int, int]] = []
    created_courses = updated_courses = created_lessons = 0

    async with SessionFactory() as db:
        categories = {
            c.slug: c for c in (await db.execute(select(LearningCategory))).scalars().all()
        }
        levels = {lvl.code: lvl for lvl in (await db.execute(select(EducationLevel))).scalars().all()}
        instructor_ids = [
            row[0]
            for row in (
                await db.execute(text("SELECT id FROM users WHERE role::text = 'instructor' ORDER BY id"))
            ).all()
        ]
        if not instructor_ids:
            sys.exit("Không tìm thấy giảng viên nào để gán chủ sở hữu khóa học.")

        for index, item in enumerate(catalog):
            category = categories.get(item["category_slug"])
            level = levels.get(item["level_code"])
            if category is None or level is None:
                print(f"[skip] {item['slug']}: thiếu danh mục hoặc cấp học")
                continue

            course = (
                await db.execute(select(Course).where(Course.slug == item["slug"]))
            ).scalars().first()
            if course is None:
                course = Course(slug=item["slug"], instructor_id=instructor_ids[index % len(instructor_ids)])
                db.add(course)
                created_courses += 1
            else:
                updated_courses += 1

            course.title = item["title"]
            course.description = item["description"]
            course.category = category.name
            course.level = item.get("level", "beginner")
            course.status = CourseStatus.published
            course.price = 0
            course.thumbnail = course.thumbnail or FALLBACK_THUMBNAIL
            course.category_id = category.id
            course.education_level_id = level.id
            course.grade_label = item.get("grade_label")
            course.proficiency_level = item.get("proficiency_level")
            course.target_audience = item.get("target_audience")
            course.language = "vi"
            course.outcomes = item.get("outcomes") or []
            course.prerequisites = item.get("prerequisites") or []
            await db.flush()

            existing_titles = {
                row[0]
                for row in (
                    await db.execute(select(Lesson.title).where(Lesson.course_id == course.id))
                ).all()
            }
            source = item.get("source") or ""
            for order, lesson_data in enumerate(item["lessons"], start=1):
                if lesson_data["title"] in existing_titles:
                    continue
                lesson = Lesson(
                    course_id=course.id,
                    title=lesson_data["title"],
                    description=lesson_data["summary"],
                    duration=lesson_data.get("duration", 1200),
                    order_index=order,
                    transcript=build_transcript(lesson_data, source),
                    resources_url=source,
                    source_type="external",
                )
                db.add(lesson)
                await db.flush()
                touched.append((lesson.id, course.instructor_id))
                created_lessons += 1

        await db.commit()

    print(
        f"[db] khóa học: +{created_courses} mới, {updated_courses} cập nhật | "
        f"bài học mới: +{created_lessons}"
    )
    return touched


async def pending_lessons() -> list[tuple[int, int]]:
    """Trả về (lesson_id, instructor_id) của các bài chưa có chunk nào trong pgvector."""
    async with SessionFactory() as db:
        rows = (
            await db.execute(
                text(
                    """
                    SELECT l.id, c.instructor_id
                    FROM lessons l
                    JOIN courses c ON c.id = l.course_id
                    WHERE NOT EXISTS (
                        SELECT 1 FROM document_chunks dc WHERE dc.lesson_id = l.id
                    )
                    ORDER BY l.id
                    """
                )
            )
        ).all()
    return [(row[0], row[1]) for row in rows]


async def ingest(touched: list[tuple[int, int]], limit: int) -> None:
    """Nhúng transcript vào pgvector qua AI Service (embedding thật)."""
    target = touched[:limit] if limit > 0 else touched
    if not target:
        print("[rag] không có bài học mới để nhúng")
        return

    # Lấy transcript thật của từng bài để nhúng — không dùng chunk giả.
    target_ids = [lesson_id for lesson_id, _ in target]
    async with SessionFactory() as db:
        rows = (
            await db.execute(
                text("SELECT id, title, transcript FROM lessons WHERE id = ANY(:ids)"),
                {"ids": target_ids},
            )
        ).all()
    lessons = {row[0]: {"title": row[1], "transcript": row[2] or ""} for row in rows}

    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/ingest-text"
    ok = failed = 0
    async with httpx.AsyncClient(timeout=300.0) as client:
        for lesson_id, instructor_id in target:
            lesson = lessons.get(lesson_id)
            if lesson is None or not lesson["transcript"].strip():
                failed += 1
                print(f"[rag] bài #{lesson_id}: không có transcript")
                continue
            chunks = [p.strip() for p in lesson["transcript"].split("\n\n") if p.strip()]
            payload = {
                "lesson_id": lesson_id,
                "document_id": f"catalog-{lesson_id}",
                "replace_existing": True,
                "chunks": chunks,
                "metadata": [
                    {"lesson_id": lesson_id, "filename": lesson["title"], "section": idx + 1}
                    for idx in range(len(chunks))
                ],
            }
            headers = dict(settings.ai_service_headers)
            headers["X-User-Id"] = str(instructor_id)
            headers["X-User-Role"] = "instructor"
            try:
                res = await client.post(url, json=payload, headers=headers)
            except httpx.RequestError as exc:
                failed += 1
                print(f"[rag] bài #{lesson_id}: lỗi kết nối ({exc})")
                continue
            if res.status_code == 200:
                ok += 1
            else:
                failed += 1
                print(f"[rag] bài #{lesson_id}: HTTP {res.status_code} {res.text[:160]}")
    print(f"[rag] nhúng thành công {ok}/{len(target)} bài, lỗi {failed}")


async def main() -> None:
    _force_utf8_stdout()
    parser = argparse.ArgumentParser(description="Nạp catalog học liệu vào database")
    parser.add_argument(
        "--ingest",
        type=int,
        default=0,
        metavar="N",
        help="Số bài học cần nhúng vào RAG (0 = tất cả bài đủ điều kiện)",
    )
    parser.add_argument(
        "--ingest-missing",
        action="store_true",
        help="Nhúng mọi bài học chưa có vector, kể cả bài đã nạp từ trước",
    )
    args = parser.parse_args()

    touched = await seed_courses()
    if args.ingest_missing:
        pending = await pending_lessons()
        print(f"[rag] {len(pending)} bài học chưa có vector trong pgvector")
        await ingest(pending, args.ingest)
    elif args.ingest:
        await ingest(touched, args.ingest)


if __name__ == "__main__":
    asyncio.run(main())
