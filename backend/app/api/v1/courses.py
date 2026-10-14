from __future__ import annotations

import math
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.core.cache import cache_get_json, cache_set_json, invalidate_course_caches
from app.core.database import get_db
from app.core.security import get_current_active_user, get_optional_user, require_instructor
from app.models.course import Course, CourseStatus
from app.models.quiz import Quiz
from app.models.user import User, UserRole
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse
from app.services.course_service import CourseService
from app.services.enrollment_service import (
    ensure_enrollment,
    enrolled_course_ids,
    student_counts_by_course,
)
from app.services.quiz_service import serialize_question

router = APIRouter(prefix="/courses")


def _role_value(user: User | None) -> str:
    if user is None:
        return ""
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_admin(user: User | None) -> bool:
    return _role_value(user) == UserRole.admin.value


def _can_manage_course(course: Course, user: User | None) -> bool:
    if user is None:
        return False
    return _is_admin(user) or course.instructor_id == user.id


def _status_value(course: Course) -> str:
    return course.status.value if hasattr(course.status, "value") else str(course.status)


def _format_course_dict(course: Course, student_progress: float | None = None, total_students: int = 0, is_enrolled: bool = False) -> dict[str, Any]:
    """Helper to convert Course model to frontend-friendly dict with live calculated fields."""
    actual_lessons_count = len(course.lessons) if course.lessons else 0
    actual_duration = sum((l.duration or 0) for l in course.lessons) if course.lessons else 0
    status_value = _status_value(course)
    return {
        "id": str(course.id),
        "title": course.title,
        "slug": f"khoa-hoc-{course.id}",
        "description": course.description or "",
        "shortDescription": (course.description[:120] + "...") if course.description and len(course.description) > 120 else (course.description or ""),
        "thumbnail": course.thumbnail or "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&fit=crop",
        "price": float(course.price) if course.price is not None else 0.0,
        "currency": "VND",
        "level": course.level or "intermediate",
        "status": status_value,
        "isPublished": status_value == CourseStatus.published.value,
        "duration": actual_duration,
        "totalLessons": actual_lessons_count,
        "totalStudents": total_students,
        "studentsCount": total_students,
        # Hệ thống chưa có bảng đánh giá (reviews) nên không bịa điểm số sao.
        "rating": None,
        "totalReviews": 0,
        "instructor": {
            "id": str(course.instructor_id),
            "fullName": course.instructor.name if course.instructor else "Giảng viên",
            "email": course.instructor.email if course.instructor else "",
        },
        "category": {
            "id": f"cat-{course.category or 'it'}",
            "name": course.category or "Công nghệ Thông tin",
            "slug": "cong-nghe-thong-tin",
        },
        "isEnrolled": is_enrolled or student_progress is not None,
        "progress": student_progress if student_progress is not None else 0,
    }


@router.get("")
async def list_courses(
    skip: int = Query(0, ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    status: str | None = None,
    category: str | None = None,
    level: str | None = None,
    sortBy: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List published courses with pagination and filters."""
    cache_key = (
        "courses:list:"
        f"{status or 'published'}:{category or '-'}:{level or '-'}:"
        f"{sortBy or 'default'}:{search or '-'}:{page}:{skip}:{limit}"
    )
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    # Gom tat ca dieu kien loc vao mot danh sach de dung cho CA cau query lay du lieu
    # lan cau query dem tong so luong. Neu chi ap dung bo loc cho stmt ma bo qua count_stmt
    # thi total/totalPages se sai khi nguoi dung loc theo category/level/search.
    conditions = []
    if status:
        conditions.append(Course.status == status)
    else:
        conditions.append(Course.status == CourseStatus.published)

    if category:
        conditions.append(Course.category.ilike(f"%{category}%"))

    if level and level != "All":
        conditions.append(Course.level == level)

    if search:
        conditions.append(
            or_(
                Course.title.ilike(f"%{search}%"),
                Course.description.ilike(f"%{search}%"),
            )
        )

    stmt = (
        select(Course)
        .options(selectinload(Course.instructor), selectinload(Course.lessons))
        .where(*conditions)
    )

    # Count total with the SAME filters applied above
    count_stmt = select(func.count(Course.id)).where(*conditions)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Pagination calculation
    offset = (page - 1) * limit if page > 1 else skip

    # Order by sortBy parameter
    if sortBy == "newest":
        stmt = stmt.order_by(Course.created_at.desc())
    elif sortBy == "price":
        stmt = stmt.order_by(Course.price.asc())
    elif sortBy == "rating":
        stmt = stmt.order_by(Course.id.desc())
    else:  # popularity or default
        stmt = stmt.order_by(Course.id.asc())

    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    courses = result.scalars().all()

    counts = await student_counts_by_course(db, [c.id for c in courses])
    formatted = [_format_course_dict(c, total_students=counts.get(c.id, 0)) for c in courses]

    payload = {
        "success": True,
        "data": formatted,
        "total": total if total > 0 else len(formatted),
        "page": page,
        "limit": limit,
        "totalPages": max(1, math.ceil(total / limit)) if total > 0 else 1,
    }
    await cache_set_json(cache_key, payload, ttl=60)
    return payload


@router.get("/enrolled")
async def get_enrolled_courses(request: Request, db: AsyncSession = Depends(get_db)):
    """Return enrolled courses with actual progress for the current authenticated user only."""
    from app.core.security import decode_token
    from app.models.progress import Progress
    from app.models.enrollment import Enrollment
    from app.models.lesson import Lesson

    auth_header = request.headers.get("authorization")
    user_id = None
    if auth_header and auth_header.startswith("Bearer "):
        try:
            tok = auth_header.split(" ", 1)[1]
            sub = decode_token(tok).get("sub")
            if sub:
                user_id = int(sub)
        except Exception:
            pass

    # Yêu cầu đăng nhập — không fallback sang user khác để tránh data leak
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui lòng đăng nhập để xem danh sách khóa học đã đăng ký",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Lấy enrolled course IDs từ bảng enrollments (chính xác)
    enroll_res = await db.execute(
        select(Enrollment.course_id).where(Enrollment.user_id == user_id)
    )
    enrolled_course_ids = set(enroll_res.scalars().all())

    # Fallback: cũng lấy từ progress cũ nếu chưa có enrollment
    if not enrolled_course_ids:
        p_stmt = select(Progress).where(Progress.user_id == user_id)
        p_res = await db.execute(p_stmt)
        user_progress = p_res.scalars().all()
        if user_progress:
            les_stmt = select(Lesson.course_id).where(
                Lesson.id.in_([p.lesson_id for p in user_progress])
            ).distinct()
            les_res = await db.execute(les_stmt)
            enrolled_course_ids = set(les_res.scalars().all())

    if not enrolled_course_ids:
        return {"success": True, "data": []}

    stmt = (
        select(Course)
        .options(selectinload(Course.instructor), selectinload(Course.lessons))
        .where(Course.id.in_(enrolled_course_ids))
        .order_by(Course.id.asc())
    )
    result = await db.execute(stmt)
    courses = result.scalars().all()

    # Query progress records for this user across all their lessons
    p_stmt = select(Progress).where(Progress.user_id == user_id)
    p_res = await db.execute(p_stmt)
    user_progress = p_res.scalars().all()
    progress_by_lesson = {p.lesson_id: p for p in user_progress}

    # Lấy enrollment date cho mỗi course
    enroll_date_res = await db.execute(
        select(Enrollment.course_id, Enrollment.enrolled_at).where(
            Enrollment.user_id == user_id,
            Enrollment.course_id.in_(enrolled_course_ids)
        )
    )
    enroll_dates = {row[0]: row[1] for row in enroll_date_res.all()}

    enrollments = []
    for c in courses:
        c_lessons = c.lessons or []
        total_l = len(c_lessons)

        completed_count = 0
        last_accessed = None

        for les in c_lessons:
            if les.id in progress_by_lesson:
                p_obj = progress_by_lesson[les.id]
                if p_obj.is_completed:
                    completed_count += 1
                if p_obj.updated_at:
                    last_accessed = p_obj.updated_at.isoformat()

        pct = round((completed_count / total_l * 100), 1) if total_l > 0 else 0
        enrolled_at = enroll_dates.get(c.id)

        enrollments.append({
            "id": f"enroll-{c.id}-{user_id}",
            "userId": str(user_id),
            "courseId": str(c.id),
            "course": _format_course_dict(c, student_progress=pct, is_enrolled=True),
            "progress": pct,
            "completedLessons": completed_count,
            "totalLessons": total_l,
            "lastAccessedAt": last_accessed or (c.created_at.isoformat() if c.created_at else None),
            "enrolledAt": enrolled_at.isoformat() if enrolled_at else (c.created_at.isoformat() if c.created_at else None),
        })

    return {
        "success": True,
        "data": enrollments,
    }


@router.get("/search")
async def search_courses(
    q: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """Search courses by query keyword."""
    stmt = (
        select(Course)
        .options(selectinload(Course.instructor), selectinload(Course.lessons))
        .where(Course.status == CourseStatus.published)
        .where(or_(Course.title.ilike(f"%{q}%"), Course.description.ilike(f"%{q}%")))
        .limit(10)
    )
    result = await db.execute(stmt)
    courses = result.scalars().all()
    return {
        "success": True,
        "data": [_format_course_dict(c) for c in courses],
    }


@router.get("/id/{course_id}")
async def get_course_by_id_route(course_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single course by ID route."""
    return await get_course(course_id, db)


@router.get("/{course_id}")
async def get_course(course_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single course with its lessons and instructor."""
    stmt = (
        select(Course)
        .options(
            selectinload(Course.lessons),
            selectinload(Course.instructor),
            selectinload(Course.quizzes).selectinload(Quiz.questions),
        )
        .where(Course.id == course_id)
    )
    result = await db.execute(stmt)
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    data = _format_course_dict(course)
    data["lessons"] = [
        {
            "id": str(lesson.id),
            "title": lesson.title,
            "description": lesson.description or "",
            "duration": f"{lesson.duration // 60}m" if lesson.duration else "0m",
            "videoUrl": lesson.video_url or "",
            "video_url": lesson.video_url or "",
            "transcript": lesson.transcript or "",
            "resources_url": lesson.resources_url or "",
            "order": lesson.order_index,
            "isFree": lesson.order_index == 1,
        }
        for lesson in course.lessons
    ]
    data["quizzes"] = [
        {
            "id": str(quiz.id),
            "title": quiz.title,
            "description": quiz.description,
            "questions": [
                {
                    "id": str(q.id),
                    "question_text": q.question_text,
                    "options": q.options,
                    "correct_answer": q.correct_answer,
                    "correct": q.correct_answer,
                    "explanation": q.explanation,
                    "order_index": q.order_index,
                }
                for q in quiz.questions
            ],
        }
        for quiz in (course.quizzes or [])
    ]
    return {
        "success": True,
        "data": data,
    }


@router.post("/{course_id}/enroll")
async def enroll_course(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Enroll into a course, create Enrollment record and initialize progress for first lesson."""
    c_res = await db.execute(select(Course).where(Course.id == course_id))
    course = c_res.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    from app.models.lesson import Lesson
    from app.models.progress import Progress
    from app.models.enrollment import Enrollment
    from app.services.enrollment_service import ensure_enrollment

    user_id = current_user.id

    # Tạo enrollment record (idempotent)
    await ensure_enrollment(db, user_id, course_id)

    first_lesson_res = await db.execute(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.order_index.asc()).limit(1)
    )
    first_lesson = first_lesson_res.scalar_one_or_none()
    if first_lesson:
        p_check = await db.execute(
            select(Progress).where(Progress.user_id == user_id, Progress.lesson_id == first_lesson.id)
        )
        if not p_check.scalar_one_or_none():
            db.add(Progress(
                user_id=user_id,
                lesson_id=first_lesson.id,
                percent_complete=0.0,
                is_completed=False,
                last_position=0,
            ))
            await db.commit()

    return {
        "success": True,
        "message": "Đăng ký khóa học thành công",
        "data": {"courseId": str(course_id), "status": "enrolled"},
    }


@router.get("/{course_id}/progress")
async def get_course_progress(course_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Get actual user progress for a course from database for current user."""
    from app.core.security import decode_token
    from app.models.lesson import Lesson
    from app.models.progress import Progress

    auth_header = request.headers.get("authorization")
    user_id = None
    if auth_header and auth_header.startswith("Bearer "):
        try:
            tok = auth_header.split(" ", 1)[1]
            sub = decode_token(tok).get("sub")
            if sub:
                user_id = int(sub)
        except Exception:
            pass

    l_stmt = select(Lesson).where(Lesson.course_id == course_id)
    l_res = await db.execute(l_stmt)
    lessons = l_res.scalars().all()
    lesson_ids = [l.id for l in lessons]

    if user_id and lesson_ids:
        p_stmt = select(Progress).where(Progress.user_id == user_id, Progress.lesson_id.in_(lesson_ids))
        p_res = await db.execute(p_stmt)
        progress_records = p_res.scalars().all()
    else:
        progress_records = []

    completed_ids = [str(p.lesson_id) for p in progress_records if p.is_completed]
    total = len(lessons)
    pct = round((len(completed_ids) / total * 100), 1) if total > 0 else 0
    last_lesson = str(lesson_ids[0]) if lesson_ids else "1"
    if progress_records:
        last_lesson = str(progress_records[-1].lesson_id)

    return {
        "success": True,
        "data": {
            "courseId": str(course_id),
            "completedLessons": completed_ids,
            "totalLessons": total,
            "percentage": pct,
            "lastLessonId": last_lesson,
        },
    }


@router.post("/{course_id}/lessons/{lesson_id}/complete")
async def mark_lesson_complete(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    payload: dict[str, Any] = {},
    db: AsyncSession = Depends(get_db),
):
    """Mark a lesson complete and persist in PostgreSQL for the CURRENT user.

    Yeu cau dang nhap: khong con ghi tien do cho user dau tien/id=1 khi thieu token.
    """
    from app.models.progress import Progress
    from datetime import datetime, timezone

    user_id = current_user.id
    watched_seconds = payload.get("watchedSeconds", 0)

    p_stmt = select(Progress).where(Progress.user_id == user_id, Progress.lesson_id == lesson_id)
    p_res = await db.execute(p_stmt)
    record = p_res.scalar_one_or_none()

    if record:
        record.is_completed = True
        record.percent_complete = 100.0
        record.last_position = watched_seconds or record.last_position
        record.completed_at = datetime.now(timezone.utc)
    else:
        record = Progress(
            user_id=user_id,
            lesson_id=lesson_id,
            percent_complete=100.0,
            is_completed=True,
            last_position=watched_seconds,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)

    return {
        "success": True,
        "message": "Đã lưu tiến độ bài học vào cơ sở dữ liệu",
        "data": {
            "lessonId": str(lesson_id),
            "isCompleted": True,
            "percentComplete": record.percent_complete,
        },
    }


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Course:
    """Create a new course (instructor/admin only)."""
    course = await CourseService.create(db, payload, instructor_id=current_user.id)
    await db.commit()
    await invalidate_course_caches()
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    payload: CourseUpdate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Course:
    """Update a course. Instructors can only update their own courses."""
    course = await CourseService.update(db, course_id, payload, current_user)
    await db.commit()
    await invalidate_course_caches()
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_course(
    course_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Soft-delete (archive) a course."""
    await CourseService.delete(db, course_id, current_user)
    await db.commit()
    await invalidate_course_caches()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{course_id}/publish", response_model=CourseResponse)
async def publish_course(
    course_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Course:
    """Publish a draft course."""
    course = await CourseService.change_status(db, course_id, CourseStatus.published, current_user)
    await db.commit()
    await invalidate_course_caches()
    return course
