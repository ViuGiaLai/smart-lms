from __future__ import annotations

import asyncio
import re
import uuid
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.lesson_material import LessonMaterial
from app.models.user import User
from app.services.enrollment_service import require_course_access
from app.services.object_storage import delete_object, presign_download, store_object

router = APIRouter(prefix="/courses/{course_id}/lessons/{lesson_id}/documents", tags=["Documents"])

DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".pptx"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
MAX_VIDEO_BYTES = 500 * 1024 * 1024


def _safe_filename(filename: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(filename).stem).strip(".-") or "hoc-lieu"
    return f"{stem}{Path(filename).suffix.lower()}"


async def _get_owned_lesson(
    course_id: int, lesson_id: int, current_user: User, db: AsyncSession
) -> Lesson:
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý học liệu khóa học này")

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
    return urlparse(file_url).path.removeprefix("/media/")


async def _set_material_state(material_id: int, status_value: str, error_message: str | None = None, file_url: str | None = None) -> None:
    async with AsyncSessionLocal() as task_db:
        material = await task_db.get(LessonMaterial, material_id)
        if material is None:
            return
        material.status = status_value
        material.error_message = error_message
        if file_url is not None:
            material.file_url = file_url
        await task_db.commit()


async def _process_document_in_background(
    material_id: int, object_key: str, content: bytes, content_type: str | None,
    lesson_id: int, filename: str, user_id: int, role: str,
) -> None:
    try:
        await _set_material_state(material_id, "processing")
        file_url = await store_object(object_key, content, content_type)
        ai_url = f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/upload"
        headers = {**settings.ai_service_headers, "X-User-Id": str(user_id), "X-User-Role": role}
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            response = await client.post(
                ai_url,
                data={"lesson_id": str(lesson_id), "document_id": f"material:{material_id}"},
                files={"file": (filename, content, content_type or "application/octet-stream")},
                headers=headers,
            )
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", "AI Service không thể xử lý tài liệu")
            except ValueError:
                detail = "AI Service không thể xử lý tài liệu"
            await delete_object(object_key)
            await _set_material_state(material_id, "failed", str(detail))
            return
        await _set_material_state(material_id, "ready", file_url=file_url)
    except Exception as exc:
        await _set_material_state(material_id, "failed", str(exc)[:1000])


async def _process_video_in_background(material_id: int, object_key: str, content: bytes, content_type: str | None, lesson_id: int) -> None:
    try:
        await _set_material_state(material_id, "processing")
        file_url = await store_object(object_key, content, content_type)
        async with AsyncSessionLocal() as task_db:
            material = await task_db.get(LessonMaterial, material_id)
            lesson = await task_db.get(Lesson, lesson_id)
            if material is None or lesson is None:
                return
            material.file_url = file_url
            material.status = "ready"
            lesson.video_url = file_url
            lesson.source_type = "upload"
            lesson.youtube_video_id = None
            lesson.subtitle_status = "none"
            lesson.subtitle_language = None
            lesson.subtitle_srt = None
            lesson.subtitle_checksum = None
            lesson.subtitle_error = None
            await task_db.commit()
    except Exception as exc:
        await _set_material_state(material_id, "failed", str(exc)[:1000])


@router.post("/upload")
async def upload_lesson_document(
    background_tasks: BackgroundTasks,
    course_id: int,
    lesson_id: int,
    file: UploadFile = File(...),
    run_in_background: bool = Form(False),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_owned_lesson(course_id, lesson_id, current_user, db)
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Tệp tải lên rỗng")
    filename = file.filename or "tai-lieu"
    if Path(filename).suffix.lower() not in DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ PDF, DOCX hoặc PPTX")

    # Tạo mã tài liệu ổn định trước khi nhúng để có thể xóa đúng các vector
    # của một tệp, không ảnh hưởng tới các tài liệu khác trong cùng bài học.
    material = LessonMaterial(
        lesson_id=lesson_id,
        kind="document",
        title=filename,
        file_url="",
        mime_type=file.content_type,
        size_bytes=len(content),
    )
    db.add(material)
    await db.flush()

    object_key = _object_key(course, lesson, "documents", filename)
    material.storage_key = object_key

    if run_in_background:
        material.status = "queued"
        await db.commit()
        await db.refresh(material)
        background_tasks.add_task(
            _process_document_in_background, material.id, object_key, content, file.content_type,
            lesson_id, filename, current_user.id, role,
        )
        return {"message": "Tài liệu đã vào hàng đợi xử lý AI", "queued": True, "material": _material_dict(material)}

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
                files={"file": (filename, content, file.content_type or "application/octet-stream")},
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

    material.file_url = await store_object(object_key, content, file.content_type)
    material.storage_key = object_key
    await db.commit()
    await db.refresh(material)
    return {**response.json(), "material": _material_dict(material)}


@router.post("/video", status_code=status.HTTP_201_CREATED)
async def upload_lesson_video(
    background_tasks: BackgroundTasks,
    course_id: int,
    lesson_id: int,
    file: UploadFile = File(...),
    run_in_background: bool = Form(False),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_owned_lesson(course_id, lesson_id, current_user, db)
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one()
    filename = file.filename or "video.mp4"
    if Path(filename).suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ video MP4, WEBM hoặc MOV")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Tệp video rỗng")
    if len(content) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Video vượt quá 500 MB")

    object_key = _object_key(course, lesson, "videos", filename)
    material = LessonMaterial(
        lesson_id=lesson_id,
        kind="video",
        title=filename,
        file_url=await store_object(object_key, content, file.content_type),
        storage_key=object_key,
        mime_type=file.content_type or "video/mp4",
        size_bytes=len(content),
    )
    if run_in_background:
        material.file_url = ""
        material.status = "queued"
        db.add(material)
        await db.commit()
        await db.refresh(material)
        background_tasks.add_task(_process_video_in_background, material.id, object_key, content, file.content_type, lesson_id)
        return {"message": "Video đã vào hàng đợi tải Cloud", "queued": True, "material": _material_dict(material)}
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
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return {"message": "Đã tải video cho bài học", "video_url": lesson.video_url, "material": _material_dict(material)}


def _material_dict(material: LessonMaterial) -> dict:
    return {
        "id": material.id,
        "kind": material.kind,
        "title": material.title,
        "file_url": material.file_url,
        "storage_key": material.storage_key,
        "mime_type": material.mime_type,
        "size_bytes": material.size_bytes,
        "status": material.status,
        "error_message": material.error_message,
        "created_at": material.created_at.isoformat() if material.created_at else None,
    }


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
    items = [_material_dict(item) for item in records]

    # Trả URL tải có chữ ký, hết hạn sau một giờ. URL công khai vẫn được giữ
    # trong DB để nếu R2 tạm lỗi giao diện vẫn mở được tệp.
    async def _signed(record: LessonMaterial, item: dict) -> None:
        if record.storage_key:
            signed = await presign_download(record.storage_key)
            if signed:
                item["file_url"] = signed
                item["expires_in"] = settings.R2_SIGNED_URL_EXPIRE_SECONDS

    await asyncio.gather(*[_signed(record, item) for record, item in zip(records, items)])

    # Khóa lưu trữ chỉ dành cho vận hành, không cần thiết với giao diện.
    for item in items:
        item.pop("storage_key", None)
    return items


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson_material(
    course_id: int, lesson_id: int, material_id: int, current_user: User = Depends(require_instructor), db: AsyncSession = Depends(get_db)
):
    await _get_owned_lesson(course_id, lesson_id, current_user, db)
    result = await db.execute(select(LessonMaterial).where(LessonMaterial.id == material_id, LessonMaterial.lesson_id == lesson_id))
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
    await delete_object(material.storage_key or _object_key_from_url(material.file_url))
    await db.delete(material)
    await db.commit()
    return None
