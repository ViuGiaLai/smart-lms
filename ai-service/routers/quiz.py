from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pipelines.quiz_generator import QuizGenerator
from schemas.quiz_schema import QuizSet, DifficultyLevel

router = APIRouter()
quiz_generator = QuizGenerator()

class GenerateQuizRequest(BaseModel):
    content: str = Field(..., description="Nội dung bài giảng, slide hoặc trích đoạn tài liệu")
    num_questions: int = Field(default=5, ge=1, le=30, description="Số lượng câu hỏi trắc nghiệm")
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.MEDIUM, description="Độ khó: easy, medium, hard, mixed")
    lesson_id: Optional[int] = Field(default=None, description="ID bài học liên quan")
    language: str = Field(default="vi", description="Ngôn ngữ sinh đề: vi hoặc en")

@router.post("/generate", response_model=QuizSet, summary="Tự động sinh bộ câu hỏi trắc nghiệm từ tài liệu")
async def generate_quiz(req: GenerateQuizRequest):
    try:
        quiz_set = await quiz_generator.generate(
            content=req.content,
            num_questions=req.num_questions,
            difficulty=req.difficulty,
            lesson_id=req.lesson_id,
            language=req.language,
        )
        return quiz_set
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh câu hỏi trắc nghiệm: {str(e)}")
