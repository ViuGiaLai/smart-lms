from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.lesson import Lesson
from app.models.progress import Progress
from app.models.user import User
from app.schemas.progress import ProgressUpdate, ProgressResponse, CourseSummary
from app.services.progress_service import ProgressService

router = APIRouter(prefix="/progress")


@router.put("/lessons/{lesson_id}", response_model=ProgressResponse)
async def upsert_progress(
    lesson_id: int,
    payload: ProgressUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Progress:
    """Create or update progress for a specific lesson."""
    return await ProgressService.upsert(db, current_user.id, lesson_id, payload)


@router.get("/lessons/{lesson_id}", response_model=ProgressResponse)
async def get_lesson_progress(
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Progress:
    result = await db.execute(
        select(Progress).where(
            Progress.user_id == current_user.id,
            Progress.lesson_id == lesson_id,
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No progress record found")
    return progress


@router.get("/courses/{course_id}", response_model=CourseSummary)
async def get_course_progress(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CourseSummary:
    """Return overall progress summary for a course."""
    return await ProgressService.course_summary(db, current_user.id, course_id)


@router.get("/my", response_model=list[ProgressResponse])
async def list_my_progress(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Progress]:
    """List all progress records for the current user."""
    result = await db.execute(
        select(Progress).where(Progress.user_id == current_user.id)
    )
    return list(result.scalars().all())
