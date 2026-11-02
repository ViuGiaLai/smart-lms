from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class TopicMasteryItem(BaseModel):
    topic_name: str
    mastery_score: float
    attempts_count: int
    weak_points: list[str] = []
    strong_points: list[str] = []
    recommended_next_step: str | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class CourseMasteryOverview(BaseModel):
    course_id: int
    course_title: str
    overall_mastery: float
    topics: list[TopicMasteryItem]
    strong_areas: list[str]
    needs_review_areas: list[str]
