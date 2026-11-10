from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.course import Course
from app.models.learning_event import LearningEvent
from app.models.lesson import Lesson
from app.models.user import User
from app.services.enrollment_service import require_course_access

router = APIRouter(prefix="/events", tags=["Learning Events"])

# Danh sách sự kiện được phép ghi. Giữ danh sách đóng để dữ liệu phân tích
# không bị nhiễu bởi tên sự kiện tự do từ client.
ALLOWED_EVENT_TYPES = {
    "login",
    "course_view",
    "lesson_view",
    "video_play",
    "video_pause",
    "video_complete",
    "material_open",
    "quiz_start",
    "quiz_submit",
    "ai_chat",
    "ai_feedback",
}

MAX_EVENTS_PER_BATCH = 50


class LearningEventIn(BaseModel):
    event_type: str = Field(..., min_length=3, max_length=40)
    course_id: int | None = Field(default=None, ge=1)
    lesson_id: int | None = Field(default=None, ge=1)
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)
    metadata: dict[str, Any] | None = None

    @field_validator("event_type")
    @classmethod
    def _known_event(cls, value: str) -> str:
        if value not in ALLOWED_EVENT_TYPES:
            raise ValueError("Loại sự kiện không hợp lệ")
        return value

    @field_validator("metadata")
    @classmethod
    def _small_metadata(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        # Metadata chỉ để bổ sung ngữ cảnh kỹ thuật ngắn, không phải nơi lưu
        # nội dung bài làm hay dữ liệu cá nhân.
        if len(value) > 12:
            raise ValueError("metadata tối đa 12 khóa")
        import json

        if len(json.dumps(value, ensure_ascii=False)) > 2000:
            raise ValueError("metadata quá lớn")
        return value


class LearningEventBatch(BaseModel):
    events: list[LearningEventIn] = Field(..., min_length=1, max_length=MAX_EVENTS_PER_BATCH)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def record_learning_events(
    payload: LearningEventBatch,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Ghi nhận lô sự kiện học tập của chính người dùng đang đăng nhập.

    Quyền truy cập khóa học được kiểm tra một lần cho mỗi khóa trong lô để
    không cho phép ghi sự kiện vào khóa mình không được học/quản lý.
    """
    course_ids = {event.course_id for event in payload.events if event.course_id}
    allowed_courses: set[int] = set()
    for course_id in course_ids:
        await require_course_access(db, current_user, course_id)
        allowed_courses.add(course_id)

    # Xác thực bài học thuộc đúng khóa đã khai báo.
    lesson_ids = {event.lesson_id for event in payload.events if event.lesson_id}
    lesson_courses: dict[int, int] = {}
    if lesson_ids:
        rows = await db.execute(
            select(Lesson.id, Lesson.course_id).where(Lesson.id.in_(lesson_ids))
        )
        lesson_courses = {lesson_id: course_id for lesson_id, course_id in rows.all()}

    accepted: list[LearningEvent] = []
    for event in payload.events:
        course_id = event.course_id
        if event.lesson_id is not None:
            real_course_id = lesson_courses.get(event.lesson_id)
            if real_course_id is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Bài học {event.lesson_id} không tồn tại",
                )
            if course_id is not None and course_id != real_course_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bài học không thuộc khóa học đã khai báo",
                )
            course_id = real_course_id

        if course_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mỗi sự kiện cần course_id hoặc lesson_id",
            )
        if course_id not in allowed_courses:
            await require_course_access(db, current_user, course_id)
            allowed_courses.add(course_id)

        accepted.append(
            LearningEvent(
                user_id=current_user.id,
                course_id=course_id,
                lesson_id=event.lesson_id,
                event_type=event.event_type,
                duration_seconds=event.duration_seconds,
                event_metadata=event.metadata,
            )
        )

    db.add_all(accepted)
    await db.commit()
    return {"success": True, "accepted": len(accepted)}


# ── Phản hồi câu trả lời AI ─────────────────────────────────────────────
feedback_router = APIRouter(prefix="/ai-tutor", tags=["AI Tutor"])


class AiFeedbackIn(BaseModel):
    rating: str = Field(..., pattern="^(up|down)$")
    comment: str | None = Field(default=None, max_length=1000)


@feedback_router.put("/messages/{message_id}/feedback")
async def upsert_ai_feedback(
    message_id: int,
    payload: AiFeedbackIn,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Ghi/cập nhật đánh giá của người học cho một câu trả lời của gia sư AI."""
    from app.models.ai_feedback import AiMessageFeedback
    from app.models.chat_message import ChatMessage

    message = await db.get(ChatMessage, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tin nhắn")
    if message.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn chỉ có thể đánh giá tin nhắn của mình")
    if message.role != "assistant":
        raise HTTPException(status_code=400, detail="Chỉ đánh giá được câu trả lời của trợ lý")

    row = (
        await db.execute(
            select(AiMessageFeedback).where(
                AiMessageFeedback.message_id == message_id,
                AiMessageFeedback.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = AiMessageFeedback(
            message_id=message_id,
            user_id=current_user.id,
            rating=payload.rating,
            comment=(payload.comment or "").strip() or None,
        )
        db.add(row)
    else:
        row.rating = payload.rating
        row.comment = (payload.comment or "").strip() or None

    await db.commit()
    await db.refresh(row)
    return {
        "success": True,
        "data": {
            "messageId": message_id,
            "rating": row.rating,
            "comment": row.comment,
        },
    }
