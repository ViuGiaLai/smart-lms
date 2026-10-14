from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enrollment import Enrollment
from app.models.lesson import Lesson
from app.models.progress import Progress


async def ensure_enrollment(db: AsyncSession, user_id: int, course_id: int) -> Enrollment:
    """Tạo bản ghi ghi danh nếu chưa có. Idempotent."""
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user_id,
            Enrollment.course_id == course_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    enrollment = Enrollment(user_id=user_id, course_id=course_id)
    db.add(enrollment)
    await db.flush()
    return enrollment


async def enrolled_course_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Tập khóa học đã ghi danh: bảng enrollments ∪ suy ra từ progress cũ."""
    enroll_res = await db.execute(
        select(Enrollment.course_id).where(Enrollment.user_id == user_id)
    )
    ids: set[int] = set(enroll_res.scalars().all())

    progress_res = await db.execute(
        select(Lesson.course_id)
        .join(Progress, Progress.lesson_id == Lesson.id)
        .where(Progress.user_id == user_id)
        .distinct()
    )
    ids |= set(progress_res.scalars().all())
    return ids


async def student_counts_by_course(db: AsyncSession, course_ids: list[int]) -> dict[int, int]:
    """Số học viên duy nhất theo khóa (enrollment ∪ progress)."""
    if not course_ids:
        return {}

    pairs: set[tuple[int, int]] = set()

    enroll_res = await db.execute(
        select(Enrollment.course_id, Enrollment.user_id).where(
            Enrollment.course_id.in_(course_ids)
        )
    )
    pairs.update((row[0], row[1]) for row in enroll_res.all())

    progress_res = await db.execute(
        select(Lesson.course_id, Progress.user_id)
        .join(Progress, Progress.lesson_id == Lesson.id)
        .where(Lesson.course_id.in_(course_ids))
        .distinct()
    )
    pairs.update((row[0], row[1]) for row in progress_res.all())

    counts: dict[int, int] = {cid: 0 for cid in course_ids}
    for course_id, _user_id in pairs:
        counts[course_id] = counts.get(course_id, 0) + 1
    return counts


async def unique_students_for_courses(db: AsyncSession, course_ids: list[int]) -> int:
    if not course_ids:
        return 0
    pairs: set[int] = set()
    enroll_res = await db.execute(
        select(Enrollment.user_id).where(Enrollment.course_id.in_(course_ids)).distinct()
    )
    pairs.update(enroll_res.scalars().all())
    progress_res = await db.execute(
        select(Progress.user_id)
        .join(Lesson, Lesson.id == Progress.lesson_id)
        .where(Lesson.course_id.in_(course_ids))
        .distinct()
    )
    pairs.update(progress_res.scalars().all())
    return len(pairs)


def compute_streak(activity_dates: set[date], today: date | None = None) -> int:
    """Chuỗi ngày học liên tiếp, tính từ hôm nay (hoặc hôm qua nếu hôm nay chưa học)."""
    if not activity_dates:
        return 0
    cursor = today or date.today()
    if cursor not in activity_dates:
        cursor = cursor - timedelta(days=1)
        if cursor not in activity_dates:
            return 0
    streak = 0
    while cursor in activity_dates:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


async def activity_dates_for_user(db: AsyncSession, user_id: int) -> set[date]:
    result = await db.execute(
        select(Progress.updated_at, Progress.started_at, Progress.completed_at).where(
            Progress.user_id == user_id
        )
    )
    dates: set[date] = set()
    for updated_at, started_at, completed_at in result.all():
        for stamp in (updated_at, started_at, completed_at):
            if stamp is None:
                continue
            if isinstance(stamp, datetime):
                if stamp.tzinfo is not None:
                    stamp = stamp.astimezone(timezone.utc)
                dates.add(stamp.date())
            elif isinstance(stamp, date):
                dates.add(stamp)
    return dates
