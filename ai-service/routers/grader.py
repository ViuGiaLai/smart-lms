from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from core.usage import estimate_tokens, record_usage
from pipelines.grader import EssayGrader
from schemas.grader_schema import GradingRequest, GradingResult

router = APIRouter()
essay_grader = EssayGrader()


def _user_id_from_header(x_user_id: Optional[str]) -> Optional[int]:
    try:
        value = int(x_user_id or "")
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


@router.post("/evaluate", response_model=GradingResult, summary="Chấm bài tự luận theo bảng tiêu chí Rubric")
async def evaluate_essay(request: GradingRequest, x_user_id: Optional[str] = Header(default=None)):
    try:
        result = await essay_grader.grade(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi chấm bài tự luận AI: {str(e)}")

    prompt_text = " ".join(
        [
            request.question or "",
            request.reference_answer or "",
            request.student_answer,
            " ".join(item.name for item in request.rubric),
        ]
    )
    completion_text = " ".join(
        [
            result.overall_feedback or "",
            " ".join(score.comment for score in result.criteria_scores),
        ]
    )
    await record_usage(
        feature="grader",
        prompt_tokens=estimate_tokens(prompt_text),
        completion_tokens=estimate_tokens(completion_text),
        is_estimated=True,
        user_id=_user_id_from_header(x_user_id),
    )
    return result
