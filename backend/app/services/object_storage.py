from __future__ import annotations

import asyncio
from pathlib import Path

import boto3
from botocore.client import Config

from app.core.config import settings


def r2_enabled() -> bool:
    return bool(
        settings.R2_ACCESS_KEY_ID
        and settings.R2_SECRET_ACCESS_KEY
        and settings.R2_ENDPOINT
        and settings.R2_BUCKET
        and settings.R2_PUBLIC_BASE_URL
    )


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


async def store_object(key: str, content: bytes, content_type: str | None) -> str:
    """Lưu lên R2; chỉ rơi về đĩa cục bộ khi R2 chưa được cấu hình hoàn chỉnh."""
    if r2_enabled():
        def put() -> None:
            _client().put_object(
                Bucket=settings.R2_BUCKET,
                Key=key,
                Body=content,
                ContentType=content_type or "application/octet-stream",
                CacheControl="private, max-age=3600",
            )

        await asyncio.to_thread(put)
        return f"{settings.R2_PUBLIC_BASE_URL.rstrip('/')}/{key}"

    target = Path(settings.MEDIA_ROOT).resolve() / key
    target.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(target.write_bytes, content)
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/media/{key}"


async def delete_object(key: str) -> None:
    if r2_enabled():
        await asyncio.to_thread(_client().delete_object, Bucket=settings.R2_BUCKET, Key=key)
        return
    target = Path(settings.MEDIA_ROOT).resolve() / key
    if target.is_file():
        await asyncio.to_thread(target.unlink)
