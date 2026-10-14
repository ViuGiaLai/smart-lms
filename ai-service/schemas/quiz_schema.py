from enum import Enum
from typing import List, Optional, Union
from pydantic import BaseModel, Field

class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    MIXED = "mixed"

class QuizOption(BaseModel):
    key: str = Field(description="Mã phương án: 'A', 'B', 'C', 'D'")
    text: str = Field(description="Nội dung phương án")

class QuizQuestion(BaseModel):
    question_number: int = Field(default=1, description="Số thứ tự câu hỏi")
    question: Optional[str] = Field(default=None, description="Nội dung câu hỏi")
    question_text: Optional[str] = Field(default=None, description="Nội dung câu hỏi thay thế")
    options: List[Union[QuizOption, str]] = Field(description="Danh sách phương án A, B, C, D")
    correct_answer: Optional[Union[int, str]] = Field(default=None, description="Index hoặc đáp án đúng")
    correct_option: Optional[str] = Field(default=None, description="Đáp án đúng ('A', 'B', 'C', 'D')")
    explanation: str = Field(default="", description="Giải thích chi tiết lý do đúng")
    difficulty: Optional[str] = Field(default="medium", description="Độ khó câu hỏi")
    topic: Optional[str] = Field(default=None, description="Chủ đề kiến thức")
    source_reference: Optional[str] = Field(default=None, description="Trích dẫn trang hoặc slide gốc")

    def get_text(self) -> str:
        return self.question or self.question_text or ""

class QuizSet(BaseModel):
    title: Optional[str] = Field(default="Bài kiểm tra trắc nghiệm", description="Tiêu đề bài kiểm tra")
    summary: Optional[str] = Field(default=None, description="Tóm tắt nội dung kiểm tra")
    lesson_id: Optional[int] = Field(default=None, description="ID bài học")
    difficulty_level: Optional[str] = Field(default="medium", description="Độ khó tổng thể")
    total_questions: int = Field(default=0, description="Tổng số câu hỏi")
    questions: List[QuizQuestion] = Field(default_factory=list, description="Danh sách các câu hỏi trắc nghiệm")
