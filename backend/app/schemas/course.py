from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

CourseStatusLiteral = Literal["draft", "published", "archived"]


# ── Shared ───────
class LessonBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    video_url: str | None = None
    duration: int = Field(0, ge=0)  # seconds
    order_index: int = Field(0, ge=0)
    transcript: str | None = None
    resources_url: str | None = None
    source_type: Literal["youtube", "upload", "external", "manual"] | None = None


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
    source_type: Literal["youtube", "upload", "external", "manual"] | None = None


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
    # ── Mở rộng Đa lĩnh vực & Đa trình độ ──
    category_id: int | None = None
    education_level_id: int | None = None
    grade_label: str | None = None
    proficiency_level: str | None = None
    target_audience: str | None = None
    language: str | None = "vi"
    status: CourseStatusLiteral = "draft"
    outcomes: list[str] | None = None
    prerequisites: list[str] | None = None


class CourseCreate(CourseBase):
    slug: str | None = Field(None, max_length=255)


class CourseUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    thumbnail: str | None = None
    status: CourseStatusLiteral | None = None
    category: str | None = None
    level: str | None = None
    category_id: int | None = None
    education_level_id: int | None = None
    grade_label: str | None = None
    proficiency_level: str | None = None
    target_audience: str | None = None
    language: str | None = None
    slug: str | None = Field(None, max_length=255)
    outcomes: list[str] | None = None
    prerequisites: list[str] | None = None


class CourseResponse(CourseBase):
    id: int
    slug: str
    instructor_id: int
    status: str
    created_at: datetime
    updated_at: datetime
    lessons: list[LessonResponse] = []
    category_name: str | None = None
    education_level_name: str | None = None

    model_config = {"from_attributes": True}


class CourseListResponse(CourseBase):
    id: int
    slug: str
    instructor_id: int
    status: str
    created_at: datetime
    category_name: str | None = None
    education_level_name: str | None = None

    model_config = {"from_attributes": True}
