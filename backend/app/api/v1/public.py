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


@router.get("/certificates/verify/{certificate_code}")
async def verify_certificate(certificate_code: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Xác thực tính hợp lệ của chứng chỉ hoàn thành khóa học theo mã định danh.

    Cho phép nhà tuyển dụng hoặc bên thứ ba kiểm tra trực tuyến chứng chỉ mà học
    viên cung cấp. Kiểm tra cả chữ ký HMAC lẫn điều kiện hoàn thành thực tế trong DB.
    """
    import hmac
    import re
    from fastapi import HTTPException, status
    from app.api.v1.student import generate_certificate_code
    from app.models.progress import Progress
    from app.models.quiz import Quiz, QuizSubmission

    clean_code = (certificate_code or "").strip().upper()
    match = re.match(r"^SLMS-(\d+)-(\d+)-([A-F0-9]{8})$", clean_code)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mã chứng chỉ không đúng định dạng hoặc không tồn tại",
        )

    course_id = int(match.group(1))
    user_id = int(match.group(2))
    expected_code = generate_certificate_code(course_id, user_id)
    if not hmac.compare_digest(clean_code, expected_code):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mã chứng chỉ không hợp lệ hoặc đã bị làm giả",
        )

    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one_or_none()
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not course or not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy dữ liệu chứng chỉ")

    lesson_ids = (await db.execute(select(Lesson.id).where(Lesson.course_id == course_id))).scalars().all()
    total_lessons = len(lesson_ids)
    completed_count = 0
    last_lesson_completed_at = None
    if lesson_ids:
        p_row = (
            await db.execute(
                select(func.count(Progress.id), func.max(Progress.completed_at)).where(
                    Progress.user_id == user_id,
                    Progress.lesson_id.in_(lesson_ids),
                    Progress.is_completed == True,
                )
            )
        ).one_or_none()
        if p_row:
            completed_count = int(p_row[0] or 0)
            last_lesson_completed_at = p_row[1]

    quiz_ids = (await db.execute(select(Quiz.id).where(Quiz.course_id == course_id))).scalars().all()
    has_quizzes = len(quiz_ids) > 0
    passed_quiz_count = 0
    last_quiz_passed_at = None
    if has_quizzes:
        q_row = (
            await db.execute(
                select(func.count(QuizSubmission.id), func.max(QuizSubmission.submitted_at)).where(
                    QuizSubmission.user_id == user_id,
                    QuizSubmission.quiz_id.in_(quiz_ids),
                    QuizSubmission.passed == True,
                )
            )
        ).one_or_none()
        if q_row:
            passed_quiz_count = int(q_row[0] or 0)
            last_quiz_passed_at = q_row[1]

    quiz_passed = (not has_quizzes) or (passed_quiz_count > 0)
    is_valid = total_lessons > 0 and completed_count >= total_lessons and quiz_passed
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chứng chỉ chưa đủ điều kiện cấp hoặc đã bị thu hồi",
        )

    candidates = [dt for dt in (last_lesson_completed_at, last_quiz_passed_at) if dt is not None]
    issued_at = max(candidates).isoformat() if candidates else None

    return {
        "success": True,
        "data": {
            "valid": True,
            "certificateCode": expected_code,
            "courseId": str(course_id),
            "courseTitle": course.title,
            "studentName": user.name,
            "completedLessons": completed_count,
            "totalLessons": total_lessons,
            "issuedAt": issued_at,
        },
    }
