from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course
from app.models.quiz import Quiz, QuizQuestion
from app.models.user import User
from app.schemas.quiz import AIQuizGenRequest, AIQuizGenPreviewRequest, QuizResponse

router = APIRouter(prefix="/ai-quiz-gen")


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
            detail="Chỉ giảng viên hoặc quản trị viên mới có quyền sinh đề AI"
        )

    ai_url = f"{settings.AI_SERVICE_URL}/api/v1/quiz/generate"
    ai_payload = {
        "content": payload.topic,
        "num_questions": payload.num_questions,
        "difficulty": payload.difficulty.lower() if hasattr(payload.difficulty, "lower") else "medium",
        "lesson_id": payload.course_id,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            resp = await client.post(ai_url, json=ai_payload)
            resp.raise_for_status()
            ai_data = resp.json()
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

    keys = ["A", "B", "C", "D"]
    formatted_questions = []
    for idx, q in enumerate(ai_data.get("questions", [])):
        q_text = q.get("question_text") or q.get("question") or f"Câu hỏi {idx + 1}"
        raw_options = q.get("options", [])
        formatted_options = []
        if isinstance(raw_options, list):
            for opt_idx, opt in enumerate(raw_options):
                k = keys[opt_idx] if opt_idx < len(keys) else chr(65 + opt_idx)
                if isinstance(opt, dict):
                    opt_key = opt.get("key", k)
                    opt_val = opt.get("text", str(opt))
                    formatted_options.append({"key": opt_key, "text": opt_val})
                else:
                    formatted_options.append({"key": k, "text": str(opt)})
        elif isinstance(raw_options, dict):
            for k, v in raw_options.items():
                formatted_options.append({"key": str(k), "text": str(v)})

        raw_correct = q.get("correct_answer") if q.get("correct_answer") is not None else q.get("correct_option", 0)
        if isinstance(raw_correct, int) and raw_correct < len(keys):
            correct_str = keys[raw_correct]
        else:
            correct_str = str(raw_correct).upper()

        formatted_questions.append({
            "question_number": idx + 1,
            "question_text": q_text,
            "options": formatted_options,
            "correct_option": correct_str,
            "correct_answer": correct_str,
            "explanation": q.get("explanation", "Phân tích suy luận từ tài liệu bài giảng."),
        })

    return {
        "title": ai_data.get("title") or f"Bộ đề trắc nghiệm AI: {payload.topic[:60]}",
        "difficulty_level": payload.difficulty,
        "total_questions": len(formatted_questions),
        "questions": formatted_questions,
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

    # Call ai-service
    ai_url = f"{settings.AI_SERVICE_URL}/api/v1/quiz/generate"
    ai_payload = {
        "content": payload.topic,
        "num_questions": payload.num_questions,
        "difficulty": payload.difficulty.lower() if hasattr(payload.difficulty, "lower") else "medium",
        "lesson_id": payload.course_id,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            resp = await client.post(ai_url, json=ai_payload)
            resp.raise_for_status()
            ai_data = resp.json()
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

    # Persist quiz + questions
    quiz = Quiz(
        course_id=payload.course_id,
        title=f"AI Quiz: {payload.topic}",
        description=f"Auto-generated quiz on '{payload.topic}' ({payload.difficulty})",
        is_ai_generated=True,
    )
    db.add(quiz)
    await db.flush()

    keys = ["A", "B", "C", "D"]
    for idx, q in enumerate(ai_data.get("questions", [])):
        q_text = q.get("question_text") or q.get("question") or f"Câu hỏi {idx + 1}"

        # Format options as [{"key": "A", "text": "..."}]
        raw_options = q.get("options", [])
        formatted_options = []
        if isinstance(raw_options, list):
            for opt_idx, opt in enumerate(raw_options):
                k = keys[opt_idx] if opt_idx < len(keys) else chr(65 + opt_idx)
                if isinstance(opt, dict):
                    opt_key = opt.get("key", k)
                    opt_val = opt.get("text", str(opt))
                    formatted_options.append({"key": opt_key, "text": opt_val})
                else:
                    formatted_options.append({"key": k, "text": str(opt)})
        elif isinstance(raw_options, dict):
            for k, v in raw_options.items():
                formatted_options.append({"key": str(k), "text": str(v)})

        # Format correct_answer as string "A", "B", "C", "D"
        raw_correct = q.get("correct_answer") if q.get("correct_answer") is not None else q.get("correct_option", 0)
        if isinstance(raw_correct, int) and raw_correct < len(keys):
            correct_str = keys[raw_correct]
        else:
            correct_str = str(raw_correct).upper()

        question = QuizQuestion(
            quiz_id=quiz.id,
            question_text=q_text,
            options=formatted_options,
            correct_answer=correct_str,
            explanation=q.get("explanation", ""),
            order_index=idx,
        )
        db.add(question)

    await db.flush()

    # Return with questions eagerly loaded
    final = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz.id)
    )
    return final.scalar_one()
