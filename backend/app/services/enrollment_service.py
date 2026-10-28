from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment
from app.models.progress import Progress
from app.models.user import User, UserRole


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


async def require_course_access(
    db: AsyncSession,
    user: User,
    course_id: int,
) -> Course:
    """Require staff ownership or an active student's enrollment in a course."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role == UserRole.admin.value or (
        role == UserRole.instructor.value and course.instructor_id == user.id
    ):
        return course

    if role != UserRole.student.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền truy cập khóa học này")

    if course.status != CourseStatus.published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Khóa học chưa được xuất bản")

    if course_id not in await enrolled_course_ids(db, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn chưa đăng ký khóa học này")

    return course


async def enrolled_course_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Tập khóa học đã ghi danh — CHỈ đọc bảng enrollments.

    `enrollments` là nguồn sự thật duy nhất. Migration 0007 đã backfill các cặp
    (user, course) cũ vốn chỉ tồn tại trong `progress`; mọi thao tác ghi tiến độ
    đều gọi `ensure_enrollment` để không sinh dữ liệu lệch về sau.
    """
    result = await db.execute(
        select(Enrollment.course_id).where(Enrollment.user_id == user_id)
    )
    return set(result.scalars().all())


async def student_counts_by_course(db: AsyncSession, course_ids: list[int]) -> dict[int, int]:
    """Số học viên duy nhất theo khóa, đọc từ bảng enrollments."""
    if not course_ids:
        return {}

    result = await db.execute(
        select(Enrollment.course_id, func.count(func.distinct(Enrollment.user_id)))
        .where(Enrollment.course_id.in_(course_ids))
        .group_by(Enrollment.course_id)
    )
    counts: dict[int, int] = {cid: 0 for cid in course_ids}
    for course_id, total in result.all():
        counts[course_id] = int(total)
    return counts


async def unique_students_for_courses(db: AsyncSession, course_ids: list[int]) -> int:
    """Số học viên duy nhất trong các khóa, đọc từ bảng enrollments."""
    if not course_ids:
        return 0
    result = await db.execute(
        select(func.count(func.distinct(Enrollment.user_id))).where(
            Enrollment.course_id.in_(course_ids)
        )
    )
    return int(result.scalar() or 0)


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


def compute_longest_streak(activity_dates: set[date]) -> int:
    """Chuỗi ngày học liên tiếp dài nhất trong toàn bộ lịch sử hoạt động."""
    if not activity_dates:
        return 0
    longest = 0
    for day in activity_dates:
        # Chỉ bắt đầu đếm từ ngày "đầu chuỗi" (ngày liền trước không có hoạt động).
        if (day - timedelta(days=1)) in activity_dates:
            continue
        length = 1
        cursor = day + timedelta(days=1)
        while cursor in activity_dates:
            length += 1
            cursor += timedelta(days=1)
        longest = max(longest, length)
    return longest


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
