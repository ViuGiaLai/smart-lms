"""
Smart LMS - AI Service Entry Point
FastAPI application chạy tại port 8001
Cung cấp các API cho: RAG Chatbot, Quiz Generation, Essay Grading, Summarization
"""

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from core.database import init_db, close_db
from routers import rag, quiz, grader, summarizer, documents
import structlog

# Cấu hình logger
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events: khởi động và dọn dẹp tài nguyên."""
    # Startup
    logger.info("Starting Smart LMS AI Service...", version=settings.APP_VERSION)
    await init_db()
    logger.info("Database connected successfully")
    yield
    # Shutdown
    logger.info("Shutting down AI Service...")
    await close_db()


# Khởi tạo FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI Service cho Smart LMS: RAG Chatbot, Quiz Generator, Essay Grader, Summarizer",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== Routers =====
app.include_router(rag.router, prefix="/api/v1/rag", tags=["RAG Chatbot"])
app.include_router(quiz.router, prefix="/api/v1/quiz", tags=["Quiz Generator"])
app.include_router(grader.router, prefix="/api/v1/grader", tags=["Essay Grader"])
app.include_router(summarizer.router, prefix="/api/v1/summarizer", tags=["Summarizer"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])


# ===== Health Check =====
@app.get("/health", tags=["Health"])
async def health_check():
    """Kiểm tra trạng thái hoạt động của service."""
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "ai_provider": settings.AI_PROVIDER,
            # Metadata only; credentials and request telemetry are never exposed.
            "llm_model": settings.GEMINI_MODEL if settings.AI_PROVIDER == "gemini" else None,
        }
    )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {
        "message": "Smart LMS AI Service is running",
        "docs": "/docs",
        "health": "/health",
    }


# ===== Exception Handlers =====
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("Unhandled exception", error_type=type(exc).__name__, path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
