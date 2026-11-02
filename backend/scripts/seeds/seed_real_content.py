"""Nạp học liệu THẬT vào database từ các nguồn mở có giấy phép.

Nguồn dữ liệu: `backend/data/real_sources.json` (khai báo nguồn, không chứa nội dung).
Nội dung bài học được tải trực tiếp lúc chạy từ Wikipedia tiếng Việt (CC BY-SA 4.0),
video YouTube được xác thực qua oEmbed (chỉ nhận video tồn tại thật), thời lượng lấy
bằng yt-dlp. Quiz được sinh từ chính nội dung thật vừa tải, không phải đề mẫu.

Cách dùng:
    cd backend
    ./venv/Scripts/python.exe seed_real_content.py                     # nạp khóa học + bài học
    ./venv/Scripts/python.exe seed_real_content.py --quiz              # + sinh quiz từ nội dung thật
    ./venv/Scripts/python.exe seed_real_content.py --ingest            # + nhúng RAG (Gemini)
    ./venv/Scripts/python.exe seed_real_content.py --archive-fake      # ẩn các khóa tự biên soạn
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import re
import sys

import httpx
from sqlalchemy import select, text

from app.core import database as db_module
from app.core.config import settings
from app.models.category import LearningCategory
from app.models.course import Course, CourseStatus
from app.models.education_level import EducationLevel
from app.models.lesson import Lesson
from app.models.quiz import Quiz, QuizQuestion

DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
WIKI_API = "https://vi.wikipedia.org/w/api.php"
WIKI_PAGE = "https://vi.wikipedia.org/wiki/"
OEMBED = "https://www.youtube.com/oembed"
USER_AGENT = "SmartLMS/1.0 (educational content sync; admin@smartlms.edu.vn)"
MIN_EXTRACT_CHARS = 400
EXCERPT_CHARS = 2400
OPTION_KEYS = ["A", "B", "C", "D"]

SessionFactory = getattr(db_module, "AsyncSessionLocal", None) or getattr(db_module, "async_session")


def _utf8_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def _clean(text_in: str) -> str:
    text_in = re.sub(r"\r\n?", "\n", text_in)
    text_in = re.sub(r"[ \t]+", " ", text_in)
    return re.sub(r"\n{3,}", "\n\n", text_in).strip()


def _excerpt(raw: str, limit: int = EXCERPT_CHARS) -> str:
    """Lấy đoạn đầu của nội dung thật, cắt ở ranh giới câu (không bịa thêm chữ)."""
    cleaned = _clean(raw)
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if len(p.strip()) >= 80]
    out: list[str] = []
    total = 0
    for para in paragraphs:
        if total + len(para) > limit and out:
            break
        out.append(para)
        total += len(para)
        if total >= limit:
            break
    chunk = "\n\n".join(out) if out else cleaned[:limit]
    if len(chunk) > limit:
        cut = chunk[:limit]
        for sep in (". ", ".\n", "!"):
            pos = cut.rfind(sep)
            if pos > limit * 0.6:
                return cut[: pos + 1].strip()
        return cut.strip() + "…"
    return chunk


async def fetch_wiki(client: httpx.AsyncClient, title: str) -> tuple[str, str, str] | None:
    """Trả về (tiêu đề trang thật, url, nội dung thật) hoặc None nếu bài không tồn tại."""
    try:
        res = await client.get(
            WIKI_API,
            params={
                "action": "query",
                "prop": "extracts",
                "explaintext": 1,
                "format": "json",
                "redirects": 1,
                "titles": title,
            },
        )
        res.raise_for_status()
        pages = res.json().get("query", {}).get("pages", {})
    except (httpx.HTTPError, ValueError):
        return None
    for page in pages.values():
        extract = page.get("extract") or ""
        if page.get("missing") is not None or len(extract) < MIN_EXTRACT_CHARS:
            return None
        real_title = page.get("title") or title
        url = WIKI_PAGE + real_title.replace(" ", "_")
        return real_title, url, extract
    return None


async def verify_video(client: httpx.AsyncClient, video_id: str | None) -> dict | None:
    """Xác thực video thật bằng oEmbed. Không tồn tại -> None (không lưu video giả)."""
    if not video_id:
        return None
    try:
        res = await client.get(OEMBED, params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"})
        if res.status_code != 200:
            return None
        data = res.json()
    except (httpx.HTTPError, ValueError):
        return None
    duration = await asyncio.get_running_loop().run_in_executor(None, _yt_duration, video_id)
    return {
        "id": video_id,
        "title": data.get("title") or "",
        "author": data.get("author_name") or "",
        "duration": duration,
    }


def _yt_duration(video_id: str) -> int:
    try:
        import yt_dlp

        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "no_warnings": True}) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return int(info.get("duration") or 0)
    except Exception:
        return 0


def build_transcript(page_title: str, url: str, body: str) -> str:
    return (
        f"Nguồn: Wikipedia tiếng Việt — {page_title}\n"
        f"Địa chỉ: {url}\n"
        f"Giấy phép: CC BY-SA 4.0\n\n"
        f"{body}"
    )


def _first_paragraph(excerpt: str, limit: int = 320) -> str:
    para = excerpt.split("\n\n")[0].strip()
    if len(para) <= limit:
        return para
    cut = para[:limit]
    pos = cut.rfind(". ")
    return cut[: pos + 1] if pos > limit * 0.5 else cut.rstrip() + "…"


async def request_quiz(transcript: str, title: str, num_questions: int = 3) -> list[dict]:
    """Sinh câu hỏi từ CHÍNH nội dung thật của bài (không phải chủ đề chung)."""
    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/quiz/generate"
    payload = {
        "content": transcript[:6000],
        "num_questions": num_questions,
        "difficulty": "medium",
        "bloom_level": "mixed",
    }
    headers = dict(settings.ai_service_headers)
    headers.setdefault("X-User-Role", "instructor")
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        print(f"[quiz] lỗi kết nối AI Service: {exc}")
        return []
    if res.status_code != 200:
        print(f"[quiz] AI Service trả HTTP {res.status_code}: {res.text[:160]}")
        return []

    questions: list[dict] = []
    for item in res.json().get("questions") or []:
        q_text = (item.get("question_text") or item.get("question") or "").strip()
        raw_options = item.get("options")
        if isinstance(raw_options, dict):
            options = [
                {"key": str(k).strip().upper(), "text": str(v).strip()}
                for k, v in sorted(raw_options.items())
            ]
        elif isinstance(raw_options, list):
            options = []
            for idx, opt in enumerate(raw_options):
                if isinstance(opt, dict):
                    options.append(
                        {"key": str(opt.get("key") or chr(65 + idx)).strip().upper(), "text": str(opt.get("text") or "").strip()}
                    )
                else:
                    options.append({"key": chr(65 + idx), "text": str(opt).strip()})
        else:
            options = []
        explanation = str(item.get("explanation") or "").strip()
        correct_raw = str(item.get("correct_answer") or item.get("correct_option") or "").strip().upper()
        if len(options) != 4 or not q_text or not explanation or correct_raw not in OPTION_KEYS:
            continue
        questions.append(
            {
                "question_text": q_text,
                "options": options,
                "correct_answer": correct_raw,
                "explanation": explanation,
            }
        )
    return questions


async def seed(quiz: bool, ingest: bool, archive_fake: bool, limit: int) -> None:
    payload = json.loads((DATA_DIR / "real_sources.json").read_text(encoding="utf-8"))
    courses_data = payload.get("courses", [])

    async with SessionFactory() as db:
        categories = {c.slug: c for c in (await db.execute(select(LearningCategory))).scalars().all()}
        levels = {lvl.code: lvl for lvl in (await db.execute(select(EducationLevel))).scalars().all()}
        instructor_ids = [
            row[0]
            for row in (
                await db.execute(text("SELECT id FROM users WHERE role::text = 'instructor' ORDER BY id"))
            ).all()
        ]
        if not instructor_ids:
            sys.exit("Không có tài khoản giảng viên để gán chủ sở hữu khóa học.")

        created_courses = created_lessons = 0
        quiz_count = 0
        ingested = 0
        processed_lessons = 0
        # Nhúng RAG phải chạy SAU khi commit: AI Service kiểm tra lesson_id trong DB,
        # nếu chưa commit sẽ trả 404 "Bài học không tồn tại".
        ingest_targets: list[tuple[Lesson, Course]] = []

        async with httpx.AsyncClient(
            timeout=60.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}
        ) as client:
            for index, course_data in enumerate(courses_data):
                category = categories.get(course_data["category_slug"])
                level = levels.get(course_data["level_code"])
                if category is None or level is None:
                    print(f"[skip] {course_data['slug']}: thiếu danh mục/cấp học trong DB")
                    continue

                course = (
                    await db.execute(select(Course).where(Course.slug == course_data["slug"]))
                ).scalars().first()
                if course is None:
                    course = Course(
                        slug=course_data["slug"],
                        # `title` là cột NOT NULL: phải truyền ngay khi tạo, không đợi gán sau flush.
                        title=course_data["title"],
                        instructor_id=instructor_ids[index % len(instructor_ids)],
                    )
                    db.add(course)
                    created_courses += 1
                    await db.flush()
                course.title = course_data["title"]
                course.category = category.name
                course.category_id = category.id
                course.education_level_id = level.id
                course.grade_label = course_data.get("grade_label")
                course.proficiency_level = course_data.get("proficiency_level")
                course.target_audience = course_data.get("target_audience")
                course.level = course_data.get("level", "beginner")
                course.language = "vi"
                course.price = 0
                course.status = CourseStatus.published
                course.outcomes = None
                course.prerequisites = None
                await db.flush()

                for order, lesson_data in enumerate(course_data["lessons"], start=1):
                    if limit and processed_lessons >= limit:
                        break
                    wiki = await fetch_wiki(client, lesson_data["wiki_title"])
                    if wiki is None:
                        print(f"[skip] {course_data['slug']} / {lesson_data['title']}: không có bài nguồn")
                        continue
                    page_title, wiki_url, raw = wiki
                    body = _excerpt(raw)
                    transcript = build_transcript(page_title, wiki_url, body)

                    video = await verify_video(client, lesson_data.get("video_id"))
                    if lesson_data.get("video_id") and video is None:
                        print(f"[drop] video không xác thực được: {lesson_data['video_id']}")

                    resource_url = lesson_data.get("resource_url") or wiki_url

                    lesson = (
                        await db.execute(
                            select(Lesson).where(
                                Lesson.course_id == course.id, Lesson.title == lesson_data["title"]
                            )
                        )
                    ).scalars().first()
                    if lesson is None:
                        lesson = Lesson(course_id=course.id, title=lesson_data["title"])
                        db.add(lesson)
                        created_lessons += 1
                    lesson.description = _first_paragraph(body)
                    # Mô tả khóa học lấy từ đoạn mở đầu của bài nguồn thật (Wikipedia, CC BY-SA 4.0),
                    # để trang khóa học không hiển thị trống khi seed lại từ đầu.
                    if not (course.description or '').strip():
                        course.description = (lesson.description or '')[:800] or None
                    lesson.order_index = order
                    lesson.transcript = transcript
                    lesson.resources_url = resource_url
                    lesson.duration = int(video["duration"]) if video else 0
                    lesson.video_url = f"https://www.youtube.com/watch?v={video['id']}" if video else None
                    lesson.youtube_video_id = video["id"] if video else None
                    lesson.source_type = "youtube" if video else "external"
                    lesson.subtitle_status = "none"
                    await db.flush()
                    processed_lessons += 1
                    print(
                        f"[lesson] {course_data['slug']} / {lesson_data['title']} "
                        f"| nguồn: {page_title} ({len(body)} ký tự)"
                        f" | video: {video['id'] if video else 'không có'}"
                        f" | {lesson.duration}s"
                    )

                    if quiz:
                        questions = await request_quiz(transcript, lesson_data["title"])
                        if questions:
                            existing = (
                                await db.execute(
                                    select(Quiz).where(Quiz.lesson_id == lesson.id, Quiz.course_id == course.id)
                                )
                            ).scalars().first()
                            quiz_obj = existing or Quiz(course_id=course.id, lesson_id=lesson.id)
                            quiz_obj.title = f"Trắc nghiệm: {lesson_data['title']}"
                            quiz_obj.description = (
                                f"Câu hỏi sinh từ nội dung thật của bài (nguồn: Wikipedia tiếng Việt — {page_title}, "
                                "giấy phép CC BY-SA 4.0)."
                            )
                            quiz_obj.pass_score = 0.6
                            quiz_obj.is_ai_generated = True
                            if existing is None:
                                db.add(quiz_obj)
                                await db.flush()
                            await db.execute(
                                text("DELETE FROM quiz_questions WHERE quiz_id = :q"), {"q": quiz_obj.id}
                            )
                            for idx, q in enumerate(questions, start=1):
                                db.add(
                                    QuizQuestion(
                                        quiz_id=quiz_obj.id,
                                        question_text=q["question_text"],
                                        options=q["options"],
                                        correct_answer=q["correct_answer"],
                                        explanation=q["explanation"],
                                        order_index=idx,
                                    )
                                )
                            await db.flush()
                            quiz_count += 1

                    if ingest:
                        ingest_targets.append((lesson, course))

        if archive_fake:
            archived = await archive_authored_courses(db)
            print(f"[archive] đã ẩn {archived} khóa học tự biên soạn")

        await db.commit()

        if ingest and ingest_targets:
            # Client riêng: khối httpx dùng khi đọc nguồn đã đóng sau vòng lặp khóa học.
            async with httpx.AsyncClient(timeout=300.0) as rag_client:
                for lesson, course in ingest_targets:
                    if await ingest_lesson(db, rag_client, lesson, course):
                        ingested += 1
            await db.commit()

        print(
            f"[db] khóa học mới: {created_courses} | bài học mới: {created_lessons} | "
            f"quiz từ nội dung thật: {quiz_count} | đã nhúng RAG: {ingested}"
        )


async def ingest_lesson(db, client: httpx.AsyncClient, lesson: Lesson, course: Course) -> bool:
    chunks = [p.strip() for p in (lesson.transcript or "").split("\n\n") if p.strip()]
    if not chunks:
        return False
    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/ingest-text"
    headers = dict(settings.ai_service_headers)
    headers["X-User-Id"] = str(course.instructor_id)
    headers["X-User-Role"] = "instructor"
    payload = {
        "lesson_id": lesson.id,
        "document_id": f"real-{lesson.id}",
        "replace_existing": True,
        "chunks": chunks,
        "metadata": [
            {"lesson_id": lesson.id, "filename": lesson.title, "section": i + 1, "source": lesson.resources_url}
            for i in range(len(chunks))
        ],
    }
    try:
        res = await client.post(url, json=payload, headers=headers, timeout=240.0)
    except httpx.RequestError as exc:
        print(f"[rag] bài #{lesson.id}: lỗi kết nối ({exc})")
        return False
    if res.status_code != 200:
        print(f"[rag] bài #{lesson.id}: HTTP {res.status_code} {res.text[:140]}")
        return False
    return True


async def archive_authored_courses(db) -> int:
    """Ẩn các khóa học do seed_catalog tạo (nội dung tự biên soạn) khỏi catalog."""
    slugs: list[str] = []
    for path in sorted(DATA_DIR.glob("catalog_part*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        slugs.extend(item["slug"] for item in data.get("courses", []))
    if not slugs:
        return 0
    result = await db.execute(
        text(
            "UPDATE courses SET status = 'archived' "
            "WHERE slug = ANY(CAST(:slugs AS text[])) AND status <> 'archived'"
        ),
        {"slugs": slugs},
    )
    return int(result.rowcount or 0)


async def main() -> None:
    _utf8_stdout()
    parser = argparse.ArgumentParser(description="Nạp học liệu thật từ nguồn mở")
    parser.add_argument("--quiz", action="store_true", help="Sinh quiz từ nội dung thật của từng bài")
    parser.add_argument("--ingest", action="store_true", help="Nhúng transcript vào pgvector")
    parser.add_argument("--archive-fake", action="store_true", help="Ẩn các khóa học tự biên soạn")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số bài học xử lý (0 = tất cả)")
    args = parser.parse_args()
    await seed(args.quiz, args.ingest, args.archive_fake, args.limit)


if __name__ == "__main__":
    asyncio.run(main())
