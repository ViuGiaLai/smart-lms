from fastapi import APIRouter, HTTPException
from pipelines.grader import EssayGrader
from schemas.grader_schema import GradingRequest, GradingResult

router = APIRouter()
essay_grader = EssayGrader()

@router.post("/evaluate", response_model=GradingResult, summary="Chấm bài tự luận theo bảng tiêu chí Rubric")
async def evaluate_essay(request: GradingRequest):
    try:
        result = await essay_grader.grade(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi chấm bài tự luận AI: {str(e)}")
