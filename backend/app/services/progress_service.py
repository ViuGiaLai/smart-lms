from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.lesson import Lesson
from app.models.progress import Progress
from app.schemas.progress import ProgressUpdate, CourseSummary


class ProgressService:
    """Business logic for tracking lesson progress."""

    @staticmethod
    async def upsert(
        db: AsyncSession,
        user_id: int,
        lesson_id: int,
        payload: ProgressUpdate,
    ) -> Progress:
        """Insert or update progress record for user/lesson pair."""
        # Verify lesson exists
        lesson_result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
        if not lesson_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

        result = await db.execute(
            select(Progress).where(
                Progress.user_id == user_id,
                Progress.lesson_id == lesson_id,
            )
        )
        progress = result.scalar_one_or_none()

        is_completed = payload.percent_complete >= 100.0

        if progress is None:
            progress = Progress(
                user_id=user_id,
                lesson_id=lesson_id,
                percent_complete=payload.percent_complete,
                last_position=payload.last_position,
                is_completed=is_completed,
                completed_at=datetime.now(timezone.utc) if is_completed else None,
            )
            db.add(progress)
        else:
            progress.percent_complete = max(progress.percent_complete, payload.percent_complete)
            progress.last_position = payload.last_position
            if is_completed and not progress.is_completed:
                progress.is_completed = True
                progress.completed_at = datetime.now(timezone.utc)

        await db.flush()
        await db.refresh(progress)
        return progress

    @staticmethod
    async def course_summary(
        db: AsyncSession,
        user_id: int,
        course_id: int,
    ) -> CourseSummary:
        """Aggregate progress across all lessons in a course."""
        # Count total lessons
        total_result = await db.execute(
            select(func.count(Lesson.id)).where(Lesson.course_id == course_id)
        )
        total_lessons: int = total_result.scalar_one() or 0

        if total_lessons == 0:
            return CourseSummary(
                course_id=course_id,
                total_lessons=0,
                completed_lessons=0,
                overall_percent=0.0,
            )

        # Get all progress records for this user in this course
        progress_result = await db.execute(
            select(Progress)
            .join(Lesson, Lesson.id == Progress.lesson_id)
            .where(
                Lesson.course_id == course_id,
                Progress.user_id == user_id,
            )
        )
        records = progress_result.scalars().all()

        completed_lessons = sum(1 for r in records if r.is_completed)
        avg_percent = (
            sum(r.percent_complete for r in records) / total_lessons if records else 0.0
        )

        return CourseSummary(
            course_id=course_id,
            total_lessons=total_lessons,
            completed_lessons=completed_lessons,
            overall_percent=round(avg_percent, 2),
        )
