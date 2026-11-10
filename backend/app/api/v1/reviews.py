from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.cache import invalidate_course_caches
from app.core.database import get_db
from app.core.security import get_current_active_user, get_optional_user
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment
from app.models.review import CourseReview
from app.models.user import User, UserRole
from app.schemas.review import ReviewUpsert

router = APIRouter(prefix="/courses/{course_id}/reviews", tags=["Course Reviews"])


def _role_value(user: User | None) -> str:
    if user is None:
        return ""
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _can_manage_course(course: Course, user: User | None) -> bool:
    if user is None:
        return False
    return _role_value(user) == UserRole.admin.value or course.instructor_id == user.id


def _review_dict(review: CourseReview, current_user: User | None = None) -> dict:
    reviewer: User | None = None
    try:
        if "user" not in sa_inspect(review).unloaded:
            reviewer = review.user
    except Exception:
        reviewer = None
    return {
        "id": review.id,
        "rating": review.rating,
        "comment": review.comment or "",
        "createdAt": review.created_at.isoformat() if review.created_at else None,
        "updatedAt": review.updated_at.isoformat() if review.updated_at else None,
        "user": {
            "id": str(review.user_id),
            "fullName": (reviewer.name if reviewer else "") or "Học viên",
            "avatarUrl": reviewer.avatar_url if reviewer else None,
        },
        "isMine": bool(current_user and review.user_id == current_user.id),
    }


async def _get_visible_course(
    db: AsyncSession, course_id: int, current_user: User | None
) -> Course:
    course = await db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")
    if course.status != CourseStatus.published and not _can_manage_course(course, current_user):
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")
    return course


async def _is_enrolled(db: AsyncSession, course_id: int, user_id: int) -> bool:
    row = await db.execute(
        select(Enrollment.id)
        .where(Enrollment.course_id == course_id, Enrollment.user_id == user_id)
        .limit(1)
    )
    return row.scalar_one_or_none() is not None


@router.get("")
async def list_course_reviews(
    course_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Điểm trung bình, phân bố số sao và danh sách nhận xét của khóa học."""
    await _get_visible_course(db, course_id, current_user)

    distribution = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}
    rows = await db.execute(
        select(CourseReview.rating, func.count(CourseReview.id))
        .where(CourseReview.course_id == course_id)
        .group_by(CourseReview.rating)
    )
    total = 0
    weighted = 0
    for rating, count in rows.all():
        key = str(int(rating))
        if key in distribution:
            distribution[key] = int(count)
        total += int(count)
        weighted += int(rating) * int(count)

    average = round(weighted / total, 1) if total else 0.0

    offset = (page - 1) * limit
    review_rows = await db.execute(
        select(CourseReview)
        .options(joinedload(CourseReview.user))
        .where(CourseReview.course_id == course_id)
        .order_by(CourseReview.created_at.desc(), CourseReview.id.desc())
        .offset(offset)
        .limit(limit)
    )
    reviews = review_rows.scalars().all()

    my_review = None
    if current_user is not None:
        mine = await db.execute(
            select(CourseReview)
            .options(joinedload(CourseReview.user))
            .where(
                CourseReview.course_id == course_id,
                CourseReview.user_id == current_user.id,
            )
        )
        own = mine.scalar_one_or_none()
        if own is not None:
            my_review = _review_dict(own, current_user)

    return {
        "success": True,
        "data": {
            "summary": {
                "averageRating": average,
                "totalReviews": total,
                "distribution": distribution,
            },
            "items": [_review_dict(item, current_user) for item in reviews],
            "myReview": my_review,
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": max(1, (total + limit - 1) // limit),
        },
    }


@router.put("")
async def upsert_course_review(
    course_id: int,
    payload: ReviewUpsert,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Học viên đã ghi danh gửi hoặc cập nhật đánh giá của mình."""
    course = await _get_visible_course(db, course_id, current_user)
    role = _role_value(current_user)
    if role != UserRole.student.value:
        raise HTTPException(
            status_code=403,
            detail="Chỉ học viên đã ghi danh mới được đánh giá khóa học",
        )
    if not await _is_enrolled(db, course.id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Bạn cần ghi danh khóa học trước khi đánh giá",
        )

    result = await db.execute(
        select(CourseReview).where(
            CourseReview.course_id == course.id,
            CourseReview.user_id == current_user.id,
        )
    )
    review = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if review is None:
        review = CourseReview(
            course_id=course.id,
            user_id=current_user.id,
            rating=payload.rating,
            comment=payload.comment,
        )
        db.add(review)
    else:
        review.rating = payload.rating
        review.comment = payload.comment
        review.updated_at = now

    await db.commit()
    await db.refresh(review)
    await invalidate_course_caches()
    # Gán quan hệ đã biết để không phát sinh lazy-load trong endpoint async.
    review.user = current_user
    return {"success": True, "data": _review_dict(review, current_user)}


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_course_review(
    course_id: int,
    review_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Xóa đánh giá của chính mình; quản trị viên được xóa để kiểm duyệt."""
    course = await _get_visible_course(db, course_id, current_user)
    result = await db.execute(
        select(CourseReview).where(
            CourseReview.id == review_id,
            CourseReview.course_id == course.id,
        )
    )
    review = result.scalar_one_or_none()
    if review is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đánh giá")
    if review.user_id != current_user.id and _role_value(current_user) != UserRole.admin.value:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa đánh giá này")

    await db.delete(review)
    await db.commit()
    await invalidate_course_caches()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
