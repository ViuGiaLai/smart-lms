from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


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
    @model_validator(mode="after")
    def validate_multiple_choice(self):
        if not self.question_text.strip():
            raise ValueError("Nội dung câu hỏi không được rỗng")
        if len(self.options) != 4:
            raise ValueError("Mỗi câu hỏi phải có đúng 4 phương án")
        keys = [option.key.strip().upper() for option in self.options]
        if keys != ["A", "B", "C", "D"]:
            raise ValueError("Phương án phải có khóa A, B, C, D theo đúng thứ tự")
        if any(not option.text.strip() for option in self.options):
            raise ValueError("Nội dung phương án không được rỗng")
        if self.correct_answer.strip().upper() not in keys:
            raise ValueError("Đáp án đúng phải là A, B, C hoặc D")
        if self.explanation is None or not self.explanation.strip():
            raise ValueError("Lời giải thích không được rỗng")
        return self


class QuizQuestionResponse(QuizQuestionBase):
    id: int
    quiz_id: int

    model_config = {"from_attributes": True}


class QuizStudentQuestionResponse(BaseModel):
    id: int
    quiz_id: int
    question_text: str
    options: list[QuestionOption]
    order_index: int

    model_config = {"from_attributes": True}


# ── Quiz ────────
class QuizBase(BaseModel):
    lesson_id: int | None = None
    title: str = Field(..., min_length=1, max_length=512)
    description: str | None = None
    time_limit: int | None = Field(None, ge=0)
    pass_score: float = Field(0.6, ge=0.0, le=1.0)


class QuizCreate(QuizBase):
    questions: list[QuizQuestionCreate] = []


class QuizUpdate(BaseModel):
    lesson_id: int | None = None
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


class QuizStudentResponse(QuizBase):
    id: int
    course_id: int
    is_ai_generated: bool
    created_at: datetime
    questions: list[QuizStudentQuestionResponse] = []

    model_config = {"from_attributes": True}


# ── Submission ──
class SubmitQuizRequest(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)  # {question_id: selected_key}
    time_spent: int | None = None


class QuizQuestionResult(BaseModel):
    question_id: int
    selected: str | None = None
    correct_answer: str
    is_correct: bool
    explanation: str = ""
    question_text: str = ""


class QuizSubmissionResponse(BaseModel):
    id: int
    quiz_id: int
    user_id: int
    score: float
    passed: bool
    answers: dict[str, Any]
    submitted_at: datetime
    correct_count: int | None = None
    total_questions: int | None = None
    results: list[QuizQuestionResult] = []

    model_config = {"from_attributes": True}


# ── AI Generation ─────────
# Giới hạn le=30 khớp với GenerateQuizRequest của AI Service (nếu vượt, AI trả 422
# và Backend sẽ báo 502 "AI từ chối" — gây nhầm lẫn cho giảng viên).
DifficultyLiteral = Literal["easy", "medium", "hard", "mixed"]


class AIQuizGenRequest(BaseModel):
    course_id: int
    lesson_id: int | None = None
    topic: str
    num_questions: int = Field(10, ge=1, le=30)
    difficulty: DifficultyLiteral = "medium"


class AIQuizGenPreviewRequest(BaseModel):
    topic: str
    num_questions: int = Field(5, ge=1, le=30)
    difficulty: DifficultyLiteral = "medium"
    course_id: int | None = None
