from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.progress import Progress
from app.models.user import User
from app.models.enrollment import Enrollment
from app.core.security import get_current_active_user
from datetime import datetime, timezone
from fastapi import HTTPException, status

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/dashboard")
async def get_student_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return live dashboard stats for the student from PostgreSQL."""
    # Count total courses ENROLLED by this student
    enrolled_result = await db.execute(
        select(func.count(Enrollment.id)).where(Enrollment.user_id == current_user.id)
    )
    total_enrolled = enrolled_result.scalar() or 0

    # Query completed and in-progress lessons from Progress table FOR THIS STUDENT
    completed_res = await db.execute(
        select(func.count(Progress.id))
        .where(Progress.user_id == current_user.id, Progress.is_completed == True)
    )
    total_completed = completed_res.scalar() or 0

    in_progress_res = await db.execute(
        select(func.count(Progress.id))
        .where(Progress.user_id == current_user.id, Progress.is_completed == False)
    )
    total_in_progress = in_progress_res.scalar() or 0

    # Sum actual watch time in seconds FOR THIS STUDENT
    watch_time_res = await db.execute(
        select(func.coalesce(func.sum(Progress.last_position), 0))
        .where(Progress.user_id == current_user.id)
    )
    total_watch_time = watch_time_res.scalar() or 0

    # Calculate streak
    from app.services.enrollment_service import activity_dates_for_user, compute_streak
    from datetime import date
    activity_dates = await activity_dates_for_user(db, current_user.id)
    current_streak = compute_streak(activity_dates, date.today())

    return {
        "success": True,
        "message": "Student stats retrieved successfully",
        "data": {
            "totalEnrolled": total_enrolled,
            "totalCompleted": total_completed,
            "totalInProgress": total_in_progress,
            "totalWatchTime": int(total_watch_time),
            "currentStreak": current_streak,
            "longestStreak": max(current_streak, 1) if total_completed > 0 or total_in_progress > 0 else 0,
        },
    }


@router.get("/notifications")
async def get_notifications(
    db: AsyncSession = Depends(get_db),
):
    """Return real notifications based on published courses and activities in PostgreSQL."""
    # Lấy các khóa học mới nhất đã xuất bản
    stmt = (
        select(Course)
        .where(Course.status == CourseStatus.published)
        .order_by(Course.created_at.desc())
        .limit(5)
    )
    result = await db.execute(stmt)
    courses = result.scalars().all()

    notifications = []
    for c in courses:
        created_iso = c.created_at.isoformat() if c.created_at else datetime.now(timezone.utc).isoformat()
        notifications.append({
            "id": f"notif-course-{c.id}",
            "type": "announcement",
            "title": f"Khóa học: {c.title}",
            "message": f"Khóa học '{c.title}' đã sẵn sàng. Trải nghiệm Gia sư AI 24/7 và hệ thống đề thi trắc nghiệm ngay!",
            "isRead": False,
            "createdAt": created_iso,
        })

    return {
        "success": True,
        "data": notifications,
    }


@router.get("/certificates/{course_id}")
async def get_certificate(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return certificate info only if all course lessons are completed by the current student in PostgreSQL."""
    # 1. Khóa học có tồn tại không?
    c_res = await db.execute(select(Course).where(Course.id == course_id))
    course = c_res.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    # 2. Tổng số bài giảng của khóa
    l_res = await db.execute(select(Lesson.id).where(Lesson.course_id == course_id))
    lesson_ids = l_res.scalars().all()
    total_lessons = len(lesson_ids)

    # 3. Đếm số bài đã hoàn thành RIÊNG CHO HỌC VIÊN HIỆN TẠI
    completed_count = 0
    if lesson_ids:
        p_res = await db.execute(
            select(func.count(Progress.id)).where(
                Progress.user_id == current_user.id,
                Progress.lesson_id.in_(lesson_ids),
                Progress.is_completed == True,
            )
        )
        completed_count = p_res.scalar() or 0

    # 4. Kiểm tra điều kiện bài thi trắc nghiệm (Quiz) từ Ngân hàng đề thi
    from app.models.quiz import Quiz, QuizSubmission
    q_res = await db.execute(select(Quiz.id).where(Quiz.course_id == course_id))
    quiz_ids = q_res.scalars().all()
    has_quizzes = len(quiz_ids) > 0
    passed_quiz_count = 0
    if has_quizzes:
        sub_res = await db.execute(
            select(func.count(QuizSubmission.id)).where(
                QuizSubmission.user_id == current_user.id,
                QuizSubmission.quiz_id.in_(quiz_ids),
                QuizSubmission.passed == True,
            )
        )
        passed_quiz_count = sub_res.scalar() or 0

    quiz_passed = (not has_quizzes) or (passed_quiz_count > 0)
    is_eligible = total_lessons > 0 and completed_count >= total_lessons and quiz_passed

    return {
        "success": True,
        "data": {
            "courseId": str(course_id),
            "courseTitle": course.title,
            "studentName": current_user.name,
            "studentEmail": current_user.email,
            "isEligible": is_eligible,
            "completedLessons": completed_count,
            "totalLessons": total_lessons,
            "hasQuizzes": has_quizzes,
            "totalQuizzes": len(quiz_ids),
            "passedQuizzes": passed_quiz_count,
            "quizPassed": quiz_passed,
            "certificateUrl": f"/certificates/cert-{course_id}-{current_user.id}.pdf" if is_eligible else None,
            "issuedAt": datetime.now(timezone.utc).isoformat() if is_eligible else None,
        },
    }

