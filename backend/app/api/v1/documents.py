from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.user import User

router = APIRouter(prefix="/courses/{course_id}/lessons/{lesson_id}/documents", tags=["Documents"])


@router.post("/upload")
async def upload_lesson_document(
    course_id: int,
    lesson_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
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
    if lesson_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại trong khóa học")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Tệp tải lên rỗng")

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
                data={"lesson_id": str(lesson_id)},
                files={"file": (file.filename or "document", content, file.content_type or "application/octet-stream")},
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

    return response.json()
