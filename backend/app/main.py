from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, Base
import app.models  # ensure models are registered in Base.metadata
from app.api.v1 import auth, courses, lessons, quiz as quiz_router, progress as progress_router, ai_tutor, ai_quiz_gen, student, instructor, admin, public, documents


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Khởi tạo cấu trúc bảng nếu chưa tồn tại (Bảo mật: Không tự ý seed dữ liệu khi khởi động)."""
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)

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

# ── CORS ───────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
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
