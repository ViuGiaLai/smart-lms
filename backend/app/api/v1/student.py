from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.progress import Progress
from app.models.user import User
from app.models.quiz import Quiz, QuizQuestion, QuizSubmission
from app.core.security import get_current_active_user
from app.services.enrollment_service import enrolled_course_ids
from datetime import datetime, timezone
from fastapi import HTTPException, status

router = APIRouter(prefix="/student", tags=["Student"])


async def _visible_course_ids(current_user: User, db: AsyncSession) -> list[int]:
    """Course scope: students see enrolled courses, instructors see owned ones, admin sees all."""
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role == "student":
        # Dùng chung logic với /courses/enrolled: chỉ bảng enrollments (nguồn duy nhất).
        return sorted(await enrolled_course_ids(db, current_user.id))
    if role == "instructor":
        res = await db.execute(
            select(Course.id).where(Course.instructor_id == current_user.id)
        )
    else:
        res = await db.execute(select(Course.id))
    return [row[0] for row in res.all()]


@router.get("/dashboard")
async def get_student_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return live dashboard stats for the student from PostgreSQL.

    Trước đây hàm này chạy 5 truy vấn riêng biệt trên cùng bảng `progress`
    (đếm completed, đếm in-progress, sum watch time, lấy mốc thời gian). Mỗi
    round-trip tới DB ở xa tốn ~100-200 ms, nên gộp lại thành 1 truy vấn.
    """
    from app.services.enrollment_service import (
        compute_streak,
        compute_longest_streak,
        enrolled_course_ids,
    )
    from datetime import date

    # 1) Phạm vi khóa học đã ghi danh — chỉ đọc bảng `enrollments` (nguồn sự thật
    #    duy nhất); migration 0007 đã backfill các cặp cũ vốn chỉ có trong progress.
    course_ids = await enrolled_course_ids(db, current_user.id)

    # 2) Một truy vấn duy nhất lấy tiến độ từng bài + khóa chứa bài đó
    #    (join lessons để quy bài học về khóa, phục vụ thống kê theo khóa).
    rows = await db.execute(
        select(
            Lesson.course_id,
            Progress.is_completed,
            Progress.last_position,
            Progress.updated_at,
            Progress.started_at,
            Progress.completed_at,
        )
        .join(Lesson, Lesson.id == Progress.lesson_id)
        .where(Progress.user_id == current_user.id)
    )

    completed_lessons_by_course: dict[int, int] = {}
    total_completed_lessons = 0
    total_in_progress_lessons = 0
    total_watch_time = 0
    activity_dates: set[date] = set()
    for course_id, is_completed, last_position, updated_at, started_at, completed_at in rows.all():
        if is_completed:
            total_completed_lessons += 1
            completed_lessons_by_course[course_id] = completed_lessons_by_course.get(course_id, 0) + 1
        else:
            total_in_progress_lessons += 1
        total_watch_time += int(last_position or 0)
        for stamp in (updated_at, started_at, completed_at):
            if stamp is None:
                continue
            if stamp.tzinfo is not None:
                stamp = stamp.astimezone(timezone.utc)
            activity_dates.add(stamp.date())

    # 3) Tổng số bài của từng khóa đã ghi danh — cần để biết khóa đã xong hay chưa.
    lesson_totals: dict[int, int] = {}
    if course_ids:
        lesson_rows = await db.execute(
            select(Lesson.course_id, func.count(Lesson.id))
            .where(Lesson.course_id.in_(course_ids))
            .group_by(Lesson.course_id)
        )
        lesson_totals = {cid: int(total) for cid, total in lesson_rows.all()}

    total_completed_courses = 0
    total_in_progress_courses = 0
    for course_id in course_ids:
        total_lessons = lesson_totals.get(course_id, 0)
        done_lessons = completed_lessons_by_course.get(course_id, 0)
        if total_lessons > 0 and done_lessons >= total_lessons:
            total_completed_courses += 1
        elif done_lessons > 0:
            total_in_progress_courses += 1

    return {
        "success": True,
        "message": "Student stats retrieved successfully",
        "data": {
            # `totalCompleted` / `totalInProgress` là số KHÓA HỌC (đúng như tên gọi
            # và như UI đang hiển thị). Thống kê theo bài học nằm ở 2 trường riêng.
            "totalEnrolled": len(course_ids),
            "totalCompleted": total_completed_courses,
            "totalInProgress": total_in_progress_courses,
            "totalCompletedLessons": total_completed_lessons,
            "totalInProgressLessons": total_in_progress_lessons,
            "totalWatchTime": total_watch_time,
            "currentStreak": compute_streak(activity_dates, date.today()),
            "longestStreak": compute_longest_streak(activity_dates),
        },
    }


@router.get("/quizzes")
async def get_my_quizzes(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """All quizzes of the courses visible to this user in a single request.

    Replaces the old client-side fan-out (`enrollments` -> N x `quizzes`) that
    made the student quiz page wait for many sequential round-trips.
    """
    course_ids = await _visible_course_ids(current_user, db)
    if not course_ids:
        return {"success": True, "data": []}

    rows = await db.execute(
        select(
            Quiz.id,
            Quiz.course_id,
            Quiz.title,
            Quiz.description,
            Quiz.time_limit,
            Quiz.pass_score,
            Quiz.is_ai_generated,
            Course.title,
            func.count(QuizQuestion.id),
        )
        .join(Course, Course.id == Quiz.course_id)
        .outerjoin(QuizQuestion, QuizQuestion.quiz_id == Quiz.id)
        .where(Quiz.course_id.in_(course_ids))
        .group_by(Quiz.id, Course.title)
        .order_by(Quiz.created_at.desc())
    )

    data = [
        {
            "id": str(quiz_id),
            "courseId": str(course_id),
            "courseTitle": course_title,
            "title": title,
            "description": description,
            "timeLimit": time_limit,
            "passScore": pass_score,
            "isAiGenerated": is_ai_generated,
            "questionCount": int(question_count),
        }
        for (
            quiz_id,
            course_id,
            title,
            description,
            time_limit,
            pass_score,
            is_ai_generated,
            course_title,
            question_count,
        ) in rows.all()
    ]
    return {"success": True, "data": data}


@router.get("/results")
async def get_my_results(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """All quiz submissions of this user (with quiz/course titles) in one request."""
    course_ids = await _visible_course_ids(current_user, db)
    if not course_ids:
        return {"success": True, "data": []}

    question_counts = (
        select(QuizQuestion.quiz_id.label("quiz_id"), func.count(QuizQuestion.id).label("total"))
        .group_by(QuizQuestion.quiz_id)
        .subquery()
    )

    rows = await db.execute(
        select(QuizSubmission, Quiz, Course, question_counts.c.total)
        .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
        .join(Course, Course.id == Quiz.course_id)
        .outerjoin(question_counts, question_counts.c.quiz_id == Quiz.id)
        .where(
            QuizSubmission.user_id == current_user.id,
            Quiz.course_id.in_(course_ids),
        )
        .order_by(QuizSubmission.submitted_at.desc())
    )

    data = [
        {
            "id": submission.id,
            "quizId": str(quiz.id),
            "quizTitle": quiz.title,
            "courseId": str(course.id),
            "courseTitle": course.title,
            "score": float(submission.score or 0),
            "passed": bool(submission.passed),
            "submittedAt": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "totalQuestions": int(total) if total is not None else None,
        }
        for submission, quiz, course, total in rows.all()
    ]
    return {"success": True, "data": data}


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

