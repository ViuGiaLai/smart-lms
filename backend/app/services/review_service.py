from __future__ import annotations

from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import CourseReview


async def rating_stats_by_course(
    db: AsyncSession, course_ids: Iterable[int]
) -> dict[int, tuple[float, int]]:
    """Trả về {course_id: (điểm trung bình, số lượt đánh giá)} trong một truy vấn.

    Dùng chung cho danh sách/chi tiết khóa học để tránh N+1 và để điểm sao
    luôn khớp với dữ liệu thật trong bảng course_reviews.
    """
    ids = [int(course_id) for course_id in course_ids]
    if not ids:
        return {}
    rows = await db.execute(
        select(
            CourseReview.course_id,
            func.avg(CourseReview.rating),
            func.count(CourseReview.id),
        )
        .where(CourseReview.course_id.in_(ids))
        .group_by(CourseReview.course_id)
    )
    return {
        int(course_id): (float(average or 0), int(total or 0))
        for course_id, average, total in rows.all()
    }
