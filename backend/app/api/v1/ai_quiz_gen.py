from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.quiz import Quiz, QuizQuestion
from app.models.user import User
from app.schemas.quiz import AIQuizGenRequest, AIQuizGenPreviewRequest, QuizResponse

router = APIRouter(prefix="/ai-quiz-gen")

OPTION_KEYS = ["A", "B", "C", "D"]


def _normalize_options(raw_options: Any) -> tuple[list[dict[str, str]], list[str]]:
    """Chuẩn hoá options từ AI về đúng 4 khoá A, B, C, D.

    Trả về (options, original_keys) để còn ánh xạ đáp án đúng khi AI trả
    options dạng dict hoặc đảo thứ tự khoá.
    """
    items: list[tuple[str, str]] = []
    if isinstance(raw_options, list):
        for idx, opt in enumerate(raw_options):
            if isinstance(opt, dict):
                items.append((str(opt.get("key") or chr(65 + idx)), str(opt.get("text") or "")))
            else:
                items.append((chr(65 + idx), str(opt)))
    elif isinstance(raw_options, dict):
        items = sorted((str(key), str(value)) for key, value in raw_options.items())

    if len(items) != 4:
        return [], []

    options: list[dict[str, str]] = []
    original_keys: list[str] = []
    for idx, (raw_key, text) in enumerate(items):
        original_keys.append(raw_key.strip().upper())
        options.append({"key": OPTION_KEYS[idx], "text": text.strip()})
    return options, original_keys


def _normalize_correct_answer(
    raw_correct: Any,
    original_keys: list[str],
    options: list[dict[str, str]],
) -> str:
    """Đưa đáp án đúng về chữ cái A–D theo thứ tự options đã chuẩn hoá."""
    index: int | None = None

    if isinstance(raw_correct, bool):
        index = None
    elif isinstance(raw_correct, int):
        index = raw_correct
    else:
        text = str(raw_correct if raw_correct is not None else "").strip()
        if text.isdigit():
            index = int(text)
        elif text:
            upper = text.upper()
            if upper in original_keys:
                index = original_keys.index(upper)
            else:
                for opt_idx, option in enumerate(options):
                    if option["text"].lower() == text.lower():
                        index = opt_idx
                        break

    if index is None or not 0 <= index < len(OPTION_KEYS):
        return ""
    return OPTION_KEYS[index]


def _normalize_ai_questions(ai_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Chuẩn hoá và validate câu hỏi AI trả về (dùng chung cho preview & lưu DB)."""
    normalized: list[dict[str, Any]] = []
    for idx, question in enumerate(ai_data.get("questions") or []):
        question_text = str(
            question.get("question_text") or question.get("question") or ""
        ).strip()
        options, original_keys = _normalize_options(question.get("options"))
        raw_correct = (
            question.get("correct_answer")
            if question.get("correct_answer") is not None
            else question.get("correct_option")
        )
        correct_answer = _normalize_correct_answer(raw_correct, original_keys, options)
        explanation = str(question.get("explanation") or "").strip()

        if (
            not question_text
            or len(options) != 4
            or any(not option["text"] for option in options)
            or correct_answer not in OPTION_KEYS
            or not explanation
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"AI trả về câu hỏi thứ {idx + 1} không đúng cấu trúc: "
                    "cần nội dung câu hỏi, đúng 4 đáp án A–D, đáp án đúng và lời giải."
                ),
            )

        normalized.append(
            {
                "question_number": idx + 1,
                "question_text": question_text,
                "options": options,
                "correct_option": correct_answer,
                "correct_answer": correct_answer,
                "explanation": explanation,
            }
        )

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI không trả về câu hỏi hợp lệ.",
        )
    return normalized


async def _request_ai_quiz(topic: str, num_questions: int, difficulty: str) -> dict[str, Any]:
    """Gọi AI Service đúng một nơi để preview và lưu DB luôn đồng bộ."""
    ai_url = f"{settings.AI_SERVICE_URL}/api/v1/quiz/generate"
    ai_payload = {
        "content": topic,
        "num_questions": num_questions,
        "difficulty": difficulty,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            resp = await client.post(ai_url, json=ai_payload, headers=settings.ai_service_headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service từ chối yêu cầu sinh đề.",
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể kết nối đến AI service.",
        )


@router.post("/preview")
async def preview_ai_quiz(
    payload: AIQuizGenPreviewRequest,
    current_user: User = Depends(require_instructor),
):
    """
    Call the ai-service to generate quiz questions and return directly to caller
    without saving to database. Ideal for previewing, course creation wizard, and editing before publish.
    """
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str not in ("admin", "instructor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giảng viên hoặc quản trị viên mới có quyền sinh đề AI",
        )

    ai_data = await _request_ai_quiz(payload.topic, payload.num_questions, payload.difficulty)
    questions = _normalize_ai_questions(ai_data)

    return {
        "title": ai_data.get("title") or f"Bộ đề trắc nghiệm AI: {payload.topic[:60]}",
        "difficulty_level": payload.difficulty,
        "total_questions": len(questions),
        "questions": questions,
    }


@router.post("/generate", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def generate_quiz(
    payload: AIQuizGenRequest,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    """
    Call the ai-service to generate quiz questions, then persist them to the DB.
    Only instructors and admins can trigger generation.
    """
    # Verify the course exists
    result = await db.execute(select(Course).where(Course.id == payload.course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str not in ("admin", "instructor"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên hoặc quản trị viên mới có quyền sinh đề AI")
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không thể tạo đề thi cho khóa học của giảng viên khác")

    if payload.lesson_id is not None:
        lesson_res = await db.execute(
            select(Lesson.id).where(
                Lesson.id == payload.lesson_id,
                Lesson.course_id == payload.course_id,
            )
        )
        if lesson_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bài học không thuộc khóa học này",
            )

    ai_data = await _request_ai_quiz(payload.topic, payload.num_questions, payload.difficulty)
    questions = _normalize_ai_questions(ai_data)

    # Persist quiz + questions
    quiz = Quiz(
        course_id=payload.course_id,
        lesson_id=payload.lesson_id,
        title=ai_data.get("title") or f"AI Quiz: {payload.topic[:80]}",
        description=f"Đề trắc nghiệm sinh tự động cho '{payload.topic}' ({payload.difficulty})",
        is_ai_generated=True,
    )
    db.add(quiz)
    await db.flush()

    for idx, question in enumerate(questions):
        db.add(
            QuizQuestion(
                quiz_id=quiz.id,
                question_text=question["question_text"],
                options=question["options"],
                correct_answer=question["correct_answer"],
                explanation=question["explanation"],
                order_index=idx + 1,
            )
        )

    await db.flush()
    await db.commit()

    # Return with questions eagerly loaded
    final = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz.id)
    )
    return final.scalar_one()
