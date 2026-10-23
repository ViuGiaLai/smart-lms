from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
from sqlalchemy.orm import selectinload
import httpx

from app.core.cache import invalidate_course_caches
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user, require_admin
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.quiz import QuizSubmission

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Lấy thống kê thực tế từ cơ sở dữ liệu PostgreSQL. Chỉ Admin."""
    # 1. Đếm người dùng
    user_count = await db.execute(select(func.count(User.id)))
    total_users = user_count.scalar() or 0

    student_count = await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    total_students = student_count.scalar() or 0

    instructor_count = await db.execute(select(func.count(User.id)).where(User.role == UserRole.instructor))
    total_instructors = instructor_count.scalar() or 0

    # 2. Đếm khóa học
    course_count = await db.execute(select(func.count(Course.id)))
    total_courses = course_count.scalar() or 0

    published_courses = await db.execute(select(func.count(Course.id)).where(Course.status == CourseStatus.published))
    total_published = published_courses.scalar() or 0

    # 3. Đếm bài học & lượt làm bài
    lesson_count = await db.execute(select(func.count(Lesson.id)))
    total_lessons = lesson_count.scalar() or 0

    quiz_sub_count = await db.execute(select(func.count(QuizSubmission.id)))
    total_submissions = quiz_sub_count.scalar() or 0

    # 4. Đếm số lượng chunks đã số hóa vào pgvector
    try:
        chunk_res = await db.execute(text("SELECT count(*) FROM document_chunks"))
        total_chunks = chunk_res.scalar() or 0
    except Exception:
        total_chunks = 0

    return {
        "success": True,
        "data": {
            "totalUsers": total_users,
            "totalStudents": total_students,
            "totalInstructors": total_instructors,
            "totalCourses": total_courses,
            "publishedCourses": total_published,
            "totalLessons": total_lessons,
            "totalQuizSubmissions": total_submissions,
            "totalIndexedChunks": total_chunks,
        },
    }


@router.get("/ai-monitoring")
async def get_ai_monitoring(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Trạng thái hạ tầng AI dựa trên các kiểm tra thực tế, không suy diễn telemetry."""
    database_online = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        database_online = False

    # Bảng document_chunks do AI Service tạo; nếu chưa tồn tại thì coi như chưa
    # số hóa học liệu, KHÔNG được kết luận database offline.
    total_chunks = 0
    indexed_lessons = 0
    if database_online:
        try:
            total_chunks = (await db.execute(text("SELECT count(*) FROM document_chunks"))).scalar() or 0
            indexed_lessons = (
                await db.execute(text("SELECT count(DISTINCT lesson_id) FROM document_chunks"))
            ).scalar() or 0
        except Exception:
            total_chunks = 0
            indexed_lessons = 0

    ai_service: dict[str, Any] = {"status": "offline", "provider": None, "model": None, "version": None}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{settings.AI_SERVICE_URL.rstrip('/')}/health")
            if response.is_success:
                health = response.json()
                ai_service = {
                    "status": "online" if health.get("status") == "healthy" else "offline",
                    "provider": health.get("ai_provider"),
                    "model": health.get("llm_model"),
                    "version": health.get("version"),
                }
    except (httpx.HTTPError, ValueError):
        pass

    return {
        "success": True,
        "data": {
            "backend": {"status": "online", "version": settings.APP_VERSION},
            "database": {
                "status": "online" if database_online else "offline",
                "vectorChunks": total_chunks,
                "indexedLessons": indexed_lessons,
            },
            "aiService": ai_service,
        },
    }


@router.get("/users")
async def list_users(
    role: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Lấy danh sách tất cả người dùng trong hệ thống. Chỉ Admin."""
    stmt = select(User).order_by(desc(User.created_at))

    if role and role != "all":
        stmt = stmt.where(User.role == role)

    if search:
        stmt = stmt.where(User.name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    users = result.scalars().all()

    formatted_users = [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": str(u.role.value if hasattr(u.role, "value") else u.role),
            "isActive": u.is_active,
            "avatarUrl": u.avatar_url,
            "createdAt": u.created_at.strftime("%d/%m/%Y %H:%M") if u.created_at else "",
        }
        for u in users
    ]

    return {
        "success": True,
        "data": formatted_users,
        "total": len(formatted_users),
    }


@router.patch("/users/{user_id}/status")
async def toggle_user_status(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Bật/Tắt trạng thái hoạt động (Khóa / Mở khóa) của tài khoản. Chỉ Admin."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    # Ngăn admin tự khóa tài khoản mình
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể khóa tài khoản của chính mình")

    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "message": f"Tài khoản đã được {'mở khóa' if user.is_active else 'khóa thành công'}",
        "data": {
            "id": str(user.id),
            "isActive": user.is_active,
        },
    }


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: int,
    new_role: str = Query(..., pattern="^(student|instructor|admin)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cập nhật phân quyền người dùng. Chỉ Admin."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    # Ngăn admin tự thay đổi vai trò của mình
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể thay đổi vai trò của chính mình")

    user.role = UserRole(new_role)
    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "message": f"Đã thay đổi vai trò người dùng thành {new_role}",
        "data": {
            "id": str(user.id),
            "role": str(user.role.value if hasattr(user.role, "value") else user.role),
        },
    }


@router.get("/courses")
async def list_courses_for_moderation(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Danh sách toàn bộ khóa học, bao gồm bản nháp và đã lưu trữ, cho Admin."""
    result = await db.execute(
        select(Course)
        .options(selectinload(Course.instructor), selectinload(Course.lessons))
        .order_by(desc(Course.created_at))
    )
    courses = result.scalars().all()

    return {
        "success": True,
        "data": [
            {
                "id": str(course.id),
                "slug": course.slug,
                "title": course.title,
                "category": course.category,
                "instructor": {
                    "id": str(course.instructor_id),
                    "fullName": course.instructor.name if course.instructor else "Chưa xác định",
                },
                "level": course.level or "intermediate",
                "totalLessons": len(course.lessons),
                "price": float(course.price or 0),
                "status": course.status.value if hasattr(course.status, "value") else str(course.status),
                "createdAt": course.created_at.isoformat() if course.created_at else None,
            }
            for course in courses
        ],
    }


@router.patch("/courses/{course_id}/status")
async def change_course_status(
    course_id: int,
    new_status: CourseStatus = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Xuất bản, đưa về nháp hoặc lưu trữ một khóa học. Chỉ Admin."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    course.status = new_status
    await db.commit()
    await db.refresh(course)
    await invalidate_course_caches()

    status_value = course.status.value if hasattr(course.status, "value") else str(course.status)
    return {
        "success": True,
        "message": f"Đã cập nhật trạng thái khóa học thành {status_value}",
        "data": {"id": str(course.id), "status": status_value},
    }
