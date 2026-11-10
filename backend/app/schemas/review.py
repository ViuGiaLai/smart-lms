from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ReviewUpsert(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Số sao từ 1 đến 5")
    comment: str | None = Field(None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
