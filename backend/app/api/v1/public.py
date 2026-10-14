from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get_json, cache_set_json
from app.core.database import get_db
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.user import User, UserRole

router = APIRouter(prefix="/public")


@router.get("/stats")
async def get_public_stats(db: AsyncSession = Depends(get_db)) -> dict:
    """Số liệu thật của nền tảng lấy trực tiếp từ cơ sở dữ liệu (dùng cho trang chủ).     Không trả về bất kỳ con số marketing ước lượng nào — mọi giá trị đều đếm từ DB.
    """
    cache_key = "public:stats"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    total_courses = (
        await db.execute(
            select(func.count(Course.id)).where(Course.status == CourseStatus.published)
        )
    ).scalar() or 0
    total_lessons = (await db.execute(select(func.count(Lesson.id)))).scalar() or 0
    total_students = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    ).scalar() or 0
    total_instructors = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.instructor))
    ).scalar() or 0

    payload = {
        "success": True,
        "data": {
            "totalCourses": total_courses,
            "totalLessons": total_lessons,
            "totalStudents": total_students,
            "totalInstructors": total_instructors,
        },
    }
    await cache_set_json(cache_key, payload, ttl=120)
    return payload
