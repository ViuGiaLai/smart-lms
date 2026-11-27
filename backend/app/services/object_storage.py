from __future__ import annotations

import asyncio
import shutil
from io import BytesIO
from pathlib import Path
from typing import BinaryIO, Optional

import boto3
from botocore.client import Config

from app.core.config import settings


def r2_enabled() -> bool:
    return bool(
        settings.R2_ACCESS_KEY_ID
        and settings.R2_SECRET_ACCESS_KEY
        and settings.R2_ENDPOINT
        and settings.R2_BUCKET
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
    return await store_stream(key, BytesIO(content), content_type)


async def store_stream(key: str, stream: BinaryIO, content_type: str | None) -> str:
    """Copy from FastAPI's spooled file without loading a complete video into RAM."""
    if r2_enabled():
        def put() -> None:
            _client().upload_fileobj(
                stream, settings.R2_BUCKET, key,
                ExtraArgs={
                    "ContentType": content_type or "application/octet-stream",
                    "CacheControl": "private, no-store",
                },
            )

        await asyncio.to_thread(put)
        return f"r2://{key}"

    target = Path(settings.MEDIA_ROOT).resolve() / key
    def copy() -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as destination:
            shutil.copyfileobj(stream, destination, length=1024 * 1024)

    await asyncio.to_thread(copy)
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/media/{key}"


async def resolve_media_url(url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith("r2://"):
        return await presign_download(url.removeprefix("r2://"))
    public_base = settings.R2_PUBLIC_BASE_URL.rstrip("/")
    if public_base and url.startswith(f"{public_base}/"):
        return await presign_download(url[len(public_base) + 1:])
    return url


async def read_stored_object(key: str, is_remote: bool, destination: BinaryIO) -> None:
    if is_remote:
        await asyncio.to_thread(_client().download_fileobj, settings.R2_BUCKET, key, destination)
        return

    def copy() -> None:
        with (Path(settings.MEDIA_ROOT).resolve() / key).open("rb") as source:
            shutil.copyfileobj(source, destination, length=1024 * 1024)

    await asyncio.to_thread(copy)


async def presign_download(key: str, expires_in: int | None = None) -> Optional[str]:
    """Tạo URL tải có chữ ký cho một đối tượng trên R2.

    Trả ``None`` khi R2 chưa cấu hình hoặc không ký được.
    """
    if not key or not r2_enabled():
        return None
    ttl = expires_in or settings.R2_SIGNED_URL_EXPIRE_SECONDS

    def sign() -> str:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.R2_BUCKET, "Key": key},
            ExpiresIn=max(60, int(ttl)),
        )

    try:
        return await asyncio.to_thread(sign)
    except Exception:
        return None


async def delete_object(key: str, *, is_remote: bool) -> None:
    if is_remote:
        await asyncio.to_thread(_client().delete_object, Bucket=settings.R2_BUCKET, Key=key)
        return
    root = Path(settings.MEDIA_ROOT).resolve()
    target = (root / key).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Invalid media storage key")
    if target.is_file():
        await asyncio.to_thread(target.unlink)
