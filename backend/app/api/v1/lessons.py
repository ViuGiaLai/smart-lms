from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.cache import invalidate_course_caches
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.user import User
from app.schemas.course import LessonCreate, LessonUpdate, LessonResponse
from app.services.enrollment_service import require_course_access

router = APIRouter(prefix="/courses/{course_id}/lessons")


async def _get_course_or_404(course_id: int, db: AsyncSession) -> Course:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


async def _get_lesson_or_404(lesson_id: int, course_id: int, db: AsyncSession) -> Lesson:
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return lesson


@router.get("", response_model=list[LessonResponse])
async def list_lessons(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Lesson]:
    """List all lessons for a course ordered by order_index."""
    await require_course_access(db, current_user, course_id)
    result = await db.execute(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.order_index)
    )
    return list(result.scalars().all())


@router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    await require_course_access(db, current_user, course_id)
    return await _get_lesson_or_404(lesson_id, course_id, db)


@router.post("", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    course_id: int,
    payload: LessonCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    """Create a lesson inside a course (instructor/admin only)."""
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = Lesson(course_id=course_id, **payload.model_dump())
    db.add(lesson)
    await db.flush()
    await db.refresh(lesson)
    await db.commit()
    await invalidate_course_caches()
    return lesson


@router.put("/{lesson_id}", response_model=LessonResponse)
async def update_lesson(
    course_id: int,
    lesson_id: int,
    payload: LessonUpdate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = await _get_lesson_or_404(lesson_id, course_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)
    await db.flush()
    await db.refresh(lesson)
    await db.commit()
    await invalidate_course_caches()
    return lesson


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = await _get_lesson_or_404(lesson_id, course_id, db)
    await db.delete(lesson)
    await db.commit()
    await invalidate_course_caches()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
