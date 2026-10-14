from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class ProgressUpdate(BaseModel):
    percent_complete: float = Field(..., ge=0.0, le=100.0)
    last_position: int = Field(0, ge=0)


class ProgressResponse(BaseModel):
    id: int
    user_id: int
    lesson_id: int
    percent_complete: float
    is_completed: bool
    last_position: int
    started_at: datetime
    completed_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class CourseSummary(BaseModel):
    course_id: int
    total_lessons: int
    completed_lessons: int
    overall_percent: float
