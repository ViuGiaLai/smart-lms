"""
Smart LMS - RAG Pipeline
Retrieval-Augmented Generation: nhận câu hỏi + lesson_id
→ tìm chunks liên quan → gọi Gemini → stream câu trả lời qua SSE.

Flow:
  1. Embed câu hỏi (RETRIEVAL_QUERY task type)
  2. Similarity search trong lesson-bounded chunks
  3. Xây dựng context từ các chunks tìm được
  4. Gọi Gemini với system prompt (tutor mode, chống hallucination)
  5. Stream response qua Server-Sent Events
"""

import asyncio
import re
from typing import AsyncGenerator, List, Optional
import structlog

import google.generativeai as genai

from core.config import settings
from core.database import AsyncSessionLocal
from core.groq_client import groq_generate, groq_stream, has_valid_groq_key, is_quota_error
from document_processor.embedder import get_embedder
from vector_store.pgvector_store import PgVectorStore
from prompts.tutor_prompt import build_tutor_system_prompt, build_rag_user_prompt

logger = structlog.get_logger(__name__)

# Cấu hình Gemini
genai.configure(api_key=settings.GOOGLE_API_KEY)

NO_API_KEY_MESSAGE = (
    "AI Service chưa được cấu hình GOOGLE_API_KEY hợp lệ nên không thể sinh câu trả lời từ học liệu. "
    "Vui lòng cấu hình API key cho AI Service rồi thử lại."
)


def has_valid_google_key() -> bool:
    """Kiểm tra GOOGLE_API_KEY đã được cấu hình thật (không phải giá trị mẫu)."""
    key = (settings.GOOGLE_API_KEY or "").strip()
    return bool(key) and "your_google_api_key" not in key.lower() and key != "demo_google_api_key"


def format_gemini_error(e: Exception) -> str:
    """Rút gọn lỗi từ Gemini thành thông báo ngắn, trung thực cho người học.

    Giữ nguyên bản chất lỗi (ví dụ hết quota 429, thời gian thử lại) nhưng không
    gửi nguyên khối log kỹ thuật/protobuf cho người dùng cuối.
    """
    raw = str(e)
    if "429" in raw or "quota" in raw.lower():
        m = re.search(r"Please retry in (\d+h\d+m)", raw)
        retry = f". Vui lòng thử lại sau {m.group(1)}" if m else ""
        return (
            "Dịch vụ AI đang hết hạn mức sử dụng miễn phí (Gemini lỗi 429)"
            f"{retry}. Đây là giới hạn từ nhà cung cấp, không phải lỗi của khóa học."
        )
    first_line = (raw.splitlines()[0].strip() if raw.strip() else "lỗi không rõ")
    return f"Gemini không phản hồi: {first_line[:300]}"


def build_no_context_answer(lesson_id: int) -> str:
    """Thông báo minh bạch khi học liệu của bài học không có nội dung liên quan đến câu hỏi."""
    return (
        "⚠️ **Không tìm thấy nội dung liên quan trong học liệu số hóa của bài học này.**\n\n"
        "Trợ lý AI Tutor hoạt động theo cơ chế ràng buộc ngữ cảnh (Lesson-Bounded RAG), chỉ giải đáp bám sát nội dung bài học để đảm bảo tính chuẩn xác tuyệt đối.\n\n"
        "💡 **Gợi ý:** Bạn có thể đặt câu hỏi về các khái niệm chính trong bài học, hoặc xem qua phần nội dung tóm tắt và slide đính kèm."
    )


async def call_groq_fallback(
    question: str,
    context: str,
    lesson_id: int,
    reason: str = "gemini_error",
) -> str:
    """
    Gọi Groq LLM làm fallback khi Gemini hết quota hoặc trả nội dung rỗng.
    Sử dụng cùng system prompt và context như Gemini để đảm bảo chất lượng nhất quán.

    Thông báo lỗi phản ánh ĐÚNG nguyên nhân thật (hết quota vs. nội dung rỗng),
    tránh báo nhầm "hết hạn mức" khi Gemini chỉ trả về nội dung trống.
    """
    if not has_valid_groq_key():
        logger.warning("Groq API key is not configured; fallback unavailable", reason=reason)
        if reason == "empty":
            raise RuntimeError(
                "Gemini trả về nội dung rỗng và chưa cấu hình fallback AI. Vui lòng thử lại sau."
            )
        raise RuntimeError(
            "Gemini đã hết hạn mức hoặc gặp sự cố và chưa cấu hình fallback AI. Vui lòng thử lại sau."
        )

    system_prompt = build_tutor_system_prompt(lesson_id=lesson_id)
    user_message = build_rag_user_prompt(question=question, context=context)

    logger.info("Switching to Groq fallback because Gemini failed", lesson_id=lesson_id)
    try:
        answer = await groq_generate(prompt=user_message, system_prompt=system_prompt)
        return answer.strip() if answer else (
            "Groq không trả về phản hồi. Vui lòng thử lại."
        )
    except Exception as e:
        logger.error("Groq fallback failed", error=str(e))
        raise RuntimeError(
            "Gemini và Groq đều không khả dụng. Vui lòng thử lại sau."
        ) from e


class RAGPipeline:
    """
    Pipeline RAG chính cho AI Tutor của Smart LMS.

    Đặc điểm:
    - Lesson-bounded: chỉ tìm kiếm trong chunks của bài học được chỉ định
    - Anti-hallucination: system prompt yêu cầu Gemini chỉ trả lời dựa trên context
    - SSE Streaming: stream response từng token để UX tốt hơn
    - Tiếng Việt: prompt được tối ưu cho phản hồi tiếng Việt
    """

    def __init__(self):
        self.embedder = get_embedder()  # Default: GeminiEmbedder
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0.3,      # Thấp để giảm hallucination
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 2048,
            },
        )

    # Ghi chú: pipeline KHÔNG sinh câu trả lời giả khi thiếu tri thức hoặc khi
    # Gemini lỗi. Mọi phản hồi đều hoặc lấy từ học liệu thật, hoặc báo lỗi rõ ràng.

    async def ask(
        self,
        question: str,
        lesson_id: int,
        chat_history: Optional[List[dict]] = None,
        top_k: Optional[int] = None,
    ) -> dict:
        """RAG query không streaming. Hoặc trả lời dựa trên học liệu thật, hoặc báo lỗi rõ ràng."""
        if not has_valid_google_key():
            raise RuntimeError(NO_API_KEY_MESSAGE)

        try:
            chunks = await self._retrieve_chunks(question, lesson_id, top_k)
        except RuntimeError:
            # Lỗi cấu hình/embedding: không được che dấu thành "không có tri thức"
            raise
        except Exception as e:
            logger.error("Lỗi retrieve chunks trong ask", error=str(e))
            chunks = []

        if not chunks:
            # Không có tri thức liên quan trong học liệu → nói thật là không có, không bịa nội dung/trích dẫn
            return {
                "answer": build_no_context_answer(lesson_id),
                "sources": [],
                "lesson_id": lesson_id,
                "chunks_used": 0,
            }

        context = self._build_context(chunks)
        system_prompt = build_tutor_system_prompt(lesson_id=lesson_id)
        user_message = build_rag_user_prompt(question=question, context=context)
        full_prompt = f"{system_prompt}\n\n{user_message}"

        try:
            loop = asyncio.get_running_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: self.model.generate_content(full_prompt),
                ),
                timeout=60.0,
            )
        except Exception as e:
            logger.warning("Gemini generate_content failed, switching to Groq fallback", error=str(e))
            answer = await call_groq_fallback(question, context, lesson_id, reason="gemini_error")
        else:
            answer = (response.text or "").strip() if response else ""
            if not answer:
                logger.warning("Gemini returned empty content; switching to Groq fallback")
                answer = await call_groq_fallback(question, context, lesson_id, reason="empty")

        return {
            "answer": answer,
            "sources": [
                {
                    "content": c["content"][:200] + "...",
                    "similarity": round(c["similarity"], 3) if isinstance(c.get("similarity"), (int, float)) else None,
                    "document_id": c.get("document_id"),
                    "page": (c.get("metadata") or {}).get("page"),
                    "filename": (c.get("metadata") or {}).get("filename") or c.get("document_id"),
                    "chunk_index": c.get("chunk_index", 1),
                }
                for c in chunks
            ],
            "lesson_id": lesson_id,
            "chunks_used": len(chunks),
        }


    async def ask_stream(
        self,
        question: str,
        lesson_id: int,
        chat_history: Optional[List[dict]] = None,
        top_k: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """
        RAG query với streaming response qua SSE.
        Không bao giờ bịa nội dung/trích dẫn: hoặc stream câu trả lời thật từ học liệu,
        hoặc stream thông báo minh bạch/lỗi rõ ràng.
        """
        import json

        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        async def stream_text(text: str) -> AsyncGenerator[str, None]:
            for w in text.split(" "):
                yield sse({"type": "chunk", "content": w + " ", "token": w + " "})
                await asyncio.sleep(0.02)

        # Bước 1: Kiểm tra cấu hình & Retrieve chunks an toàn
        if not has_valid_google_key():
            logger.error("GOOGLE_API_KEY is not configured for AI Service")
            yield sse({"type": "error", "error": NO_API_KEY_MESSAGE})
            yield sse({"type": "done", "done": True})
            return

        try:
            chunks = await self._retrieve_chunks(question, lesson_id, top_k)
        except RuntimeError as e:
            # Lỗi embedding/cấu hình: báo lỗi thật, không giả vờ là hết tri thức
            logger.error("Embedding failed during document retrieval", error=str(e))
            yield sse({"type": "error", "error": str(e)})
            yield sse({"type": "done", "done": True})
            return
        except Exception as e:
            logger.error("Chunk retrieval failed during streaming", error=str(e))
            chunks = []

        # Bước 2: Không có tri thức liên quan trong học liệu → nói thật, không bịa
        if not chunks:
            async for event in stream_text(build_no_context_answer(lesson_id)):
                yield event
            yield sse({"type": "sources", "data": []})
            yield sse({"type": "done", "done": True})
            return

        context = self._build_context(chunks)
        system_prompt = build_tutor_system_prompt(lesson_id=lesson_id)
        user_message = build_rag_user_prompt(question=question, context=context)
        full_prompt = f"{system_prompt}\n\n{user_message}"

        streamed_any = False
        gemini_error = None
        try:
            stream_response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: self.model.generate_content(full_prompt, stream=True),
            )

            for chunk in stream_response:
                if chunk.text:
                    streamed_any = True
                    yield sse({"type": "chunk", "content": chunk.text, "token": chunk.text})
                    await asyncio.sleep(0.01)
        except Exception as e:
            gemini_error = e
            logger.warning("Gemini streaming failed; switching to Groq fallback", error=str(e))

        # Nếu Gemini không stream được gì → fallback sang Groq
        if not streamed_any:
            if has_valid_groq_key():
                logger.info("Streaming qua Groq fallback", lesson_id=lesson_id)
                try:
                    system_prompt = build_tutor_system_prompt(lesson_id=lesson_id)
                    user_message = build_rag_user_prompt(question=question, context=context)
                    async for chunk_text in groq_stream(prompt=user_message, system_prompt=system_prompt):
                        if chunk_text:
                            streamed_any = True
                            yield sse({"type": "chunk", "content": chunk_text, "token": chunk_text})
                            await asyncio.sleep(0.005)
                except Exception as groq_err:
                    logger.error("Groq streaming fallback failed", error=str(groq_err))
                    yield sse({"type": "error", "error": "Cả Gemini và Groq đều không khả dụng. Vui lòng thử lại sau."})
                    yield sse({"type": "done", "done": True})
                    return
            else:
                # Không có Groq key → thông báo lỗi rõ ràng
                err_msg = format_gemini_error(gemini_error) if gemini_error else "Dịch vụ AI không phản hồi."
                yield sse({"type": "error", "error": err_msg})
                yield sse({"type": "done", "done": True})
                return

        # Nguồn trích dẫn thật lấy từ pgvector (similarity thật, không phải số bịa)
        yield sse({
            "type": "sources",
            "data": [
                {
                    "content": c["content"][:200] + "...",
                    "similarity": round(c["similarity"], 3) if isinstance(c.get("similarity"), (int, float)) else None,
                    "document_id": c.get("document_id"),
                    "page": (c.get("metadata") or {}).get("page"),
                    "filename": (c.get("metadata") or {}).get("filename") or c.get("document_id"),
                }
                for c in chunks
            ],
        })
        yield sse({"type": "done", "done": True})


    async def _retrieve_chunks(
        self,
        question: str,
        lesson_id: int,
        top_k: Optional[int] = None,
    ) -> List[dict]:
        """Embed câu hỏi và tìm chunks liên quan trong lesson.

        Hỗ trợ fallback lấy trực tiếp chunks hoặc transcript của bài học trong cơ sở dữ liệu.
        """
        chunks = []
        try:
            query_embedding = await self.embedder.embed_query(question)
            async with AsyncSessionLocal() as db:
                store = PgVectorStore(db)
                chunks = await store.similarity_search_by_lesson(
                    query_embedding=query_embedding,
                    lesson_id=lesson_id,
                    top_k=top_k,
                )
        except Exception as e:
            logger.error("pgvector similarity search failed", error=str(e))
            raise RuntimeError(
                "Không thể truy xuất kho học liệu vector của bài học. Vui lòng thử lại sau."
            ) from e

        return chunks

    def _build_context(self, chunks: List[dict]) -> str:
        """
        Ghép các chunks thành context string cho LLM.
        Sắp xếp theo chunk_index để giữ thứ tự tự nhiên.
        """
        sorted_chunks = sorted(chunks, key=lambda x: x.get("chunk_index", 0))

        context_parts = []
        for i, chunk in enumerate(sorted_chunks, 1):
            sim = chunk.get("similarity")
            sim_label = f"{sim:.2f}" if isinstance(sim, (int, float)) else "n/a"
            metadata = chunk.get("metadata") or {}
            source = metadata.get("filename") or chunk.get("document_id") or "học liệu"
            page = metadata.get("page")
            source_label = f"{source}, trang {page}" if page else source
            context_parts.append(
                f"[Đoạn {i} - Nguồn: {source_label} - Độ liên quan: {sim_label}]\n{chunk['content']}"
            )

        return "\n\n---\n\n".join(context_parts)
