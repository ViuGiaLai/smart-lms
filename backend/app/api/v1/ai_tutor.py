from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.lesson import Lesson
from app.core.database import get_db
from app.services.enrollment_service import require_course_access
from sqlalchemy import select

router = APIRouter(prefix="/ai-tutor")


class TutorRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=4000)
    course_id: int | None = None
    lesson_id: int | None = None
    context: str | None = None  # optional extra context


async def _stream_from_ai_service(
    payload: dict,
    current_user: User,
) -> AsyncGenerator[str, None]:
    """Proxy an SSE stream from the ai-service to the client."""
    url = f"{settings.AI_SERVICE_URL}/api/v1/rag/ask/stream"
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    headers = {
        "X-User-Id": str(current_user.id),
        "X-User-Role": role_str,
        **settings.ai_service_headers,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    await response.aread()
                    yield f"data: {json.dumps({'error': 'AI service không thể xử lý yêu cầu.'})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return

                async for chunk in response.aiter_text():
                    if chunk:
                        yield chunk  # forward raw SSE chunks
    except httpx.RequestError:
        yield f"data: {json.dumps({'error': 'Không thể kết nối tới AI service.'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"


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
    """
    if payload.lesson_id is None:
        raise HTTPException(status_code=422, detail="lesson_id là bắt buộc để hỏi AI theo ngữ cảnh bài học")

    lesson_result = await db.execute(select(Lesson).where(Lesson.id == payload.lesson_id))
    lesson = lesson_result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    if payload.course_id is not None and payload.course_id != lesson.course_id:
        raise HTTPException(status_code=400, detail="Bài học không thuộc khóa học đã chọn")
    await require_course_access(db, current_user, lesson.course_id)

    ai_payload = {
        "question": payload.question,
        "lesson_id": lesson.id,
        "context": None,
    }

    return StreamingResponse(
        _stream_from_ai_service(ai_payload, current_user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
