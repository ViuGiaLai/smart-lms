"""API nhập học liệu YouTube và quản lý phụ đề.

Phân quyền được kiểm tra ở backend cho mọi thao tác ghi: admin quản lý toàn bộ,
giảng viên chỉ thao tác trên khóa học do mình phụ trách.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_course_caches
from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.user import User, UserRole
from app.services import subtitle_service, transcript_service, youtube_service
from app.services.srt_service import MAX_SRT_BYTES, SubtitleParseError, parse_srt
from app.services.transcript_service import TranscriptIngestError
from app.services.youtube_service import YouTubeError

router = APIRouter(prefix="/youtube", tags=["YouTube Import"])

_LANGUAGE_RE = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$")


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048)


class ImportVideoRequest(BaseModel):
    course_id: int = Field(..., gt=0)
    video_id: str = Field(..., min_length=11, max_length=11)


def _is_admin(user: User) -> bool:
    return user.role == UserRole.admin or str(getattr(user.role, "value", "")) == "admin"


async def _load_lesson_for_manage(
    db: AsyncSession, lesson_id: int, current_user: User
) -> tuple[Lesson, Course]:
    result = await db.execute(
        select(Lesson, Course)
        .join(Course, Course.id == Lesson.course_id)
        .where(Lesson.id == lesson_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại.")
    lesson, course = row
    if not _is_admin(current_user) and course.instructor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền quản lý học liệu của khóa học này.",
        )
    return lesson, course


def _subtitle_payload(lesson: Lesson) -> dict:
    return {
        "status": lesson.subtitle_status or "none",
        "language": lesson.subtitle_language,
        "hasSubtitle": bool((lesson.subtitle_srt or "").strip()),
        "checksum": lesson.subtitle_checksum,
        "error": lesson.subtitle_error,
    }


def _lesson_payload(lesson: Lesson) -> dict:
    return {
        "id": str(lesson.id),
        "title": lesson.title,
        "orderIndex": lesson.order_index,
        "duration": lesson.duration or 0,
        "videoUrl": lesson.video_url,
        "youtubeVideoId": lesson.youtube_video_id,
        "transcriptLength": len(lesson.transcript or ""),
        "subtitle": _subtitle_payload(lesson),
    }


async def _fetch_and_ingest_subtitle_if_available(
    db: AsyncSession,
    *,
    lesson: Lesson,
    course: Course,
    current_user: User,
) -> None:
    """Tự lấy phụ đề ngay sau khi nhập video, nhưng không chặn việc tạo Lesson.

    YouTube không bảo đảm mọi video có phụ đề hoặc cho phép tải tự động. Khi
    không lấy được, Lesson vẫn được tạo và giữ một trạng thái minh bạch để
    giảng viên có thể tải SRT/VTT thủ công sau đó.
    """
    if not lesson.youtube_video_id or not subtitle_service.subtitle_enabled():
        return
    try:
        downloaded = await subtitle_service.download_public_subtitles(lesson.youtube_video_id)
        parse_srt(downloaded["content"])
        await transcript_service.ingest_subtitle(
            db,
            lesson=lesson,
            course=course,
            current_user=current_user,
            srt_content=downloaded["content"],
            language=downloaded["language"],
            document_name=f"youtube-{lesson.youtube_video_id}.{downloaded['language']}.srt",
        )
    except subtitle_service.SubtitleFetchError as exc:
        lesson.subtitle_status = "missing" if exc.code == "no_subtitles" else "failed"
        lesson.subtitle_error = exc.message[:1000]
        await db.commit()
    except (SubtitleParseError, TranscriptIngestError) as exc:
        lesson.subtitle_status = "failed"
        lesson.subtitle_error = str(exc)[:1000]
        await db.commit()


@router.get("/status")
async def youtube_status(current_user: User = Depends(require_instructor)) -> dict:
    """Cho UI biết tính năng nào đang bật (không lộ API key)."""
    return {
        "success": True,
        "data": {
            "importEnabled": youtube_service.is_enabled(),
            "subtitleEnabled": subtitle_service.subtitle_enabled(),
            "subtitleLanguages": [
                item.strip()
                for item in (settings.YOUTUBE_SUBTITLE_LANGUAGES or "vi,en").split(",")
                if item.strip()
            ],
        },
    }


@router.post("/analyze")
async def analyze(
    payload: AnalyzeRequest,
    current_user: User = Depends(require_instructor),
) -> dict:
    """Phân tích URL video/playlist/kênh và trả danh sách video (chưa ghi DB)."""
    try:
        data = await youtube_service.analyze_source(payload.url)
    except YouTubeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {"success": True, "data": data}


@router.post("/import")
async def import_video(
    payload: ImportVideoRequest,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tạo một Lesson từ một video YouTube. Gọi lần lượt từ UI để có tiến độ."""
    course = await db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại.")
    if not _is_admin(current_user) and course.instructor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền thêm bài học vào khóa học này.",
        )

    try:
        video = await youtube_service.fetch_single_video(payload.video_id)
    except YouTubeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    existing = await db.execute(
        select(Lesson).where(
            Lesson.course_id == payload.course_id,
            Lesson.youtube_video_id == payload.video_id,
        )
    )
    duplicate = existing.scalar_one_or_none()
    if duplicate is not None:
        return {
            "success": True,
            "data": {
                "status": "exists",
                "lessonId": str(duplicate.id),
                "video": video,
                "subtitle": _subtitle_payload(duplicate),
            },
        }

    max_order = await db.execute(
        select(func.coalesce(func.max(Lesson.order_index), 0)).where(
            Lesson.course_id == payload.course_id
        )
    )
    next_order = int(max_order.scalar() or 0) + 1

    lesson = Lesson(
        course_id=payload.course_id,
        title=(video["title"] or f"YouTube {payload.video_id}")[:512],
        description=video.get("description") or None,
        video_url=video["url"],
        duration=int(video.get("durationSeconds") or 0),
        order_index=next_order,
        youtube_video_id=payload.video_id,
        subtitle_status="none",
    )
    db.add(lesson)
    try:
        await db.commit()
    except IntegrityError:
        # Hai request đồng thời cho cùng video: trả về bản ghi đã có thay vì lỗi 500.
        await db.rollback()
        existing = await db.execute(
            select(Lesson).where(
                Lesson.course_id == payload.course_id,
                Lesson.youtube_video_id == payload.video_id,
            )
        )
        duplicate = existing.scalar_one_or_none()
        if duplicate is None:
            raise
        return {
            "success": True,
            "data": {
                "status": "exists",
                "lessonId": str(duplicate.id),
                "video": video,
                "subtitle": _subtitle_payload(duplicate),
            },
        }
    await db.refresh(lesson)
    # Bài học được tạo trước, transcript được lấy sau. Do đó video vẫn xuất
    # hiện bình thường khi YouTube không có phụ đề hoặc AI Service tạm lỗi.
    await _fetch_and_ingest_subtitle_if_available(
        db, lesson=lesson, course=course, current_user=current_user
    )
    await db.refresh(lesson)
    await invalidate_course_caches()

    return {
        "success": True,
        "data": {
            "status": "created",
            "lessonId": str(lesson.id),
            "orderIndex": lesson.order_index,
            "video": video,
            "subtitle": _subtitle_payload(lesson),
        },
    }


@router.get("/courses/{course_id}/lessons")
async def list_youtube_lessons(
    course_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Danh sách bài học YouTube của khóa, kèm trạng thái phụ đề để quản lý."""
    course = await db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại.")
    if not _is_admin(current_user) and course.instructor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xem học liệu của khóa học này.",
        )

    result = await db.execute(
        select(Lesson)
        .where(Lesson.course_id == course_id, Lesson.youtube_video_id.isnot(None))
        .order_by(Lesson.order_index.asc(), Lesson.id.asc())
    )
    lessons = result.scalars().all()
    return {
        "success": True,
        "data": {
            "courseId": str(course.id),
            "courseTitle": course.title,
            "lessons": [_lesson_payload(lesson) for lesson in lessons],
        },
    }


@router.post("/lessons/{lesson_id}/subtitle/upload")
async def upload_subtitle(
    lesson_id: int,
    file: UploadFile = File(...),
    language: str = Form("vi"),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tải SRT/VTT thủ công, lưu transcript và nhúng vào pgvector."""
    lesson, course = await _load_lesson_for_manage(db, lesson_id, current_user)

    filename = (file.filename or "").lower()
    if not filename.endswith((".srt", ".vtt")):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp .srt hoặc .vtt.")
    language = (language or "vi").strip().lower()
    if not _LANGUAGE_RE.match(language):
        raise HTTPException(status_code=400, detail="Mã ngôn ngữ không hợp lệ (ví dụ: vi, en).")

    content_bytes = await file.read(MAX_SRT_BYTES + 1)
    if len(content_bytes) > MAX_SRT_BYTES:
        raise HTTPException(status_code=413, detail="Tệp phụ đề vượt quá 2 MB.")
    if not content_bytes:
        raise HTTPException(status_code=400, detail="Tệp phụ đề rỗng.")
    try:
        content = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="Tệp phụ đề phải được mã hóa UTF-8. Hãy lưu lại với UTF-8 rồi thử lại.",
        ) from exc

    # Kiểm tra cú pháp trước khi ghi DB để trả lỗi rõ ràng.
    try:
        parse_srt(content)
    except SubtitleParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        data = await transcript_service.ingest_subtitle(
            db,
            lesson=lesson,
            course=course,
            current_user=current_user,
            srt_content=content,
            language=language,
            document_name=f"youtube-{lesson.youtube_video_id or lesson.id}.{language}.srt",
        )
    except TranscriptIngestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.refresh(lesson)
    return {
        "success": True,
        "data": {
            **data,
            "subtitle": _subtitle_payload(lesson),
        },
    }


@router.post("/lessons/{lesson_id}/subtitle/fetch")
async def fetch_subtitle(
    lesson_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tải phụ đề công khai bằng yt-dlp. Lỗi không xóa Lesson đã tạo."""
    lesson, course = await _load_lesson_for_manage(db, lesson_id, current_user)
    if not lesson.youtube_video_id:
        raise HTTPException(status_code=400, detail="Bài học không phải nguồn YouTube.")

    try:
        downloaded = await subtitle_service.download_public_subtitles(lesson.youtube_video_id)
    except subtitle_service.SubtitleFetchError as exc:
        lesson.subtitle_status = "missing" if exc.code == "no_subtitles" else "failed"
        lesson.subtitle_error = exc.message[:1000]
        await db.commit()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    try:
        parse_srt(downloaded["content"])
    except SubtitleParseError as exc:
        lesson.subtitle_status = "failed"
        lesson.subtitle_error = str(exc)[:1000]
        await db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        data = await transcript_service.ingest_subtitle(
            db,
            lesson=lesson,
            course=course,
            current_user=current_user,
            srt_content=downloaded["content"],
            language=downloaded["language"],
        )
    except TranscriptIngestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.refresh(lesson)
    return {
        "success": True,
        "data": {
            **data,
            "subtitle": _subtitle_payload(lesson),
        },
    }


@router.post("/lessons/{lesson_id}/subtitle/reingest")
async def reingest_subtitle(
    lesson_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Nhúng lại phụ đề đã lưu (sau khi AI Service gặp sự cố)."""
    lesson, course = await _load_lesson_for_manage(db, lesson_id, current_user)
    try:
        data = await transcript_service.reingest_saved_subtitle(
            db, lesson=lesson, course=course, current_user=current_user
        )
    except TranscriptIngestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    await db.refresh(lesson)
    return {"success": True, "data": {**data, "subtitle": _subtitle_payload(lesson)}}
