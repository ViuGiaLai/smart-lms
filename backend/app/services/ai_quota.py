from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_usage import AiUsageLog

# Tên tính năng phải khớp với giá trị AI Service ghi vào ai_usage_logs.
FEATURE_LIMITS: dict[str, int] = {
    "tutor": settings.AI_TUTOR_DAILY_LIMIT,
    "quiz": settings.AI_QUIZ_DAILY_LIMIT,
    "grader": settings.AI_GRADING_DAILY_LIMIT,
    "summarizer": getattr(settings, "AI_SUMMARIZER_DAILY_LIMIT", 50),
}

FEATURE_LABELS: dict[str, str] = {
    "tutor": "Trợ lý AI",
    "quiz": "sinh đề bằng AI",
    "grader": "chấm bài bằng AI",
    "summarizer": "tóm tắt bài giảng bằng AI",
}


def _utc_day_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _tomorrow_utc() -> datetime:
    return _utc_day_start() + timedelta(days=1)


async def usage_today(db: AsyncSession, user_id: int, feature: str) -> int:
    """Số lượt gọi AI đã ghi nhận của người dùng trong ngày UTC hiện tại."""
    total = await db.scalar(
        select(func.count(AiUsageLog.id)).where(
            AiUsageLog.user_id == user_id,
            AiUsageLog.feature == feature,
            AiUsageLog.created_at >= _utc_day_start(),
        )
    )
    return int(total or 0)


async def enforce_ai_quota(
    db: AsyncSession, user_id: int, feature: str
) -> None:
    """Chặn gọi AI khi người dùng đã vượt hạn mức trong ngày.

    Hạn mức đọc từ cấu hình, đặt 0 để tắt. Trả 429 kèm thời điểm thử lại để
    giao diện hiển thị thông báo rõ ràng thay vì treo ở trạng thái tải.
    """
    limit = FEATURE_LIMITS.get(feature, 0)
    if limit <= 0:
        return

    used = await usage_today(db, user_id, feature)
    if used < limit:
        return

    retry_at = _tomorrow_utc()
    retry_seconds = max(1, int((retry_at - datetime.now(timezone.utc)).total_seconds()))
    label = FEATURE_LABELS.get(feature, "tính năng AI")
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            f"Bạn đã dùng hết {limit} lượt {label} hôm nay. "
            "Hạn mức được đặt lại vào 00:00 UTC (07:00 giờ Việt Nam)."
        ),
        headers={"Retry-After": str(retry_seconds)},
    )
