from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.course import Course, CourseStatus
from app.models.user import User
from app.schemas.course import CourseCreate, CourseUpdate


class CourseService:
    """Business logic layer for Course operations."""

    @staticmethod
    async def _get_or_404(db: AsyncSession, course_id: int) -> Course:
        result = await db.execute(
            select(Course)
            .options(selectinload(Course.lessons))
            .where(Course.id == course_id)
        )
        course = result.scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        return course

    @staticmethod
    def _check_ownership(course: Course, user: User) -> None:
        from app.models.user import UserRole
        is_admin = user.role == UserRole.admin or getattr(user.role, "value", str(user.role)) == "admin"
        if not is_admin and course.instructor_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền thao tác trên khóa học này")

    @staticmethod
    async def create(db: AsyncSession, payload: CourseCreate, instructor_id: int) -> Course:
        course = Course(instructor_id=instructor_id, **payload.model_dump())
        db.add(course)
        await db.flush()
        return await CourseService._get_or_404(db, course.id)

    @staticmethod
    async def update(
        db: AsyncSession, course_id: int, payload: CourseUpdate, user: User
    ) -> Course:
        course = await CourseService._get_or_404(db, course_id)
        CourseService._check_ownership(course, user)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(course, field, value)
        await db.flush()
        return await CourseService._get_or_404(db, course_id)

    @staticmethod
    async def delete(db: AsyncSession, course_id: int, user: User) -> None:
        """Soft-delete by setting status to archived."""
        course = await CourseService._get_or_404(db, course_id)
        CourseService._check_ownership(course, user)
        course.status = CourseStatus.archived
        await db.flush()

    @staticmethod
    async def change_status(
        db: AsyncSession, course_id: int, new_status: CourseStatus, user: User
    ) -> Course:
        course = await CourseService._get_or_404(db, course_id)
        CourseService._check_ownership(course, user)
        course.status = new_status
        await db.flush()
        return await CourseService._get_or_404(db, course_id)

