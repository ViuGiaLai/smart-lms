from __future__ import annotations

import hashlib
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.core.security import require_instructor
from app.models.user import User

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB


def _cloudinary_signature(params: dict[str, str | int]) -> str:
    """Tạo signature SHA-1 theo đúng quy tắc của Cloudinary."""
    payload = "&".join(
        f"{key}={params[key]}" for key in sorted(params) if params[key] not in (None, "")
    )
    return hashlib.sha1((payload + settings.CLOUDINARY_API_SECRET).encode("utf-8")).hexdigest()


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_instructor),
) -> dict:
    """Tải ảnh bìa khóa học lên Cloudinary và trả về URL công khai.

    Chỉ giảng viên/quản trị viên được phép upload. Ảnh được giới hạn dung lượng
    và định dạng để tránh lưu trữ rác hoặc tệp thực thi dưới vỏ bọc ảnh.
    """
    if not (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary chưa được cấu hình trên máy chủ.",
        )

    content_type = (file.content_type or "").lower()
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.",
        )

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ảnh vượt quá 8MB. Vui lòng chọn ảnh nhỏ hơn.",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp ảnh rỗng.",
        )

    timestamp = int(time.time())
    public_id = f"{settings.CLOUDINARY_FOLDER.strip('/')}/{uuid.uuid4().hex}"
    signed = {"public_id": public_id, "timestamp": timestamp}
    signature = _cloudinary_signature(signed)

    upload_url = (
        f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload"
    )
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                upload_url,
                data={
                    "api_key": settings.CLOUDINARY_API_KEY,
                    "public_id": public_id,
                    "timestamp": str(timestamp),
                    "signature": signature,
                },
                files={"file": (f"thumbnail.{extension}", data, content_type)},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không kết nối được Cloudinary. Vui lòng thử lại.",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloudinary từ chối tệp ảnh. Vui lòng thử ảnh khác.",
        )

    payload = response.json()
    return {
        "success": True,
        "data": {
            "url": payload.get("secure_url"),
            "publicId": payload.get("public_id"),
            "width": payload.get("width"),
            "height": payload.get("height"),
            "bytes": payload.get("bytes"),
            "uploadedBy": str(current_user.id),
        },
    }
