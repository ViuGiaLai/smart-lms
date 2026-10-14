from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pipelines.summarizer import LectureSummarizer, SummaryResult

router = APIRouter()
summarizer = LectureSummarizer()

class SummarizeRequest(BaseModel):
    content: str = Field(..., description="Nội dung bài giảng cần tóm tắt")
    num_key_points: int = Field(default=8, ge=3, le=20, description="Số lượng điểm chính")
    num_flashcards: int = Field(default=8, ge=2, le=20, description="Số flashcards ôn tập")
    lesson_id: Optional[int] = Field(default=None, description="ID bài học")

@router.post("/summarize", response_model=SummaryResult, summary="Tóm tắt bài giảng thành Bullet points và Flashcards")
async def summarize_lecture(req: SummarizeRequest):
    try:
        result = await summarizer.summarize(
            content=req.content,
            num_key_points=req.num_key_points,
            num_flashcards=req.num_flashcards,
            lesson_id=req.lesson_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tóm tắt bài giảng: {str(e)}")
