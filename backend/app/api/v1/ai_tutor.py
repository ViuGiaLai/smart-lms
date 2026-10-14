from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/ai-tutor")


class TutorRequest(BaseModel):
    question: str
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
                    return

                async for chunk in response.aiter_text():
                    if chunk:
                        yield chunk  # forward raw SSE chunks
    except httpx.RequestError:
        yield f"data: {json.dumps({'error': 'Không thể kết nối tới AI service.'})}\n\n"


@router.post("/chat")
async def ai_tutor_chat(
    payload: TutorRequest,
    current_user: User = Depends(get_current_active_user),
) -> StreamingResponse:
    """
    Stream an AI tutor response as Server-Sent Events (SSE).

    The client should consume the `text/event-stream` response and handle
    `data:` lines. Each event carries a JSON object:
    - `{"token": "..."}` – partial response token
    - `{"done": true}`   – stream finished
    - `{"error": "..."}` – error message
    """
    ai_payload = {
        "question": payload.question,
        "course_id": payload.course_id,
        "lesson_id": payload.lesson_id or 1,
        "context": payload.context,
    }

    return StreamingResponse(
        _stream_from_ai_service(ai_payload, current_user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
