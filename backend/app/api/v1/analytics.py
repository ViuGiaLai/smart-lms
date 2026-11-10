from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_instructor
from app.models.ai_feedback import AiMessageFeedback
from app.models.ai_usage import AiUsageLog
from app.models.chat_message import ChatMessage
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment
from app.models.learning_event import LearningEvent
from app.models.lesson import Lesson
from app.models.progress import Progress
from app.models.quiz import Quiz, QuizSubmission
from app.models.user import User, UserRole

router = APIRouter(tags=["Analytics"])


def _is_admin(user: User) -> bool:
    return user.role == UserRole.admin or str(getattr(user.role, "value", user.role)) == "admin"


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _fill_daily(rows: list[tuple[Any, int, int]], days: int) -> list[dict[str, Any]]:
    """Điền đủ các ngày trống để biểu đồ không bị đứt đoạn."""
    by_day = {
        (row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])): {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "events": int(row[1] or 0),
            "learners": int(row[2] or 0),
        }
        for row in rows
    }
    today = datetime.now(timezone.utc).date()
    series: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        series.append(by_day.get(day, {"date": day, "events": 0, "learners": 0}))
    return series


@router.get("/instructor/courses/{course_id}/analytics")
async def course_analytics(
    course_id: int,
    days: int = 30,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Số liệu học tập thật của một khóa học (chỉ giảng viên phụ trách/admin)."""
    days = max(7, min(days, 180))
    course = await db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")
    if not _is_admin(current_user) and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn không phụ trách khóa học này")

    since = _since(days)

    # ── Quy mô lớp ──
    enrolled_user_ids = set(
        (
            await db.execute(
                select(Enrollment.user_id).where(Enrollment.course_id == course_id)
            )
        )
        .scalars()
        .all()
    )
    lessons = (
        await db.execute(
            select(Lesson.id, Lesson.title, Lesson.order_index)
            .where(Lesson.course_id == course_id)
            .order_by(Lesson.order_index, Lesson.id)
        )
    ).all()
    lesson_ids = [row[0] for row in lessons]
    total_lessons = len(lesson_ids)

    completed_rows = (
        await db.execute(
            select(Progress.user_id, func.count(Progress.id))
            .where(Progress.lesson_id.in_(lesson_ids), Progress.is_completed.is_(True))
            .group_by(Progress.user_id)
        )
    ).all() if lesson_ids else []
    completed_by_user = {row[0]: int(row[1]) for row in completed_rows}
    completed_lessons = sum(completed_by_user.values())
    completion_rates = [
        min(100.0, (completed_by_user.get(user_id, 0) / total_lessons) * 100)
        for user_id in enrolled_user_ids
    ] if total_lessons else []
    avg_progress = round(sum(completion_rates) / len(completion_rates), 2) if completion_rates else 0.0

    active_learners = int(
        (
            await db.execute(
                select(func.count(func.distinct(LearningEvent.user_id))).where(
                    LearningEvent.course_id == course_id,
                    LearningEvent.created_at >= since,
                )
            )
        ).scalar()
        or 0
    )

    # ── Trắc nghiệm ──
    quiz_submissions = int(
        (
            await db.execute(
                select(func.count(QuizSubmission.id))
                .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
                .where(Quiz.course_id == course_id)
            )
        ).scalar()
        or 0
    )
    avg_quiz_score = float(
        (
            await db.execute(
                select(func.coalesce(func.avg(QuizSubmission.score), 0.0))
                .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
                .where(Quiz.course_id == course_id)
            )
        ).scalar()
        or 0.0
    )

    # ── Gia sư AI ──
    ai_messages = int(
        (
            await db.execute(
                select(func.count(ChatMessage.id)).where(
                    ChatMessage.course_id == course_id,
                    ChatMessage.role == "assistant",
                    ChatMessage.created_at >= since,
                )
            )
        ).scalar()
        or 0
    )
    feedback_rows = (
        await db.execute(
            select(AiMessageFeedback.rating, func.count(AiMessageFeedback.id))
            .join(ChatMessage, ChatMessage.id == AiMessageFeedback.message_id)
            .where(ChatMessage.course_id == course_id, AiMessageFeedback.created_at >= since)
            .group_by(AiMessageFeedback.rating)
        )
    ).all()
    feedback = {str(row[0]): int(row[1]) for row in feedback_rows}

    # ── Hoạt động theo ngày/loại ──
    daily_rows = (
        await db.execute(
            select(
                func.date(LearningEvent.created_at),
                func.count(LearningEvent.id),
                func.count(func.distinct(LearningEvent.user_id)),
            )
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.created_at >= _since(14),
            )
            .group_by(func.date(LearningEvent.created_at))
            .order_by(func.date(LearningEvent.created_at))
        )
    ).all()

    type_rows = (
        await db.execute(
            select(LearningEvent.event_type, func.count(LearningEvent.id))
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.created_at >= since,
            )
            .group_by(LearningEvent.event_type)
            .order_by(func.count(LearningEvent.id).desc())
        )
    ).all()

    view_rows = (
        await db.execute(
            select(LearningEvent.lesson_id, func.count(LearningEvent.id))
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.event_type == "lesson_view",
                LearningEvent.created_at >= since,
            )
            .group_by(LearningEvent.lesson_id)
        )
    ).all()
    views = {row[0]: int(row[1]) for row in view_rows if row[0] is not None}

    material_rows = (
        await db.execute(
            select(LearningEvent.lesson_id, func.count(LearningEvent.id))
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.event_type == "material_open",
                LearningEvent.created_at >= since,
            )
            .group_by(LearningEvent.lesson_id)
        )
    ).all()
    materials = {row[0]: int(row[1]) for row in material_rows if row[0] is not None}

    completion_rows = (
        await db.execute(
            select(Progress.lesson_id, func.count(Progress.id))
            .where(Progress.lesson_id.in_(lesson_ids), Progress.is_completed.is_(True))
            .group_by(Progress.lesson_id)
        )
    ).all() if lesson_ids else []
    completions = {row[0]: int(row[1]) for row in completion_rows}

    lesson_engagement = [
        {
            "lessonId": lesson_id,
            "title": title,
            "views": views.get(lesson_id, 0),
            "materialsOpened": materials.get(lesson_id, 0),
            "completions": completions.get(lesson_id, 0),
        }
        for lesson_id, title, _order in lessons
    ]

    return {
        "success": True,
        "data": {
            "courseId": course.id,
            "courseTitle": course.title,
            "windowDays": days,
            "summary": {
                "enrollments": len(enrolled_user_ids),
                "activeLearners": active_learners,
                "completedLessons": completed_lessons,
                "avgProgressPercent": avg_progress,
                "totalLessons": total_lessons,
                "quizSubmissions": quiz_submissions,
                "avgQuizScorePercent": round(avg_quiz_score * 100, 2),
                "aiMessages": ai_messages,
                "aiFeedbackUp": feedback.get("up", 0),
                "aiFeedbackDown": feedback.get("down", 0),
            },
            "dailyActivity": _fill_daily(daily_rows, 14),
            "activityByType": [
                {"type": str(row[0]), "count": int(row[1])} for row in type_rows
            ],
            "lessonEngagement": lesson_engagement,
        },
    }


@router.get("/admin/analytics/overview")
async def admin_analytics_overview(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Tổng quan vận hành toàn hệ thống cho quản trị viên."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên mới xem được tổng quan")

    since_7d = _since(7)

    role_rows = (
        await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    ).all()
    users_by_role = {
        str(getattr(row[0], "value", row[0])): int(row[1]) for row in role_rows
    }

    status_rows = (
        await db.execute(select(Course.status, func.count(Course.id)).group_by(Course.status))
    ).all()
    courses_by_status = {
        str(getattr(row[0], "value", row[0])): int(row[1]) for row in status_rows
    }

    enrollments_total = int(
        (await db.execute(select(func.count(Enrollment.id)))).scalar() or 0
    )
    enrollments_7d = int(
        (
            await db.execute(
                select(func.count(Enrollment.id)).where(Enrollment.enrolled_at >= since_7d)
            )
        ).scalar()
        or 0
    )

    usage_rows = (
        await db.execute(
            select(
                AiUsageLog.feature,
                func.count(AiUsageLog.id),
                func.coalesce(func.sum(AiUsageLog.total_tokens), 0),
            )
            .where(AiUsageLog.created_at >= since_7d)
            .group_by(AiUsageLog.feature)
        )
    ).all()
    ai_by_feature = [
        {
            "feature": str(row[0]),
            "calls": int(row[1]),
            "tokens": int(row[2] or 0),
        }
        for row in usage_rows
    ]
    ai_calls_7d = sum(item["calls"] for item in ai_by_feature)
    ai_tokens_7d = sum(item["tokens"] for item in ai_by_feature)

    feedback_rows = (
        await db.execute(
            select(AiMessageFeedback.rating, func.count(AiMessageFeedback.id))
            .where(AiMessageFeedback.created_at >= since_7d)
            .group_by(AiMessageFeedback.rating)
        )
    ).all()
    feedback = {str(row[0]): int(row[1]) for row in feedback_rows}
    feedback_total = sum(feedback.values())

    events_7d = int(
        (
            await db.execute(
                select(func.count(LearningEvent.id)).where(LearningEvent.created_at >= since_7d)
            )
        ).scalar()
        or 0
    )
    active_learners_7d = int(
        (
            await db.execute(
                select(func.count(func.distinct(LearningEvent.user_id))).where(
                    LearningEvent.created_at >= since_7d
                )
            )
        ).scalar()
        or 0
    )

    daily_rows = (
        await db.execute(
            select(
                func.date(LearningEvent.created_at),
                func.count(LearningEvent.id),
                func.count(func.distinct(LearningEvent.user_id)),
            )
            .where(LearningEvent.created_at >= _since(14))
            .group_by(func.date(LearningEvent.created_at))
            .order_by(func.date(LearningEvent.created_at))
        )
    ).all()

    return {
        "success": True,
        "data": {
            "users": {
                "total": sum(users_by_role.values()),
                "byRole": users_by_role,
            },
            "courses": {
                "total": sum(courses_by_status.values()),
                "byStatus": courses_by_status,
            },
            "enrollments": {"total": enrollments_total, "last7Days": enrollments_7d},
            "ai": {
                "calls7d": ai_calls_7d,
                "tokens7d": ai_tokens_7d,
                "byFeature": ai_by_feature,
            },
            "feedback": {
                "total": feedback_total,
                "up": feedback.get("up", 0),
                "down": feedback.get("down", 0),
                "positiveRate": round(feedback.get("up", 0) / feedback_total * 100, 1)
                if feedback_total
                else None,
            },
            "events": {"last7Days": events_7d, "activeLearners7d": active_learners_7d},
            "dailyActivity": _fill_daily(daily_rows, 14),
        },
    }
