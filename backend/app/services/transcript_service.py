"""Lưu phụ đề vào Lesson và nhúng vào pgvector qua AI Service hiện có.

Không tạo pipeline embedding thứ hai: mọi vector đều đi qua
`POST /api/v1/documents/ingest-text` của AI Service để dùng chung embedder.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.user import User
from app.services import srt_service

logger = logging.getLogger(__name__)

MAX_CHUNKS = 800
MAX_TRANSCRIPT_CHARS = 400_000


class TranscriptIngestError(Exception):
    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


async def ingest_subtitle(
    db: AsyncSession,
    *,
    lesson: Lesson,
    course: Course,
    current_user: User,
    srt_content: str,
    language: str,
    document_name: str | None = None,
) -> dict[str, Any]:
    """Parse SRT → lưu transcript → gửi chunk sang AI Service.

    SRT được lưu trước khi gọi AI để không mất dữ liệu khi AI Service lỗi.
    """
    srt_content = (srt_content or "").strip()
    if not srt_content:
        raise TranscriptIngestError("Tệp phụ đề rỗng.")

    extra_metadata = {
        "lesson_id": lesson.id,
        "course_id": course.id,
        "youtube_video_id": lesson.youtube_video_id or "",
        "video_url": lesson.video_url or "",
        # Tên video để ChatBox hiển thị nguồn dễ hiểu, không chỉ tên tệp SRT.
        "video_title": (lesson.title or "")[:300],
        "filename": document_name
        or f"youtube-{lesson.youtube_video_id or lesson.id}.srt",
        "source_type": "youtube_subtitle",
    }

    try:
        cues, chunks = srt_service.parse_and_chunk(srt_content, extra_metadata=extra_metadata)
    except srt_service.SubtitleParseError as exc:
        raise TranscriptIngestError(str(exc), 422) from exc

    if not chunks:
        raise TranscriptIngestError("Phụ đề không có nội dung để nhúng.", 422)
    if len(chunks) > MAX_CHUNKS:
        raise TranscriptIngestError(
            f"Phụ đề tạo ra {len(chunks)} đoạn, vượt giới hạn {MAX_CHUNKS}. "
            "Hãy chia nhỏ video hoặc rút gọn phụ đề.",
            413,
        )

    digest = srt_service.checksum(srt_content)
    # Upload lại đúng tệp đã ingest thành công: không gọi AI lần nữa.
    if (
        lesson.subtitle_checksum == digest
        and lesson.subtitle_status == "ingested"
        and lesson.subtitle_language == language
    ):
        # Vẫn làm mới transcript (định dạng mốc thời gian có thể đã đổi) nhưng
        # không gọi lại AI/embedding vì nội dung không đổi.
        lesson.transcript = srt_service.transcript_text(cues)[:MAX_TRANSCRIPT_CHARS]
        await db.commit()
        return {
            "ingested": True,
            "skipped": True,
            "lessonId": str(lesson.id),
            "language": language,
            "chunks": len(chunks),
            "message": "Phụ đề không thay đổi, giữ nguyên dữ liệu đã nhúng.",
        }

    lesson.subtitle_srt = srt_content
    lesson.subtitle_checksum = digest
    lesson.subtitle_language = language
    lesson.subtitle_status = "ready"
    lesson.subtitle_error = None
    lesson.transcript = srt_service.transcript_text(cues)[:MAX_TRANSCRIPT_CHARS]
    await db.commit()
    await db.refresh(lesson)

    # ID vector ổn định theo bài học: thay thế đúng phụ đề khi đổi ngôn ngữ/tệp
    # mà không xóa vector slide/PDF đã nhúng cho cùng lesson.
    vector_document_id = f"youtube-subtitle-{lesson.id}"
    payload = {
        "lesson_id": lesson.id,
        "chunks": [chunk.text for chunk in chunks],
        "document_id": vector_document_id,
        "replace_existing": False,
        "replace_document_id": vector_document_id,
        "metadata": [chunk.metadata for chunk in chunks],
    }
    headers = {
        **settings.ai_service_headers,
        "X-User-Id": str(current_user.id),
        "X-User-Role": _role_value(current_user),
    }
    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/ingest-text"

    try:
        async with httpx.AsyncClient(timeout=max(settings.AI_SERVICE_TIMEOUT, 180)) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        lesson.subtitle_status = "failed"
        lesson.subtitle_error = "Không kết nối được AI Service để nhúng phụ đề."
        await db.commit()
        logger.warning("AI Service không phản hồi khi ingest phụ đề lesson=%s", lesson.id)
        raise TranscriptIngestError(
            "Đã lưu phụ đề nhưng chưa nhúng được vào kho tri thức: AI Service không phản hồi. "
            "Bạn có thể bấm “Ingest lại” sau.",
            503,
        ) from exc

    if response.status_code >= 400:
        detail = "AI Service không thể nhúng phụ đề."
        try:
            body = response.json()
            raw = body.get("detail") if isinstance(body, dict) else None
            if isinstance(raw, str) and raw.strip():
                detail = raw.strip()[:500]
        except ValueError:
            pass
        lesson.subtitle_status = "failed"
        lesson.subtitle_error = detail
        await db.commit()
        logger.warning(
            "Ingest phụ đề thất bại lesson=%s status=%s", lesson.id, response.status_code
        )
        raise TranscriptIngestError(
            "Đã lưu phụ đề nhưng chưa nhúng được vào kho tri thức: " + detail,
            502,
        )

    data = response.json() if response.content else {}
    lesson.subtitle_status = "ingested"
    lesson.subtitle_error = None
    await db.commit()

    return {
        "ingested": True,
        "skipped": False,
        "lessonId": str(lesson.id),
        "language": language,
        "chunks": int(data.get("total_chunks") or len(chunks)),
        "deletedChunks": int(data.get("deleted_chunks") or 0),
        "startSeconds": chunks[0].metadata["start_seconds"],
        "endSeconds": chunks[-1].metadata["end_seconds"],
        "message": "Đã nhúng phụ đề vào kho tri thức của bài học.",
    }


async def reingest_saved_subtitle(
    db: AsyncSession,
    *,
    lesson: Lesson,
    course: Course,
    current_user: User,
) -> dict[str, Any]:
    if not (lesson.subtitle_srt or "").strip():
        raise TranscriptIngestError(
            "Bài học chưa có phụ đề đã lưu. Hãy tải SRT hoặc lấy phụ đề trước.",
            400,
        )
    # Ép ingest lại kể cả checksum trùng: người dùng chủ động yêu cầu.
    lesson.subtitle_status = "ready"
    return await ingest_subtitle(
        db,
        lesson=lesson,
        course=course,
        current_user=current_user,
        srt_content=lesson.subtitle_srt or "",
        language=lesson.subtitle_language or "vi",
        document_name=f"youtube-{lesson.youtube_video_id or lesson.id}.srt",
    )
