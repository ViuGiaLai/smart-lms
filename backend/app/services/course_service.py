from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.course import Course, CourseStatus
from app.models.category import LearningCategory
from app.models.education_level import EducationLevel
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
            .options(
                selectinload(Course.lessons),
                selectinload(Course.learning_category),
                selectinload(Course.education_level_rel),
            )
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
    async def _validate_catalog(
        db: AsyncSession,
        category_id: int | None,
        education_level_id: int | None,
    ) -> None:
        """Danh mục lĩnh vực và cấp học do Admin quản lý, không do giảng viên tự tạo.

        Ch deck: nếu không kiểm tra, giảng viên có thể gán khóa học vào danh mục Admin
        đã ngừng sử dụng, hoặc trỏ tới id không tồn tại, làm hỏng cây danh mục chung.
        """
        if category_id is not None:
            row = (
                await db.execute(
                    select(LearningCategory.id, LearningCategory.is_active).where(
                        LearningCategory.id == category_id
                    )
                )
            ).first()
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Danh mục không tồn tại trong kho danh mục của hệ thống.",
                )
            if not row.is_active:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Danh mục này đã bị Admin ngừng sử dụng. Hãy chọn danh mục đang hoạt động.",
                )

        if education_level_id is not None:
            level = (
                await db.execute(
                    select(EducationLevel.id, EducationLevel.is_active).where(
                        EducationLevel.id == education_level_id
                    )
                )
            ).first()
            if level is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cấp học không tồn tại trong danh mục cấp học của hệ thống.",
                )
            if not level.is_active:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cấp học này đã bị Admin ngừng sử dụng. Hãy chọn cấp học đang hoạt động.",
                )

    @staticmethod
    async def create(db: AsyncSession, payload: CourseCreate, instructor_id: int) -> Course:
        data = payload.model_dump()
        requested_slug = data.pop("slug", None)
        await CourseService._validate_catalog(
            db, data.get("category_id"), data.get("education_level_id")
        )
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
        if "category_id" in data or "education_level_id" in data:
            await CourseService._validate_catalog(
                db,
                data.get("category_id", course.category_id),
                data.get("education_level_id", course.education_level_id),
            )
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

