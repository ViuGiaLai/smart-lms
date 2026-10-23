from __future__ import annotations

import math
from datetime import datetime, timezone
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
from app.services.course_service import CourseService, slugify
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


def _duration_label(seconds: int | None) -> str:
    total = int(seconds or 0)
    if total <= 0:
        return "0 phút"
    hours, remainder = divmod(total, 3600)
    minutes = remainder // 60
    if hours and minutes:
        return f"{hours} giờ {minutes} phút"
    if hours:
        return f"{hours} giờ"
    return f"{minutes} phút"


def _format_course_dict(course: Course, student_progress: float | None = None, total_students: int = 0, is_enrolled: bool = False) -> dict[str, Any]:
    """Helper to convert Course model to frontend-friendly dict with live calculated fields."""
    actual_lessons_count = len(course.lessons) if course.lessons else 0
    actual_duration = sum((l.duration or 0) for l in course.lessons) if course.lessons else 0
    status_value = _status_value(course)
    return {
        "id": str(course.id),
        "title": course.title,
        "slug": course.slug,
        "description": course.description or "",
        "shortDescription": (course.description[:120] + "...") if course.description and len(course.description) > 120 else (course.description or ""),
        "thumbnail": course.thumbnail or "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&fit=crop",
        "price": float(course.price) if course.price is not None else 0.0,
        "currency": "VND",
        "level": course.level or "intermediate",
        "status": status_value,
        "isPublished": status_value == CourseStatus.published.value,
        "duration": actual_duration,
        "durationText": _duration_label(actual_duration),
        "totalLessons": actual_lessons_count,
        "totalStudents": total_students,
        "studentsCount": total_students,
        # Hệ thống chưa có bảng đánh giá (reviews) nên không bịa điểm số sao.
        "rating": None,
        "totalReviews": 0,
        "instructor": {
            "id": str(course.instructor_id),
            "fullName": course.instructor.name if course.instructor else "Chưa cập nhật",
            "email": course.instructor.email if course.instructor else "",
        },
        "category": {
            "id": f"cat-{slugify(course.category) or 'chua-phan-loai'}",
            "name": course.category or "Chưa phân loại",
            "slug": slugify(course.category) or "chua-phan-loai",
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
    offset = (page - 1) * limit

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
async def get_enrolled_courses(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return enrolled courses with actual progress for the current authenticated user only."""
    from app.models.progress import Progress
    from app.models.enrollment import Enrollment
    from app.services.enrollment_service import enrolled_course_ids as resolve_enrolled_course_ids

    user_id = current_user.id
    course_ids = await resolve_enrolled_course_ids(db, user_id)

    if not course_ids:
        return {"success": True, "data": []}

    stmt = (
        select(Course)
        .options(selectinload(Course.instructor), selectinload(Course.lessons))
        .where(
            Course.id.in_(course_ids),
            Course.status == CourseStatus.published,
        )
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
            Enrollment.course_id.in_(course_ids)
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
                # Giữ mốc truy cập MỚI NHẤT, không phải bài học cuối theo thứ tự.
                if p_obj.updated_at and (last_accessed is None or p_obj.updated_at > last_accessed):
                    last_accessed = p_obj.updated_at

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
            "lastAccessedAt": last_accessed.isoformat() if last_accessed else (c.created_at.isoformat() if c.created_at else None),
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


async def _can_view_answer_key(db: AsyncSession, course: Course, user: User | None) -> bool:
    """Chỉ người quản lý khóa học (giảng viên/admin) hoặc học viên đã ghi danh
    mới được thấy đáp án đúng của bộ đề. Khách/non-enrolled không được thấy
    để tránh rò rỉ đáp án qua endpoint công khai."""
    if user is None:
        return False
    role = _role_value(user)
    if role == UserRole.admin.value or course.instructor_id == user.id:
        return True
    if role == UserRole.student.value:
        # Dùng chung định nghĩa "đã ghi danh" (enrollment ∪ suy ra từ progress)
        # với trang /courses/enrolled để học viên cũ vẫn thấy được đáp án.
        return course.id in await enrolled_course_ids(db, user.id)
    return False


@router.get("/categories")
async def list_course_categories(
    status: str = Query("published"),
    db: AsyncSession = Depends(get_db),
):
    """Danh mục thực tế đang được dùng trong DB (kèm số lượng khóa học).

    Dùng cho datalist gợi ý ở trang tạo khóa học thay vì hardcode danh sách
    ở frontend. Giảng viên vẫn có thể nhập danh mục mới.
    """
    total = func.count(Course.id)
    conditions = [Course.category.isnot(None), Course.category != ""]
    if status != "all":
        conditions.append(Course.status == status)
    result = await db.execute(
        select(Course.category, total)
        .where(*conditions)
        .group_by(Course.category)
        .order_by(total.desc(), Course.category.asc())
    )
    return {
        "success": True,
        "data": [
            {"name": name, "slug": slugify(name) or f"danh-muc-{index}", "count": count}
            for index, (name, count) in enumerate(result.all(), start=1)
        ],
    }


@router.get("/slug/{slug}")
async def get_course_by_slug_route(
    slug: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a course by its SEO slug."""
    result = await db.execute(select(Course.id).where(Course.slug == slug))
    course_id = result.scalar_one_or_none()
    if course_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")
    return await get_course(course_id, current_user=current_user, db=db)


@router.get("/id/{course_id}")
async def get_course_by_id_route(
    course_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single course by ID route."""
    return await get_course(course_id, current_user=current_user, db=db)


@router.get("/{course_id}")
async def get_course(
    course_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
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

    include_answers = await _can_view_answer_key(db, course, current_user)

    data = _format_course_dict(course)
    data["lessons"] = [
        {
            "id": str(lesson.id),
            "title": lesson.title,
            "description": lesson.description or "",
            # `duration` luôn là số giây để mọi client tính toán thống nhất;
            # nhãn hiển thị nằm ở `durationText`.
            "duration": lesson.duration or 0,
            "duration_seconds": lesson.duration or 0,
            "durationText": _duration_label(lesson.duration),
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
            "lesson_id": str(quiz.lesson_id) if quiz.lesson_id is not None else None,
            "title": quiz.title,
            "description": quiz.description,
            "questions": [
                {
                    "id": str(q.id),
                    "question_text": q.question_text,
                    "options": q.options,
                    "correct_answer": q.correct_answer if include_answers else None,
                    "correct": q.correct_answer if include_answers else None,
                    "explanation": q.explanation if include_answers else None,
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
    # Sort progress records by updated_at to get the most recently accessed lesson
    sorted_records = sorted(progress_records, key=lambda p: p.updated_at or datetime.min.replace(tzinfo=timezone.utc))
    last_lesson = str(lesson_ids[0]) if lesson_ids else None
    if sorted_records:
        last_lesson = str(sorted_records[-1].lesson_id)

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
    payload: dict[str, Any] | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Mark a lesson complete and persist in PostgreSQL for the CURRENT user.

    Yeu cau dang nhap: khong con ghi tien do cho user dau tien/id=1 khi thieu token.
    """
    from app.models.progress import Progress
    from datetime import datetime, timezone

    payload = payload or {}
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
