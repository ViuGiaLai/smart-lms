"""Ghi nhận lượng token tiêu thụ của AI Service.

Bảng `ai_usage_logs` do backend quản lý (Alembic 0015); AI Service ghi trực
tiếp qua SQL để tránh phụ thuộc vòng giữa hai service. Nếu bảng chưa tồn tại
hoặc DB tạm thời lỗi, việc ghi log không được làm hỏng luồng trả lời người học.
"""

from __future__ import annotations

from typing import Any, Optional

import structlog
from sqlalchemy import text

from core.database import AsyncSessionLocal

logger = structlog.get_logger(__name__)


def _safe_int(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, number)


def estimate_tokens(text_value: str) -> int:
    """Ước lượng thô ~4 ký tự/token khi nhà cung cấp không trả usage metadata."""
    if not text_value:
        return 0
    return max(1, len(text_value) // 4)


async def record_usage(
    *,
    feature: str,
    model: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: Optional[int] = None,
    is_estimated: bool = False,
    user_id: Optional[int] = None,
    lesson_id: Optional[int] = None,
    provider: str = "gemini",
) -> None:
    prompt = _safe_int(prompt_tokens)
    completion = _safe_int(completion_tokens)
    total = _safe_int(total_tokens) if total_tokens is not None else prompt + completion
    if total <= 0 and prompt <= 0 and completion <= 0:
        return

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO ai_usage_logs
                        (feature, provider, model, prompt_tokens, completion_tokens,
                         total_tokens, is_estimated, user_id, lesson_id)
                    VALUES
                        (:feature, :provider, :model, :prompt, :completion,
                         :total, :estimated, :user_id, :lesson_id)
                    """
                ),
                {
                    "feature": feature[:32],
                    "provider": provider[:32],
                    "model": (model or None),
                    "prompt": prompt,
                    "completion": completion,
                    "total": total,
                    "estimated": is_estimated,
                    "user_id": user_id,
                    "lesson_id": lesson_id,
                },
            )
            await session.commit()
    except Exception as exc:  # pragma: no cover - logging must never break chat
        logger.warning("Không ghi được ai_usage_logs", error=str(exc)[:200])


def usage_from_metadata(usage: Any) -> tuple[int, int, int, bool]:
    """Đọc usage_metadata của Google Generative AI, trả (prompt, completion, total, is_real)."""
    if usage is None:
        return 0, 0, 0, False
    prompt = _safe_int(getattr(usage, "prompt_token_count", 0))
    completion = _safe_int(getattr(usage, "candidates_token_count", 0))
    total = _safe_int(getattr(usage, "total_token_count", 0))
    if total <= 0:
        total = prompt + completion
    return prompt, completion, total, total > 0
