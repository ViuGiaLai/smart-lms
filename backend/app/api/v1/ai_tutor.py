from __future__ import annotations

import json
from typing import AsyncGenerator, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.chat_message import ChatMessage
from app.models.ai_feedback import AiMessageFeedback
from app.models.lesson import Lesson
from app.models.learning_event import LearningEvent
from app.models.user import User
from app.services.ai_quota import enforce_ai_quota
from app.services.enrollment_service import require_course_access

router = APIRouter(prefix="/ai-tutor")

MAX_STORED_MESSAGES = 200


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class TutorRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=4000)
    course_id: int | None = None
    lesson_id: int | None = None
    context: str | None = None  # optional extra context
    tutor_mode: Literal["socratic", "direct", "practice"] = "socratic"
    # Chỉ là ngữ cảnh hội thoại của chính người dùng; không dùng để phân quyền.
    chat_history: list[ChatTurn] | None = Field(default=None, max_length=10)


class ChatMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    sources: list | None = None
    timestamp: str


def _serialize_message(row: ChatMessage) -> dict:
    return {
        "id": f"db-{row.id}",
        "role": row.role,
        "content": row.content,
        "sources": row.sources or None,
        "timestamp": row.created_at.isoformat() if row.created_at else None,
    }


async def _stream_from_ai_service(
    payload: dict,
    current_user: User,
    db: AsyncSession,
    lesson: Lesson,
) -> AsyncGenerator[str, None]:
    """Proxy SSE từ AI Service, đồng thời lưu lại hội thoại vào PostgreSQL."""
    url = f"{settings.AI_SERVICE_URL}/api/v1/rag/ask/stream"
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    headers = {
        "X-User-Id": str(current_user.id),
        "X-User-Role": role_str,
        **settings.ai_service_headers,
    }

    answer_parts: list[str] = []
    sources: list[dict] = []

    def handle_event(raw_line: str) -> None:
        line = raw_line.strip()
        if not line.startswith("data:"):
            return
        data_str = line[5:].strip()
        if not data_str or data_str == "[DONE]":
            return
        try:
            event = json.loads(data_str)
        except ValueError:
            answer_parts.append(data_str)
            return
        if event.get("type") == "sources" or isinstance(event.get("sources"), list):
            raw_sources = event.get("data") if event.get("type") == "sources" else event.get("sources")
            if isinstance(raw_sources, list):
                sources.clear()
                sources.extend(item for item in raw_sources if isinstance(item, dict))
        piece = event.get("token") or event.get("content")
        if isinstance(piece, str) and piece:
            answer_parts.append(piece)
        elif isinstance(event.get("answer"), str) and event["answer"]:
            answer_parts.append(event["answer"])

    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    await response.aread()
                    yield f"data: {json.dumps({'error': 'AI service không thể xử lý yêu cầu.'})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    handle_event(line)
                    yield f"{line}\n\n"
    except httpx.RequestError:
        yield f"data: {json.dumps({'error': 'Không thể kết nối tới AI service.'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return

    answer = "".join(answer_parts).strip()
    if answer:
        saved_id: int | None = None
        try:
            row = ChatMessage(
                user_id=current_user.id,
                course_id=lesson.course_id,
                lesson_id=lesson.id,
                role="assistant",
                content=answer[:20000],
                sources=sources or None,
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            saved_id = row.id
        except Exception:
            await db.rollback()
        if saved_id is not None:
            # Cho giao diện biết ID thật trong PostgreSQL để gắn đánh giá
            # hữu ích/không hữu ích vào đúng tin nhắn.
            yield f"data: {json.dumps({'type': 'message_saved', 'id': f'db-{saved_id}'})}\n\n"


@router.post("/chat")
async def ai_tutor_chat(
    payload: TutorRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Stream an AI tutor response as Server-Sent Events (SSE).

    The client should consume the `text/event-stream` response and handle
    `data:` lines. Each event carries a JSON object:
    - `{"token": "..."}` – partial response token
    - `{"done": true}`   – stream finished
    - `{"error": "..."}` – error message

    Hội thoại được lưu vào bảng `chat_messages` để mở lại ở thiết bị khác.
    """
    if payload.lesson_id is None:
        raise HTTPException(status_code=422, detail="lesson_id là bắt buộc để hỏi AI theo ngữ cảnh bài học")

    lesson_result = await db.execute(select(Lesson).where(Lesson.id == payload.lesson_id))
    lesson = lesson_result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    if payload.course_id is not None and payload.course_id != lesson.course_id:
        raise HTTPException(status_code=400, detail="Bài học không thuộc khóa học đã chọn")
    course = await require_course_access(db, current_user, lesson.course_id)
    await enforce_ai_quota(db, current_user.id, "tutor")

    # Giữ tối đa 6 lượt gần nhất; nội dung đã được Pydantic giới hạn kích thước.
    history = (
        [turn.model_dump() for turn in payload.chat_history[-6:]]
        if payload.chat_history
        else None
    )
    ai_payload = {
        "question": payload.question,
        "lesson_id": lesson.id,
        "context": None,
        # Tên bài và trình độ lấy từ DB, không tin dữ liệu client gửi.
        "lesson_title": lesson.title,
        "course_level": course.level,
        "course_category": course.category,
        "grade_label": course.grade_label,
        "target_audience": course.target_audience,
        "language": course.language or "vi",
        "tutor_mode": payload.tutor_mode or "socratic",
        "chat_history": history,
    }

    # Lưu câu hỏi trước khi bắt đầu stream để không mất lượt hỏi khi mạng đứt.
    db.add(
        ChatMessage(
            user_id=current_user.id,
            course_id=lesson.course_id,
            lesson_id=lesson.id,
            role="user",
            content=payload.question.strip(),
        )
    )
    db.add(
        LearningEvent(
            user_id=current_user.id,
            course_id=lesson.course_id,
            lesson_id=lesson.id,
            event_type="ai_chat",
            event_metadata={"tutor_mode": payload.tutor_mode or "socratic"},
        )
    )
    await db.commit()

    return StreamingResponse(
        _stream_from_ai_service(ai_payload, current_user, db, lesson),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history")
async def get_chat_history(
    lesson_id: int = Query(..., ge=1),
    limit: int = Query(default=60, ge=1, le=MAX_STORED_MESSAGES),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Trả hội thoại gần nhất của chính người dùng trong một bài học."""
    lesson = (
        await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    ).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    await require_course_access(db, current_user, lesson.course_id)

    rows = (
        await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.user_id == current_user.id,
                ChatMessage.lesson_id == lesson_id,
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    messages = [_serialize_message(row) for row in reversed(rows)]
    assistant_ids = [
        row.id for row in rows if row.role == "assistant"
    ]
    if assistant_ids:
        feedback_rows = (
            await db.execute(
                select(AiMessageFeedback.message_id, AiMessageFeedback.rating).where(
                    AiMessageFeedback.user_id == current_user.id,
                    AiMessageFeedback.message_id.in_(assistant_ids),
                )
            )
        ).all()
        feedback_map = {message_id: rating for message_id, rating in feedback_rows}
        for item in messages:
            if item["role"] == "assistant":
                try:
                    message_id = int(str(item["id"]).removeprefix("db-"))
                except ValueError:
                    continue
                if message_id in feedback_map:
                    item["feedback"] = feedback_map[message_id]
    return {"success": True, "data": messages}


@router.delete("/history")
async def clear_chat_history(
    lesson_id: int = Query(..., ge=1),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Xóa hội thoại của người dùng trong một bài học."""
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.user_id == current_user.id,
            ChatMessage.lesson_id == lesson_id,
        )
    )
    await db.commit()
    return {"success": True}
