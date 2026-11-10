from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
import app.models  # ensure models are registered in Base.metadata
from app.api.v1 import (
    auth,
    courses,
    lessons,
    quiz as quiz_router,
    progress as progress_router,
    ai_tutor,
    ai_quiz_gen,
    student,
    instructor,
    admin,
    public,
    documents,
    uploads,
    youtube,
    categories,
    ai_discovery,
    grading,
    reviews,
    events,
    analytics,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Khởi tạo cấu trúc bảng nếu chưa tồn tại (Bảo mật: Không tự ý seed dữ liệu khi khởi động)."""
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)
        # Tác vụ nền xử lý học liệu chỉ sống trong tiến trình backend. Nếu tiến
        # trình bị dừng giữa chừng, bản ghi sẽ kẹt ở queued/processing mãi và
        # giao diện quay vòng vô hạn. Chuyển sang failed sau ngưỡng cấu hình để
        # giảng viên biết cần tải lại, không âm thầm treo.
        try:
            result = await conn.execute(
                text(
                    """
                    UPDATE lesson_materials
                    SET status = 'failed',
                        error_message = 'Tác vụ xử lý bị gián đoạn khi máy chủ khởi động lại. Vui lòng tải lại tệp.'
                    WHERE status IN ('queued', 'processing')
                      AND created_at < now() - make_interval(mins => :mins)
                    """
                ),
                {"mins": settings.MATERIAL_STUCK_MINUTES},
            )
            if result.rowcount:
                logging.getLogger(__name__).warning(
                    "Đã chuyển %s học liệu kẹt sang failed", result.rowcount
                )
        except Exception as exc:  # pragma: no cover - không chặn khởi động
            logging.getLogger(__name__).warning("Không thể phục hồi học liệu kẹt: %s", exc)

    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url=f"{settings.API_V1_PREFIX}/docs",
    redoc_url=f"{settings.API_V1_PREFIX}/redoc",
    lifespan=lifespan,
)

# Tệp video/tài liệu giảng viên tải lên trong môi trường cục bộ. Production có
# thể thay mount này bằng S3/CDN nhưng URL học liệu vẫn giữ cùng định dạng.
media_root = Path(settings.MEDIA_ROOT).resolve()
media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(media_root)), name="media")

# ── CORS ───────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    # Dev: chấp nhận mọi cổng loopback (Next.js có thể chạy ở cổng khác 3000).
    # Production: None, chỉ dùng danh sách ALLOWED_ORIGINS ở trên.
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Security headers ─────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Gan cac header bao mat co ban cho moi phan hoi cua API."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return response

# ── Đăng ký Routers Chuẩn mực (/api/v1) ─────
prefix = settings.API_V1_PREFIX

app.include_router(auth.router,            prefix=prefix, tags=["Auth"])
app.include_router(public.router,          prefix=prefix, tags=["Public"])
app.include_router(courses.router,         prefix=prefix, tags=["Courses"])
app.include_router(lessons.router,         prefix=prefix, tags=["Lessons"])
app.include_router(quiz_router.router,            prefix=prefix, tags=["Quiz"])
app.include_router(quiz_router.standalone_router, prefix=prefix, tags=["Quizzes"])
app.include_router(progress_router.router, prefix=prefix, tags=["Progress"])
app.include_router(ai_tutor.router,        prefix=prefix, tags=["AI Tutor"])
app.include_router(ai_quiz_gen.router,     prefix=prefix, tags=["AI Quiz Gen"])
app.include_router(student.router,         prefix=prefix, tags=["Student"])
app.include_router(instructor.router,      prefix=prefix, tags=["Instructor"])
app.include_router(admin.router,           prefix=prefix, tags=["Admin"])
app.include_router(documents.router,       prefix=prefix)
app.include_router(uploads.router,         prefix=prefix, tags=["Uploads"])
app.include_router(youtube.router,          prefix=prefix, tags=["YouTube Import"])
app.include_router(categories.router,       prefix=prefix, tags=["Categories & Levels"])
app.include_router(ai_discovery.router,     prefix=prefix, tags=["AI Discovery"])
app.include_router(grading.router,          prefix=prefix, tags=["AI Essay Grading"])
app.include_router(reviews.router,          prefix=prefix, tags=["Course Reviews"])
app.include_router(events.router,           prefix=prefix, tags=["Learning Events"])
app.include_router(events.feedback_router,  prefix=prefix)
app.include_router(analytics.router,        prefix=prefix, tags=["Analytics"])


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url=f"{settings.API_V1_PREFIX}/docs")


@app.get("/docs", include_in_schema=False)
async def redirect_docs():
    return RedirectResponse(url=f"{settings.API_V1_PREFIX}/docs")


@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_PREFIX}/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "version": settings.APP_VERSION}
