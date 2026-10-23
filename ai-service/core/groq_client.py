"""
Smart LMS - Groq LLM Client
Dùng làm fallback khi Gemini hết quota (429) hoặc timeout.
Hỗ trợ cả non-streaming và streaming response.
"""

import asyncio
import structlog
from typing import AsyncGenerator, Optional

from groq import Groq, AsyncGroq

from core.config import settings

logger = structlog.get_logger(__name__)


def has_valid_groq_key() -> bool:
    """Kiểm tra GROQ_API_KEY đã được cấu hình (không rỗng, không phải placeholder)."""
    key = (settings.GROQ_API_KEY or "").strip()
    return bool(key) and "your_groq" not in key.lower()


def is_quota_error(e: Exception) -> bool:
    """Kiểm tra exception có phải lỗi hết quota/rate limit của Gemini không."""
    raw = str(e).lower()
    return any(kw in raw for kw in ["429", "quota", "rate_limit", "resource_has_been_exhausted", "retry_delay"])


async def groq_generate(prompt: str, system_prompt: str = "") -> str:
    """
    Gọi Groq API (non-streaming) để sinh câu trả lời.

    Args:
        prompt: Nội dung user message (context + câu hỏi)
        system_prompt: System instruction cho model

    Returns:
        Câu trả lời dạng string từ Groq
    """
    if not has_valid_groq_key():
        raise RuntimeError("GROQ_API_KEY chưa được cấu hình.")

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        logger.info("Gọi Groq API (non-streaming)", model=settings.GROQ_MODEL)
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=2048,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error("Groq API lỗi", error=str(e))
        raise


async def groq_stream(prompt: str, system_prompt: str = "") -> AsyncGenerator[str, None]:
    """
    Gọi Groq API (streaming) để stream từng chunk câu trả lời.

    Yields:
        Từng đoạn text (chunk) từ Groq stream
    """
    if not has_valid_groq_key():
        raise RuntimeError("GROQ_API_KEY chưa được cấu hình.")

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    logger.info("Gọi Groq API (streaming)", model=settings.GROQ_MODEL)
    stream = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=2048,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta
