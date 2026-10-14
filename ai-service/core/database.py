"""
Smart LMS - AI Service Database Connection
Kết nối PostgreSQL với pgvector extension sử dụng SQLAlchemy async.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import structlog

from core.config import settings

logger = structlog.get_logger(__name__)

# ===== Engine =====
# Pool settings tối ưu cho AI service (ít connections hơn backend)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,          # Log SQL queries khi debug
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,           # Kiểm tra kết nối trước khi dùng
    pool_recycle=3600,            # Tái sử dụng connection sau 1 giờ
)

# ===== Session Factory =====
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,       # Giữ objects sau khi commit (quan trọng cho async)
    autocommit=False,
    autoflush=False,
)


# ===== Base Model =====
class Base(DeclarativeBase):
    """Base class cho tất cả SQLAlchemy models."""
    pass


# ===== Lifecycle Functions =====
async def init_db() -> None:
    """
    Khởi tạo database: kiểm tra kết nối và enable pgvector extension.
    Gọi khi startup application.
    """
    import asyncio
    # Import DocumentChunk để đăng ký bảng vào Base.metadata
    import vector_store.pgvector_store  # noqa: F401

    for attempt in range(1, 4):
        try:
            async with engine.begin() as conn:
                # Kích hoạt pgvector extension (cần thiết cho vector search)
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    logger.info("pgvector extension enabled")
                except Exception as ext_err:
                    logger.warning(f"pgvector extension check note: {ext_err}")

                # Tạo tất cả bảng nếu chưa có
                await conn.run_sync(Base.metadata.create_all)
                logger.info("Database tables initialized")
            break
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt}/3 failed: {e}")
            if attempt == 3:
                logger.error("Could not connect to database on startup. Service will continue running in degraded mode.")
            else:
                await asyncio.sleep(2)


async def close_db() -> None:
    """
    Đóng connection pool khi shutdown.
    """
    await engine.dispose()
    logger.info("Database connections closed successfully")


# ===== Dependency Injection =====
async def get_db() -> AsyncSession:
    """
    FastAPI dependency: cung cấp database session cho mỗi request.
    Session tự động đóng sau khi request kết thúc.

    Cách dùng:
        @router.post("/endpoint")
        async def my_endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
