from typing import Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pipelines.rag_pipeline import RAGPipeline

router = APIRouter()
rag_pipeline = RAGPipeline()

class RAGQueryRequest(BaseModel):
    question: str = Field(..., description="Câu hỏi của sinh viên")
    lesson_id: int = Field(..., description="ID bài học để ràng buộc ngữ cảnh (Lesson-bounded)")
    chat_history: Optional[List[dict]] = Field(default=None, description="Lịch sử trao đổi trước đó")
    top_k: Optional[int] = Field(default=4, description="Số chunks tài liệu cần truy xuất")

@router.post("/ask", summary="Hỏi đáp gia sư ảo theo ngữ cảnh (Trả về JSON đầy đủ)")
async def ask_tutor(req: RAGQueryRequest):
    try:
        response = await rag_pipeline.ask(
            question=req.question,
            lesson_id=req.lesson_id,
            chat_history=req.chat_history,
            top_k=req.top_k,
        )
        return response
    except Exception:
        raise HTTPException(status_code=500, detail="AI Tutor không thể xử lý yêu cầu.")

@router.post("/ask/stream", summary="Hỏi đáp gia sư ảo Real-time Streaming (SSE Server-Sent Events)")
async def ask_tutor_stream(req: RAGQueryRequest):
    try:
        return StreamingResponse(
            rag_pipeline.ask_stream(
                question=req.question,
                lesson_id=req.lesson_id,
                chat_history=req.chat_history,
                top_k=req.top_k,
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
