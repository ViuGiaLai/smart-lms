"""Process queued lesson documents in a separate process."""
from __future__ import annotations

import asyncio
import logging
from tempfile import TemporaryFile

import httpx
from sqlalchemy import select

import app.models
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.lesson_material import LessonMaterial
from app.services.object_storage import read_stored_object

logger = logging.getLogger(__name__)


async def process_next(client: httpx.AsyncClient) -> bool:
    async with AsyncSessionLocal.begin() as db:
        row = (await db.execute(
            select(LessonMaterial, Course.instructor_id)
            .join(Lesson, Lesson.id == LessonMaterial.lesson_id)
            .join(Course, Course.id == Lesson.course_id)
            .where(
                LessonMaterial.status == "queued",
                LessonMaterial.kind == "document",
                LessonMaterial.storage_key.isnot(None),
                LessonMaterial.file_url != "",
            )
            .order_by(LessonMaterial.created_at, LessonMaterial.id)
            .limit(1)
            .with_for_update(of=LessonMaterial, skip_locked=True)
        )).first()
        if row is None:
            return False

        # Keep the claim until commit. A stopped worker releases the lock,
        # leaving the queued row available for the next worker.
        material, owner_id = row
        try:
            with TemporaryFile() as source:
                await read_stored_object(material.storage_key, material.file_url.startswith("r2://"), source)
                source.seek(0)
                response = await client.post(
                    f"{settings.AI_SERVICE_URL.rstrip('/')}/api/v1/documents/upload",
                    headers={**settings.ai_service_headers, "X-User-Id": str(owner_id), "X-User-Role": "instructor"},
                    data={"lesson_id": str(material.lesson_id), "document_id": f"material:{material.id}"},
                    files={"file": (material.title, source, material.mime_type or "application/octet-stream")},
                )
            response.raise_for_status()
        except Exception:
            logger.exception("Document processing failed for material %s", material.id)
            material.status = "failed"
            material.error_message = "Không thể xử lý tài liệu. Kiểm tra định dạng tệp hoặc thử lại."
        else:
            material.status = "ready"
            material.error_message = None
        return True


async def main() -> None:
    try:
        async with httpx.AsyncClient(timeout=settings.AI_SERVICE_TIMEOUT) as client:
            while True:
                try:
                    if await process_next(client):
                        continue
                except Exception:
                    logger.exception("Could not claim a queued document")
                await asyncio.sleep(3)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
