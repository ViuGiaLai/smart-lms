from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Question option ───────
class QuestionOption(BaseModel):
    key: str  # "A", "B", "C", "D"
    text: str


# ── Quiz Question ─────────
class QuizQuestionBase(BaseModel):
    question_text: str
    options: list[QuestionOption]
    correct_answer: str
    explanation: str | None = None
    order_index: int = Field(0, ge=0)


class QuizQuestionCreate(QuizQuestionBase):
    pass


class QuizQuestionResponse(QuizQuestionBase):
    id: int
    quiz_id: int

    model_config = {"from_attributes": True}


# ── Quiz ────────
class QuizBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    time_limit: int | None = Field(None, ge=0)
    pass_score: float = Field(0.6, ge=0.0, le=1.0)


class QuizCreate(QuizBase):
    questions: list[QuizQuestionCreate] = []


class QuizUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    time_limit: int | None = None
    pass_score: float | None = Field(None, ge=0.0, le=1.0)


class QuizResponse(QuizBase):
    id: int
    course_id: int
    is_ai_generated: bool
    created_at: datetime
    questions: list[QuizQuestionResponse] = []

    model_config = {"from_attributes": True}


# ── Submission ──
class SubmitQuizRequest(BaseModel):
    answers: dict[int, str]  # {question_id: selected_key}
    time_spent: int | None = None


class QuizSubmissionResponse(BaseModel):
    id: int
    quiz_id: int
    user_id: int
    score: float
    passed: bool
    answers: dict[str, Any]
    submitted_at: datetime

    model_config = {"from_attributes": True}


# ── AI Generation ─────────
class AIQuizGenRequest(BaseModel):
    course_id: int
    topic: str
    num_questions: int = Field(10, ge=1, le=50)
    difficulty: str = "medium"  # easy / medium / hard


class AIQuizGenPreviewRequest(BaseModel):
    topic: str
    num_questions: int = Field(5, ge=1, le=50)
    difficulty: str = "medium"
    course_id: int | None = None

