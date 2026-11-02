"""Kiểm thử các điểm bổ sung theo đặc tả Smart Tutor LMS.

Bao phủ:
- §V.2 / §X giai đoạn 4: sinh đề theo mức Bloom (prompt + wiring AI Service).
- §IV: Lesson.source_type (nguồn học liệu youtube | upload | external | manual)
  và migration 0012 đã được áp dụng.

Chạy: cd backend && ./venv/Scripts/python.exe -m pytest tests/ -q
Không cần backend đang chạy (trừ các test tích hợp ở test_multidomain_flow.py).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.models.lesson import Lesson, _derive_lesson_source_type

# Giá trị hợp lệ của Lesson.source_type (đặc tả §IV).
ALLOWED_SOURCE_TYPES = ("youtube", "upload", "external", "manual")

AI_SERVICE_DIR = Path(__file__).resolve().parents[2] / "ai-service"
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))


async def _fetch(stmt: str) -> list[tuple]:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text(stmt))
            return [tuple(row) for row in result.all()]
    finally:
        await engine.dispose()


def fetch(stmt: str) -> list[tuple]:
    return asyncio.run(_fetch(stmt))


# ── §IV: Lesson.source_type ──
def test_migration_head_is_0012() -> None:
    rows = fetch("SELECT version_num FROM alembic_version")
    assert rows, "Bảng alembic_version rỗng"
    assert rows[0][0] == "0012_lesson_source_type"


def test_every_lesson_has_valid_source_type() -> None:
    rows = fetch("SELECT source_type, count(*) FROM lessons GROUP BY source_type")
    assert rows, "Chưa có lesson nào trong DB"
    for source_type, _count in rows:
        assert source_type in ALLOWED_SOURCE_TYPES, f"source_type không hợp lệ: {source_type}"


@pytest.mark.parametrize(
    ("video_url", "youtube_video_id", "explicit", "expected"),
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", None, None, "youtube"),
        (None, "dQw4w9WgXcQ", None, "youtube"),
        ("https://example.com/lecture.mp4", None, None, "external"),
        (None, None, None, "manual"),
        ("https://example.com/lecture.mp4", None, "upload", "upload"),
    ],
)
def test_source_type_derivation(video_url, youtube_video_id, explicit, expected) -> None:
    lesson = Lesson(
        course_id=1,
        title="Bài kiểm tra suy ra nguồn học liệu",
        video_url=video_url,
        youtube_video_id=youtube_video_id,
    )
    lesson.source_type = explicit
    _derive_lesson_source_type(None, None, lesson)
    assert lesson.source_type == expected


# ── §V.2: sinh đề theo mức Bloom ──
def test_quiz_prompt_supports_single_bloom_level() -> None:
    from prompts.quiz_prompt import build_quiz_prompt

    prompt = build_quiz_prompt("Nội dung bài giảng mẫu", num_questions=3, bloom_level="analyze")
    assert "Phân tích (Analyze)" in prompt
    assert "Mức Bloom" in prompt


def test_quiz_prompt_supports_mixed_bloom_distribution() -> None:
    from prompts.quiz_prompt import build_quiz_prompt

    prompt = build_quiz_prompt("Nội dung bài giảng mẫu", bloom_level="mixed")
    assert "Phân bố câu hỏi trải đều 6 mức Bloom" in prompt


def test_quiz_prompt_falls_back_on_invalid_bloom_level() -> None:
    from prompts.quiz_prompt import build_quiz_prompt

    prompt = build_quiz_prompt("Nội dung bài giảng mẫu", bloom_level="khong-hop-le")
    assert "Phân bố câu hỏi trải đều 6 mức Bloom" in prompt


def test_ai_service_forwards_bloom_level() -> None:
    """Wiring: router nhận bloom_level và pipeline truyền xuống prompt.

    Kiểm tra ở mức source vì import `routers` sẽ khởi tạo Settings của AI Service
    (đọc .env riêng) — không phù hợp khi chạy trong môi trường test của backend.
    """
    router_src = (AI_SERVICE_DIR / "routers" / "quiz.py").read_text(encoding="utf-8")
    pipeline_src = (AI_SERVICE_DIR / "pipelines" / "quiz_generator.py").read_text(encoding="utf-8")

    assert "bloom_level" in router_src
    assert "bloom_level=req.bloom_level" in router_src
    assert "bloom_level: Optional[str] = None" in pipeline_src
    assert "bloom_level=bloom_level" in pipeline_src


def test_backend_quiz_schema_exposes_bloom_level() -> None:
    from app.schemas.quiz import AIQuizGenPreviewRequest, AIQuizGenRequest

    assert AIQuizGenPreviewRequest(topic="Toán lớp 8").bloom_level == "mixed"
    assert AIQuizGenRequest(course_id=1, topic="Toán lớp 8", bloom_level="apply").bloom_level == "apply"
