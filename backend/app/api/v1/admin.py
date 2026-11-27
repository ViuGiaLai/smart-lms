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
from app.models.checkout import DemoOrder
from app.models.audit_log import AuditLog
from app.services.audit_service import record_change

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/audit-logs")
async def list_audit_logs(
    before: int | None = Query(None, gt=0),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit + 1)
    if before is not None:
        query = query.where(AuditLog.id < before)
    rows = list(await db.scalars(query))
    return {"data": [
        {"id": row.id, "actorId": row.actor_id, "action": row.action, "targetType": row.target_type,
         "targetId": row.target_id, "details": row.details, "createdAt": row.created_at}
        for row in rows[:limit]
    ], "nextBefore": rows[limit - 1].id if len(rows) > limit else None}


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
        async with db.begin_nested():
            chunk_res = await db.execute(text("SELECT count(*) FROM document_chunks"))
            total_chunks = chunk_res.scalar() or 0
    except Exception:
        total_chunks = 0

    demo_stats = {}
    if settings.demo_checkout_enabled:
        count, amount = (await db.execute(
            select(func.count(DemoOrder.id), func.coalesce(func.sum(DemoOrder.amount), 0))
            .where(DemoOrder.status == "paid")
        )).one()
        demo_stats = {"paidDemoOrders": count, "demoAmount": float(amount)}

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
            **demo_stats,
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

    usage: dict[str, Any] = {
        "totalTokens": 0,
        "promptTokens": 0,
        "completionTokens": 0,
        "requests": 0,
        "last7DaysTokens": 0,
        "estimatedShare": 0.0,
        "byFeature": [],
    }
    if database_online:
        try:
            totals = (
                await db.execute(
                    text(
                        """
                        SELECT COALESCE(SUM(total_tokens), 0),
                               COALESCE(SUM(prompt_tokens), 0),
                               COALESCE(SUM(completion_tokens), 0),
                               COUNT(*),
                               COALESCE(SUM(CASE WHEN created_at >= now() - interval '7 days'
                                                 THEN total_tokens ELSE 0 END), 0),
                               COALESCE(AVG(CASE WHEN is_estimated THEN 1.0 ELSE 0.0 END), 0)
                        FROM ai_usage_logs
                        """
                    )
                )
            ).one()
            by_feature = (
                await db.execute(
                    text(
                        """
                        SELECT feature,
                               COALESCE(SUM(total_tokens), 0) AS tokens,
                               COUNT(*) AS requests
                        FROM ai_usage_logs
                        GROUP BY feature
                        ORDER BY tokens DESC
                        """
                    )
                )
            ).all()
            usage = {
                "totalTokens": int(totals[0] or 0),
                "promptTokens": int(totals[1] or 0),
                "completionTokens": int(totals[2] or 0),
                "requests": int(totals[3] or 0),
                "last7DaysTokens": int(totals[4] or 0),
                "estimatedShare": round(float(totals[5] or 0), 2),
                "byFeature": [
                    {"feature": row[0], "tokens": int(row[1] or 0), "requests": int(row[2] or 0)}
                    for row in by_feature
                ],
            }
        except Exception:
            usage = {
                "totalTokens": 0,
                "promptTokens": 0,
                "completionTokens": 0,
                "requests": 0,
                "last7DaysTokens": 0,
                "estimatedShare": 0.0,
                "byFeature": [],
            }

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
            "usage": usage,
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
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    # Ngăn admin tự khóa tài khoản mình
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể khóa tài khoản của chính mình")

    previous = user.is_active
    user.is_active = not previous
    if not user.is_active:
        user.token_version += 1
    record_change(db, current_user.id, "account.status", "user", user.id, previous=previous, current=user.is_active)
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
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    # Ngăn admin tự thay đổi vai trò của mình
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể thay đổi vai trò của chính mình")

    if user.role.value != new_role:
        record_change(db, current_user.id, "account.role", "user", user.id, previous=user.role.value, current=new_role)
        user.role = UserRole(new_role)
        user.token_version += 1
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
        .options(selectinload(Course.instructor), selectinload(Course.lessons), selectinload(Course.education_level_rel))
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
                "educationLevelName": course.education_level_rel.name if course.education_level_rel else None,
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
    review_note: str | None = Query(None, max_length=2000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Xuất bản, đưa về nháp hoặc lưu trữ một khóa học. Chỉ Admin."""
    from app.services.course_service import CourseService

    course = await CourseService.change_status(db, course_id, new_status, current_user, review_note)
    await db.commit()
    await db.refresh(course)
    await invalidate_course_caches()

    status_value = course.status.value if hasattr(course.status, "value") else str(course.status)
    return {
        "success": True,
        "message": f"Đã cập nhật trạng thái khóa học thành {status_value}",
        "data": {"id": str(course.id), "status": status_value},
    }
