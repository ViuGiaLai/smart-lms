from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status, Response
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.cache import invalidate_course_caches
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course
from app.models.learning_event import LearningEvent
from app.models.lesson import Lesson
from app.models.user import User
from app.schemas.course import LessonCreate, LessonUpdate, LessonResponse
from app.services.ai_quota import enforce_ai_quota
from app.services.enrollment_service import require_course_access

router = APIRouter(prefix="/courses/{course_id}/lessons")

_YOUTUBE_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|v/))([A-Za-z0-9_-]{11})"
)


def _youtube_video_id(url: str | None) -> str | None:
    match = _YOUTUBE_ID_RE.search((url or "").strip())
    return match.group(1) if match else None


async def _get_course_or_404(course_id: int, db: AsyncSession) -> Course:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


async def _get_lesson_or_404(lesson_id: int, course_id: int, db: AsyncSession) -> Lesson:
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return lesson


@router.get("", response_model=list[LessonResponse])
async def list_lessons(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Lesson]:
    """List all lessons for a course ordered by order_index."""
    await require_course_access(db, current_user, course_id)
    result = await db.execute(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.order_index)
    )
    return list(result.scalars().all())


@router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    await require_course_access(db, current_user, course_id)
    return await _get_lesson_or_404(lesson_id, course_id, db)


@router.post("", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    course_id: int,
    payload: LessonCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    """Create a lesson inside a course (instructor/admin only)."""
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = Lesson(course_id=course_id, **payload.model_dump())
    db.add(lesson)
    await db.flush()
    await db.refresh(lesson)
    await db.commit()
    await invalidate_course_caches()
    return lesson


@router.put("/{lesson_id}", response_model=LessonResponse)
async def update_lesson(
    course_id: int,
    lesson_id: int,
    payload: LessonUpdate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Lesson:
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = await _get_lesson_or_404(lesson_id, course_id, db)
    previous_video_id = lesson.youtube_video_id
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)

    # Một bài học được sửa từ màn quản lý có thể vừa được gắn/đổi URL YouTube.
    # Đồng bộ metadata nguồn ở đây để các thao tác lấy phụ đề sau đó luôn biết
    # chính xác video nào, thay vì chỉ hoạt động với lesson tạo qua importer.
    if "video_url" in payload.model_fields_set:
        video_id = _youtube_video_id(lesson.video_url)
        lesson.youtube_video_id = video_id
        lesson.source_type = "youtube" if video_id else ("external" if lesson.video_url else "manual")
        if video_id != previous_video_id:
            lesson.subtitle_status = "none"
            lesson.subtitle_language = None
            lesson.subtitle_srt = None
            lesson.subtitle_checksum = None
            lesson.subtitle_error = None
            # Transcript của video cũ không bao giờ được dùng lẫn sang video mới.
            # Người quản lý có thể lưu transcript mới sau khi đổi video.
            lesson.transcript = None
    await db.flush()
    await db.refresh(lesson)
    await db.commit()
    await invalidate_course_caches()
    return lesson


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    course = await _get_course_or_404(course_id, db)
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")

    lesson = await _get_lesson_or_404(lesson_id, course_id, db)
    await db.delete(lesson)
    await db.commit()
    await invalidate_course_caches()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{lesson_id}/summarize")
async def summarize_lesson(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Tóm tắt bài học thành điểm chính, flashcards và từ khóa bằng AI.
    Tổng hợp nội dung từ video transcript, tài liệu đính kèm (document chunks) hoặc bài học.
    """
    await require_course_access(db, current_user, course_id)
    await enforce_ai_quota(db, current_user.id, "summarizer")

    lesson = await _get_lesson_or_404(lesson_id, course_id, db)

    # 1. Thu thập nội dung bài học
    parts: list[str] = []
    if lesson.transcript and len(lesson.transcript.strip()) > 30:
        parts.append(f"Phụ đề / Transcript video:\n{lesson.transcript.strip()}")

    # 2. Lấy chunks tài liệu từ pgvector
    try:
        chunks_res = await db.execute(
            text(
                "SELECT content FROM document_chunks "
                "WHERE lesson_id = :lesson_id "
                "ORDER BY id ASC LIMIT 25"
            ),
            {"lesson_id": lesson_id},
        )
        chunk_texts = [r[0] for r in chunks_res.fetchall() if r[0]]
        if chunk_texts:
            parts.append("Tài liệu bài học:\n" + "\n\n".join(chunk_texts))
    except Exception:
        # Bảng chưa có hoặc truy vấn lỗi thì bỏ qua phần chunk
        pass

    if not parts and lesson.content and len(lesson.content.strip()) > 20:
        parts.append(f"Nội dung bài học:\n{lesson.content.strip()}")

    full_text = "\n\n".join(parts).strip()
    if not full_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bài học chưa có nội dung văn bản, video transcript hoặc tài liệu số hóa để AI tóm tắt.",
        )

    # 3. Gửi sang AI Service
    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/summarizer/summarize"
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    headers = {
        "X-User-Id": str(current_user.id),
        "X-User-Role": role_str,
        **settings.ai_service_headers,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            res = await client.post(
                url,
                json={
                    "content": full_text[:35000],
                    "num_key_points": 8,
                    "num_flashcards": 6,
                    "lesson_id": lesson_id,
                },
                headers=headers,
            )
        if res.status_code >= 400:
            detail = "AI Service không thể tóm tắt bài giảng"
            try:
                detail = res.json().get("detail", detail)
            except Exception:
                pass
            raise HTTPException(status_code=res.status_code, detail=str(detail))
        summary_result = res.json()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Không thể kết nối đến AI Service: {str(exc)}",
        )

    # 4. Ghi nhận sự kiện học tập
    db.add(
        LearningEvent(
            user_id=current_user.id,
            course_id=course_id,
            lesson_id=lesson_id,
            event_type="ai_summary",
            event_metadata={"lesson_title": lesson.title},
        )
    )
    await db.commit()

    return {"success": True, "data": summary_result}
