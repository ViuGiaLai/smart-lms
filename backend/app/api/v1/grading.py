from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course
from app.models.essay_grading import EssayGrading
from app.models.lesson import Lesson
from app.models.user import User, UserRole
from app.services.ai_quota import enforce_ai_quota

router = APIRouter(prefix="/grading", tags=["AI Essay Grading"])


def _is_admin(user: User) -> bool:
    return user.role == UserRole.admin or str(getattr(user.role, "value", "")) == "admin"


class RubricCriterion(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default="", max_length=1000)
    max_score: float = Field(default=2.5, gt=0, le=100)


class GradeEssayRequest(BaseModel):
    student_name: str = Field(..., min_length=1, max_length=255)
    student_email: str | None = Field(default=None, max_length=255)
    question: str | None = Field(default=None, max_length=4000)
    student_answer: str = Field(..., min_length=20, max_length=20000)
    reference_answer: str | None = Field(default=None, max_length=8000)
    rubric: list[RubricCriterion] = Field(..., min_length=1, max_length=10)
    course_id: int | None = None
    lesson_id: int | None = None
    max_total_score: float | None = Field(default=None, gt=0, le=100)

    @field_validator("rubric")
    @classmethod
    def _no_duplicate_criteria(cls, value: list[RubricCriterion]) -> list[RubricCriterion]:
        names = [item.name.strip().lower() for item in value]
        if len(set(names)) != len(names):
            raise ValueError("Tên tiêu chí không được trùng nhau")
        return value


def _serialize(row: EssayGrading) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "studentName": row.student_name,
        "studentEmail": row.student_email,
        "question": row.question,
        "studentAnswer": row.student_answer,
        "referenceAnswer": row.reference_answer,
        "rubric": row.rubric,
        "courseId": str(row.course_id) if row.course_id else None,
        "lessonId": str(row.lesson_id) if row.lesson_id else None,
        "totalScore": row.total_score,
        "maxTotalScore": row.max_total_score,
        "percentage": row.percentage,
        "gradeLevel": row.grade_level,
        "criteriaScores": row.criteria_scores,
        "overallFeedback": row.overall_feedback,
        "strengths": row.strengths,
        "improvements": row.improvements,
        "provider": row.provider,
        "model": row.model,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


async def _resolve_scope(
    db: AsyncSession,
    current_user: User,
    course_id: int | None,
    lesson_id: int | None,
) -> tuple[int | None, int | None]:
    """Xác thực phạm vi khóa/bài và quyền của giảng viên."""
    course: Course | None = None
    if lesson_id is not None:
        row = (
            await db.execute(
                select(Lesson, Course)
                .join(Course, Course.id == Lesson.course_id)
                .where(Lesson.id == lesson_id)
            )
        ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Bài học không tồn tại.")
        lesson, course = row
        if course_id is not None and course.id != course_id:
            raise HTTPException(status_code=400, detail="Bài học không thuộc khóa học đã chọn.")
        course_id = course.id
    elif course_id is not None:
        course = (
            await db.execute(select(Course).where(Course.id == course_id))
        ).scalar_one_or_none()
        if course is None:
            raise HTTPException(status_code=404, detail="Khóa học không tồn tại.")

    if course is not None and not _is_admin(current_user) and course.instructor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Bạn không phụ trách khóa học này nên không thể chấm bài.",
        )
    return course_id, lesson_id


@router.post("/evaluate", status_code=status.HTTP_201_CREATED)
async def evaluate_essay(
    payload: GradeEssayRequest,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Chấm bài tự luận bằng AI theo Rubric, sau đó lưu kết quả vào PostgreSQL."""
    course_id, lesson_id = await _resolve_scope(
        db, current_user, payload.course_id, payload.lesson_id
    )
    await enforce_ai_quota(db, current_user.id, "grader")

    ai_payload = {
        "student_answer": payload.student_answer,
        "question": payload.question or "",
        "reference_answer": payload.reference_answer or "",
        "rubric": [
            {
                "name": item.name.strip(),
                "description": (item.description or "").strip(),
                "max_score": item.max_score,
            }
            for item in payload.rubric
        ],
        "max_total_score": payload.max_total_score
        or round(sum(item.max_score for item in payload.rubric), 2),
    }

    headers = {
        **settings.ai_service_headers,
        "X-User-Id": str(current_user.id),
        "X-User-Role": str(getattr(current_user.role, "value", current_user.role)),
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            response = await client.post(
                f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/grader/evaluate",
                json=ai_payload,
                headers=headers,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không kết nối được AI Service. Kiểm tra service cổng 8001.",
        ) from exc

    if response.status_code >= 400:
        detail = "AI Service không chấm được bài này. Vui lòng thử lại."
        try:
            body = response.json()
            if isinstance(body.get("detail"), str):
                detail = body["detail"]
        except ValueError:
            pass
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    result = response.json()
    row = EssayGrading(
        instructor_id=current_user.id,
        course_id=course_id,
        lesson_id=lesson_id,
        student_name=payload.student_name.strip(),
        student_email=(payload.student_email or "").strip() or None,
        question=(payload.question or "").strip() or None,
        student_answer=payload.student_answer,
        reference_answer=(payload.reference_answer or "").strip() or None,
        rubric=ai_payload["rubric"],
        total_score=float(result.get("total_score") or 0),
        max_total_score=float(result.get("max_total_score") or ai_payload["max_total_score"]),
        percentage=float(result.get("percentage") or 0),
        grade_level=str(result.get("grade_level") or "C")[:8],
        criteria_scores=list(result.get("criteria_scores") or []),
        overall_feedback=result.get("overall_feedback") or None,
        strengths=list(result.get("strengths") or []),
        improvements=list(result.get("improvements") or []),
        provider="ai-service",
        model=None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"success": True, "data": _serialize(row)}


@router.get("/history")
async def grading_history(
    course_id: int | None = Query(default=None),
    lesson_id: int | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    query = select(EssayGrading)
    if not _is_admin(current_user):
        query = query.where(EssayGrading.instructor_id == current_user.id)
    if course_id is not None:
        query = query.where(EssayGrading.course_id == course_id)
    if lesson_id is not None:
        query = query.where(EssayGrading.lesson_id == lesson_id)
    rows = (
        await db.execute(query.order_by(EssayGrading.created_at.desc()).limit(limit))
    ).scalars().all()
    return {"success": True, "data": [_serialize(row) for row in rows]}


@router.delete("/{grading_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grading(
    grading_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(select(EssayGrading).where(EssayGrading.id == grading_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài chấm.")
    if not _is_admin(current_user) and row.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa bài chấm này.")
    await db.delete(row)
    await db.commit()
    return None
