from __future__ import annotations

import asyncio
import re
import uuid
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.lesson_material import LessonMaterial
from app.models.user import User
from app.services.enrollment_service import require_course_access
from app.services.audit_service import record_change
from app.services.object_storage import delete_object, r2_enabled, resolve_media_url, store_object, store_stream

router = APIRouter(prefix="/courses/{course_id}/lessons/{lesson_id}/documents", tags=["Documents"])

DOCUMENT_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
MAX_VIDEO_BYTES = 500 * 1024 * 1024
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
VIDEO_CONTENT_TYPES = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}


def _require_storage() -> None:
    if settings.ENVIRONMENT.strip().lower() in {"production", "prod"} and not r2_enabled():
        raise HTTPException(status_code=503, detail="Kho học liệu chưa sẵn sàng.")


def _safe_filename(filename: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(filename).stem).strip(".-") or "hoc-lieu"
    return f"{stem}{Path(filename).suffix.lower()}"


async def _get_owned_lesson(
    course_id: int, lesson_id: int, current_user: User, db: AsyncSession
) -> Lesson:
    course_result = await db.execute(select(Course).where(Course.id == course_id).with_for_update())
    course = course_result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý học liệu khóa học này")
    if course.status == CourseStatus.in_review:
        raise HTTPException(status_code=409, detail="Khóa học đang được duyệt. Hãy rút yêu cầu trước khi sửa học liệu.")

    lesson_result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
    )
    lesson = lesson_result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại trong khóa học")
    return lesson


def _short_slug(value: str, word_limit: int = 7) -> str:
    normalized = value.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFKD", normalized).encode("ascii", "ignore").decode("ascii").lower()
    words = re.findall(r"[a-z0-9]+", normalized)[:word_limit]
    return "-".join(words) or "bai-hoc"


def _object_key(course: Course, lesson: Lesson, kind: str, filename: str) -> str:
    # Folder hiển thị theo tên cha/con, không dùng ID kỹ thuật khó nhận biết.
    relative_dir = Path("courses") / _short_slug(course.title) / _short_slug(lesson.title) / kind
    stored_name = f"{uuid.uuid4().hex}-{_safe_filename(filename)}"
    return f"{relative_dir.as_posix()}/{stored_name}"


def _object_key_from_url(file_url: str) -> str:
    public_base = settings.R2_PUBLIC_BASE_URL.rstrip("/")
    if public_base and file_url.startswith(f"{public_base}/"):
        return file_url[len(public_base) + 1:]
    local_base = f"{settings.API_PUBLIC_URL.rstrip('/')}/media/"
    if file_url.startswith(local_base):
        return urlparse(file_url).path.removeprefix("/media/")
    return ""


@router.post("/upload")
async def upload_lesson_document(
    course_id: int,
    lesson_id: int,
    file: UploadFile = File(...),
    run_in_background: bool = Form(False),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_owned_lesson(course_id, lesson_id, current_user, db)
    _require_storage()
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Tài liệu vượt quá 50 MB")
    if not content:
        raise HTTPException(status_code=400, detail="Tệp tải lên rỗng")
    filename = file.filename or "tai-lieu"
    extension = Path(filename).suffix.lower()
    if extension not in DOCUMENT_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ PDF, DOCX hoặc PPTX")
    if not content.startswith(b"%PDF-" if extension == ".pdf" else b"PK\x03\x04"):
        raise HTTPException(status_code=415, detail="Nội dung tệp không khớp định dạng tài liệu.")
    content_type = DOCUMENT_CONTENT_TYPES[extension]

    # Tạo mã tài liệu ổn định trước khi nhúng để có thể xóa đúng các vector
    # của một tệp, không ảnh hưởng tới các tài liệu khác trong cùng bài học.
    material = LessonMaterial(
        lesson_id=lesson_id,
        kind="document",
        title=filename,
        file_url="",
        mime_type=content_type,
        size_bytes=len(content),
    )
    db.add(material)
    await db.flush()

    object_key = _object_key(course, lesson, "documents", filename)
    material.storage_key = object_key

    if run_in_background:
        material.file_url = await store_object(object_key, content, content_type)
        material.status = "queued"
        await db.commit()
        await db.refresh(material)
        return {"message": "Tài liệu đã vào hàng đợi xử lý AI", "queued": True, "material": await _downloadable_material(material)}

    ai_url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/upload"
    headers = {
        **settings.ai_service_headers,
        "X-User-Id": str(current_user.id),
        "X-User-Role": role,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            response = await client.post(
                ai_url,
                data={"lesson_id": str(lesson_id), "document_id": f"material:{material.id}"},
                files={"file": (filename, content, content_type)},
                headers=headers,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Không thể kết nối tới AI Service") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", "AI Service không thể xử lý tài liệu")
        except ValueError:
            detail = "AI Service không thể xử lý tài liệu"
        raise HTTPException(status_code=response.status_code, detail=detail)

    material.file_url = await store_object(object_key, content, content_type)
    material.storage_key = object_key
    await db.commit()
    await db.refresh(material)
    return {**response.json(), "material": await _downloadable_material(material)}


@router.post("/video", status_code=status.HTTP_201_CREATED)
async def upload_lesson_video(
    course_id: int,
    lesson_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_owned_lesson(course_id, lesson_id, current_user, db)
    _require_storage()
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    filename = file.filename or "video.mp4"
    extension = Path(filename).suffix.lower()
    if extension not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ video MP4, WEBM hoặc MOV")
    size = file.size or 0
    if not size:
        raise HTTPException(status_code=400, detail="Tệp video rỗng")
    if size > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Video vượt quá 500 MB")
    header = await file.read(12)
    valid_header = header[:4] == b"\x1a\x45\xdf\xa3" if extension == ".webm" else header[4:8] in {b"ftyp", b"moov", b"mdat", b"wide"}
    if not valid_header:
        raise HTTPException(status_code=415, detail="Nội dung tệp không khớp định dạng video.")
    await file.seek(0)

    object_key = _object_key(course, lesson, "videos", filename)
    material = LessonMaterial(
        lesson_id=lesson_id,
        kind="video",
        title=filename,
        file_url="",
        storage_key=object_key,
        mime_type=VIDEO_CONTENT_TYPES[extension],
        size_bytes=size,
    )
    material.file_url = await store_stream(object_key, file.file, material.mime_type)
    # Video tải lên là video chính của bài học. Không có transcript YouTube để
    # giữ lại khi nguồn đã đổi sang video cục bộ.
    lesson.video_url = material.file_url
    lesson.source_type = "upload"
    lesson.youtube_video_id = None
    lesson.subtitle_status = "none"
    lesson.subtitle_language = None
    lesson.subtitle_srt = None
    lesson.subtitle_checksum = None
    lesson.subtitle_error = None
    lesson.transcript = None
    db.add(material)
    await db.commit()
    await db.refresh(material)
    item = await _downloadable_material(material)
    return {"message": "Đã tải video cho bài học", "video_url": item["file_url"], "material": item}


def _material_dict(material: LessonMaterial) -> dict:
    return {
        "id": material.id,
        "kind": material.kind,
        "title": material.title,
        "file_url": material.file_url,
        "mime_type": material.mime_type,
        "size_bytes": material.size_bytes,
        "status": material.status,
        "error_message": material.error_message,
        "created_at": material.created_at.isoformat() if material.created_at else None,
    }


async def _downloadable_material(material: LessonMaterial) -> dict:
    item = _material_dict(material)
    item["file_url"] = (
        await resolve_media_url(material.file_url) or "" if material.status == "ready" else ""
    )
    item["can_retry"] = bool(
        material.status == "failed" and material.kind == "document" and material.storage_key and material.file_url
    )
    return item


@router.get("")
async def list_lesson_materials(
    course_id: int,
    lesson_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Học liệu của một bài học.

    - Giảng viên chủ khóa/admin: thấy toàn bộ bản ghi (kể cả đang xử lý/lỗi).
    - Học viên đã ghi danh: chỉ thấy học liệu đã sẵn sàng (status = ready).
    """
    await require_course_access(db, current_user, course_id)

    lesson = (
        await db.execute(
            select(Lesson.id).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
        )
    ).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại trong khóa học")

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    query = select(LessonMaterial).where(LessonMaterial.lesson_id == lesson_id)
    if role == "student":
        query = query.where(LessonMaterial.status == "ready")
    result = await db.execute(query.order_by(LessonMaterial.created_at))
    records = result.scalars().all()
    return await asyncio.gather(*(_downloadable_material(item) for item in records))


@router.post("/{material_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_lesson_document(
    course_id: int, lesson_id: int, material_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_lesson(course_id, lesson_id, current_user, db)
    material = (await db.execute(
        select(LessonMaterial)
        .where(LessonMaterial.id == material_id, LessonMaterial.lesson_id == lesson_id)
        .with_for_update()
    )).scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy học liệu")
    if material.kind != "document" or not material.storage_key or not material.file_url or material.status != "failed":
        raise HTTPException(status_code=409, detail="Học liệu này không thể đưa lại vào hàng đợi.")
    material.status = "queued"
    material.error_message = None
    return await _downloadable_material(material)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson_material(
    course_id: int, lesson_id: int, material_id: int, current_user: User = Depends(require_instructor), db: AsyncSession = Depends(get_db)
):
    lesson = await _get_owned_lesson(course_id, lesson_id, current_user, db)
    result = await db.execute(select(LessonMaterial).where(LessonMaterial.id == material_id, LessonMaterial.lesson_id == lesson_id).with_for_update())
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy học liệu")
    if material.kind == "document":
        ai_url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/document/material:{material.id}"
        headers = {
            **settings.ai_service_headers,
            "X-User-Id": str(current_user.id),
            "X-User-Role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        }
        try:
            async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
                response = await client.delete(ai_url, params={"lesson_id": lesson_id}, headers=headers)
            if response.status_code >= 400:
                raise HTTPException(status_code=502, detail="Không thể xóa tri thức AI của tài liệu")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503, detail="Không thể kết nối tới AI Service") from exc
    object_key = material.storage_key or _object_key_from_url(material.file_url)
    if object_key and material.file_url:
        public_base = settings.R2_PUBLIC_BASE_URL.rstrip("/")
        is_remote = material.file_url.startswith("r2://") or bool(
            public_base and material.file_url.startswith(f"{public_base}/")
        )
        await delete_object(object_key, is_remote=is_remote)
    if material.kind == "video" and lesson.video_url == material.file_url and lesson.source_type == "upload":
        lesson.video_url = None
        lesson.source_type = "manual"
    record_change(db, current_user.id, "material.delete", "material", material.id, lessonId=lesson_id, kind=material.kind)
    await db.delete(material)
    await db.commit()
    return None
