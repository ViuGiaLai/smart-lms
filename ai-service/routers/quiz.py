from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from pipelines.quiz_generator import QuizGenerator
from schemas.quiz_schema import QuizSet, DifficultyLevel

router = APIRouter()
quiz_generator = QuizGenerator()

class GenerateQuizRequest(BaseModel):
    content: str = Field(..., description="Nội dung bài giảng, slide hoặc trích đoạn tài liệu")
    num_questions: int = Field(default=5, ge=1, le=30, description="Số lượng câu hỏi trắc nghiệm")
    difficulty: DifficultyLevel = Field(default=DifficultyLevel.MEDIUM, description="Độ khó: easy, medium, hard, mixed")
    bloom_level: Optional[str] = Field(default="mixed", description="Mức Bloom: remember, understand, apply, analyze, evaluate, create hoặc mixed")
    lesson_id: Optional[int] = Field(default=None, description="ID bài học liên quan")
    language: str = Field(default="vi", description="Ngôn ngữ sinh đề: vi hoặc en")


def _user_id_from_header(x_user_id: Optional[str]) -> Optional[int]:
    try:
        value = int(x_user_id or "")
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


@router.post("/generate", response_model=QuizSet, summary="Tự động sinh bộ câu hỏi trắc nghiệm từ tài liệu")
async def generate_quiz(req: GenerateQuizRequest, x_user_id: Optional[str] = Header(default=None)):
    try:
        quiz_set = await quiz_generator.generate(
            content=req.content,
            num_questions=req.num_questions,
            difficulty=req.difficulty,
            bloom_level=req.bloom_level,
            lesson_id=req.lesson_id,
            language=req.language,
            user_id=_user_id_from_header(x_user_id),
        )
        return quiz_set
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh câu hỏi trắc nghiệm: {str(e)}")
