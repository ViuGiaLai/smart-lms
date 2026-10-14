from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── TTL mac dinh (giay) ──────
COURSES_CACHE_TTL = 60
PUBLIC_STATS_CACHE_TTL = 120

# Sau bao nhieu loi ket noi lien tiep thi tam tat cache cho tien trinh hien tai.
_FAILURE_LIMIT = 3

_client: Optional[aioredis.Redis] = None
_redis_disabled = False
_failures = 0


def _note_failure(exc: Exception) -> None:
    """Tang bo dem loi; tu tat cache neu Redis lien tuc khong phan hoi.

    Tranh truong hop Redis chet lam moi request phai cho het timeout.
    """
    global _failures, _redis_disabled
    _failures += 1
    if _failures >= _FAILURE_LIMIT and not _redis_disabled:
        _redis_disabled = True
        logger.warning("Redis lien tuc loi, tam tat cache: %s", exc)


def _note_success() -> None:
    global _failures
    _failures = 0


def get_redis() -> Optional[aioredis.Redis]:
    """Tra ve Redis client dung chung, hoac None neu Redis khong kha dung.

    Cache la lop toi uu (best-effort): moi loi ket noi deu duoc xu ly an toan de
    API van hoat dong binh thuong dua tren truy van PostgreSQL.
    """
    global _client, _redis_disabled

    if _redis_disabled or not settings.REDIS_URL:
        return None

    if _client is None:
        try:
            _client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
        except Exception as exc:  # pragma: no cover - phu thuoc moi truong
            logger.warning("Khong the khoi tao Redis client, tat cache: %s", exc)
            _redis_disabled = True
            return None
    return _client


async def cache_get_json(key: str) -> Any | None:
    """Doc gia tri JSON tu cache. Tra ve None neu khong co/loi."""
    client = get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        _note_success()
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.warning("Redis cache_get that bai (%s): %s", key, exc)
        _note_failure(exc)
        return None


async def cache_set_json(key: str, value: Any, ttl: int = 60) -> None:
    """Ghi gia tri JSON vao cache voi TTL (giay). Loi se bi nuot bo."""
    client = get_redis()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, ensure_ascii=False, default=str), ex=ttl)
        _note_success()
    except Exception as exc:
        logger.warning("Redis cache_set that bai (%s): %s", key, exc)
        _note_failure(exc)


async def cache_delete(key: str) -> None:
    client = get_redis()
    if client is None:
        return
    try:
        await client.delete(key)
        _note_success()
    except Exception as exc:
        logger.warning("Redis cache_delete that bai (%s): %s", key, exc)
        _note_failure(exc)


async def cache_delete_prefix(prefix: str) -> None:
    """Xoa tat ca key bat dau bang *prefix* bang SCAN (khong dung KEYS)."""
    client = get_redis()
    if client is None:
        return
    try:
        async for key in client.scan_iter(match=f"{prefix}*", count=100):
            await client.delete(key)
        _note_success()
    except Exception as exc:
        logger.warning("Redis cache_delete_prefix that bai (%s): %s", prefix, exc)
        _note_failure(exc)


async def invalidate_course_caches() -> None:
    """Xoa cache lien quan den danh sach khoa hoc & thong ke cong khai.

    Goi sau moi thao tac ghi (tao/sua/xoa/xuat ban khoa hoc, them/sua/xoa bai hoc)
    de tranh tra ve du lieu cu.
    """
    await cache_delete_prefix("courses:list:")
    await cache_delete("public:stats")
