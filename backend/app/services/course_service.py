from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.course import Course, CourseStatus
from app.models.user import User
from app.schemas.course import CourseCreate, CourseUpdate


def slugify(value: str | None) -> str:
    """Chuẩn hoá tiêu đề tiếng Việt thành slug ASCII ổn định cho URL."""
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", value)
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    ascii_text = ascii_text.replace("đ", "d").replace("Đ", "D")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return re.sub(r"-{2,}", "-", slug)[:200].strip("-")


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
    async def _unique_slug(db: AsyncSession, base: str | None, exclude_id: int | None = None) -> str:
        base_slug = slugify(base) or "khoa-hoc"
        candidate = base_slug
        suffix = 2
        while True:
            stmt = select(Course.id).where(Course.slug == candidate)
            if exclude_id is not None:
                stmt = stmt.where(Course.id != exclude_id)
            existing = await db.execute(stmt.limit(1))
            if existing.scalar_one_or_none() is None:
                return candidate
            candidate = f"{base_slug}-{suffix}"
            suffix += 1

    @staticmethod
    def _check_ownership(course: Course, user: User) -> None:
        from app.models.user import UserRole
        is_admin = user.role == UserRole.admin or getattr(user.role, "value", str(user.role)) == "admin"
        if not is_admin and course.instructor_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền thao tác trên khóa học này")

    @staticmethod
    async def create(db: AsyncSession, payload: CourseCreate, instructor_id: int) -> Course:
        data = payload.model_dump()
        requested_slug = data.pop("slug", None)
        course = Course(instructor_id=instructor_id, **data)
        course.slug = await CourseService._unique_slug(db, requested_slug or payload.title)
        db.add(course)
        await db.flush()
        return await CourseService._get_or_404(db, course.id)

    @staticmethod
    async def update(
        db: AsyncSession, course_id: int, payload: CourseUpdate, user: User
    ) -> Course:
        course = await CourseService._get_or_404(db, course_id)
        CourseService._check_ownership(course, user)
        data = payload.model_dump(exclude_unset=True)
        requested_slug = data.pop("slug", None)
        for field, value in data.items():
            setattr(course, field, value)
        if requested_slug is not None:
            course.slug = await CourseService._unique_slug(
                db, requested_slug or payload.title or course.title, exclude_id=course.id
            )
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

