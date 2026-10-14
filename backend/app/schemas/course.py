from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Shared ───────
class LessonBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    video_url: str | None = None
    duration: int = Field(0, ge=0)  # seconds
    order_index: int = Field(0, ge=0)
    transcript: str | None = None
    resources_url: str | None = None


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    video_url: str | None = None
    duration: int | None = Field(None, ge=0)
    order_index: int | None = Field(None, ge=0)
    transcript: str | None = None
    resources_url: str | None = None


class LessonResponse(LessonBase):
    id: int
    course_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Course ───────
class CourseBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    price: Decimal = Field(Decimal("0.00"), ge=0)
    thumbnail: str | None = None
    category: str | None = None
    level: str | None = None
    status: str = "published"


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    thumbnail: str | None = None
    status: str | None = None
    category: str | None = None
    level: str | None = None


class CourseResponse(CourseBase):
    id: int
    instructor_id: int
    status: str
    created_at: datetime
    updated_at: datetime
    lessons: list[LessonResponse] = []

    model_config = {"from_attributes": True}


class CourseListResponse(CourseBase):
    id: int
    instructor_id: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
