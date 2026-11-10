from typing import List, Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.config import settings
from pipelines.rag_pipeline import RAGPipeline

router = APIRouter()
rag_pipeline = RAGPipeline()


def _user_id_from_header(x_user_id: Optional[str]) -> Optional[int]:
    try:
        value = int(x_user_id or "")
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class RAGQueryRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=4000, description="Câu hỏi của sinh viên")
    lesson_id: int = Field(..., description="ID bài học để ràng buộc ngữ cảnh (Lesson-bounded)")
    chat_history: Optional[List[ChatTurn]] = Field(
        default=None,
        max_length=12,
        description="Lịch sử trao đổi gần nhất, dùng cho câu hỏi tiếp nối",
    )
    top_k: Optional[int] = Field(
        default=None, ge=1, le=20, description="Số chunks tài liệu cần truy xuất"
    )
    # Backend xác thực hai trường này từ DB trước khi gửi sang; không tin client.
    lesson_title: Optional[str] = Field(default=None, max_length=512)
    course_level: Optional[str] = Field(default=None, max_length=32)
    course_category: Optional[str] = Field(default=None, max_length=100)
    grade_label: Optional[str] = Field(default=None, max_length=100)
    target_audience: Optional[str] = Field(default=None, max_length=255)
    # Ngôn ngữ khóa học (vi/en) để gia sư trả lời đúng ngôn ngữ học viên đang học.
    language: Optional[str] = Field(default=None, max_length=10)
    tutor_mode: Optional[str] = Field(default="socratic", max_length=32)


def _history_payload(req: RAGQueryRequest) -> Optional[List[dict]]:
    if not req.chat_history:
        return None
    return [turn.model_dump() for turn in req.chat_history[-settings.RAG_MAX_HISTORY_TURNS :]]


@router.post("/ask", summary="Hỏi đáp gia sư ảo theo ngữ cảnh (Trả về JSON đầy đủ)")
async def ask_tutor(req: RAGQueryRequest, x_user_id: Optional[str] = Header(default=None)):
    try:
        return await rag_pipeline.ask(
            question=req.question,
            lesson_id=req.lesson_id,
            chat_history=_history_payload(req),
            top_k=req.top_k,
            lesson_title=req.lesson_title,
            course_level=req.course_level,
            course_category=req.course_category,
            grade_label=req.grade_label,
            target_audience=req.target_audience,
            tutor_mode=req.tutor_mode,
            user_id=_user_id_from_header(x_user_id),
        )
    except Exception:
        raise HTTPException(status_code=500, detail="AI Tutor không thể xử lý yêu cầu.")


@router.post(
    "/ask/stream",
    summary="Hỏi đáp gia sư ảo Real-time Streaming (SSE Server-Sent Events)",
)
async def ask_tutor_stream(req: RAGQueryRequest, x_user_id: Optional[str] = Header(default=None)):
    try:
        return StreamingResponse(
            rag_pipeline.ask_stream(
                question=req.question,
                lesson_id=req.lesson_id,
                chat_history=_history_payload(req),
                top_k=req.top_k,
                lesson_title=req.lesson_title,
                course_level=req.course_level,
                course_category=req.course_category,
                grade_label=req.grade_label,
                target_audience=req.target_audience,
                language=req.language,
                tutor_mode=req.tutor_mode,
                user_id=_user_id_from_header(x_user_id),
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Không thể khởi tạo luồng AI Tutor.")
