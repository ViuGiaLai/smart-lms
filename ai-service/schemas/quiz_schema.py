from enum import Enum
from typing import List, Optional, Union
from pydantic import BaseModel, Field, model_validator

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

    @model_validator(mode="after")
    def validate_multiple_choice_question(self):
        text = self.get_text().strip()
        if not text:
            raise ValueError("Nội dung câu hỏi không được rỗng")
        if len(self.options) != 4:
            raise ValueError("Mỗi câu hỏi phải có đúng 4 phương án")

        normalized_keys = []
        for index, option in enumerate(self.options):
            if isinstance(option, QuizOption):
                key = option.key.strip().upper()
                option_text = option.text.strip()
            else:
                key = chr(65 + index)
                option_text = str(option).strip()
            if not option_text:
                raise ValueError("Nội dung phương án không được rỗng")
            normalized_keys.append(key)

        if normalized_keys != ["A", "B", "C", "D"]:
            raise ValueError("Phương án phải có khóa A, B, C, D theo đúng thứ tự")
        if self.correct_answer is None and not self.correct_option:
            raise ValueError("Thiếu đáp án đúng")
        if isinstance(self.correct_answer, int) and self.correct_answer not in range(4):
            raise ValueError("Index đáp án đúng phải nằm trong khoảng 0-3")
        if isinstance(self.correct_answer, str) and self.correct_answer.strip().upper() not in normalized_keys:
            raise ValueError("Đáp án đúng phải là A, B, C hoặc D")
        if self.correct_option and self.correct_option.strip().upper() not in normalized_keys:
            raise ValueError("Đáp án đúng phải là A, B, C hoặc D")
        if not self.explanation.strip():
            raise ValueError("Lời giải thích không được rỗng")

        # Chuẩn hoá hợp đồng đầu ra dùng chung với Backend:
        # luôn có question_text và correct_answer/correct_option dạng chữ A-D.
        if not self.question_text:
            self.question_text = text
        if isinstance(self.correct_answer, int):
            self.correct_answer = normalized_keys[self.correct_answer]
        elif isinstance(self.correct_answer, str):
            self.correct_answer = self.correct_answer.strip().upper()
        if not self.correct_option and isinstance(self.correct_answer, str):
            self.correct_option = self.correct_answer
        return self

    def get_text(self) -> str:
        return self.question or self.question_text or ""

class QuizSet(BaseModel):
    title: Optional[str] = Field(default="Bài kiểm tra trắc nghiệm", description="Tiêu đề bài kiểm tra")
    summary: Optional[str] = Field(default=None, description="Tóm tắt nội dung kiểm tra")
    lesson_id: Optional[int] = Field(default=None, description="ID bài học")
    difficulty_level: Optional[str] = Field(default="medium", description="Độ khó tổng thể")
    total_questions: int = Field(default=0, description="Tổng số câu hỏi")
    questions: List[QuizQuestion] = Field(default_factory=list, description="Danh sách các câu hỏi trắc nghiệm")
