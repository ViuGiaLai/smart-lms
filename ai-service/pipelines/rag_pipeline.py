"""
Smart LMS - RAG Pipeline (Lesson-bounded AI Tutor)

Flow:
  1. Chuẩn hóa câu hỏi + lịch sử hội thoại (câu hỏi tiếp nối).
  2. Embed truy vấn và tìm ứng viên trong đúng lesson.
  3. Lọc bằng chứng: similarity + trùng từ khóa; câu ngoài phạm vi bị loại.
  4. Xây dựng context có tên bài/video, mốc thời gian và trang.
  5. Gọi Gemini (fallback Groq) với prompt phân tách "bài giảng" và "bổ sung".
  6. Stream SSE kèm sources có timestamp để UI mở lại đúng đoạn video.
"""

import asyncio
import json
import re
import unicodedata
from typing import AsyncGenerator, Iterable, List, Optional

import google.generativeai as genai
import structlog
from sqlalchemy import select

from core.config import settings
from core.database import AsyncSessionLocal
from core.groq_client import groq_generate, groq_stream, has_valid_groq_key
from core.usage import estimate_tokens, record_usage, usage_from_metadata
from document_processor.embedder import get_embedder
from prompts.tutor_prompt import build_rag_user_prompt, build_tutor_system_prompt
from vector_store.pgvector_store import DocumentChunk, PgVectorStore

logger = structlog.get_logger(__name__)

genai.configure(api_key=settings.GOOGLE_API_KEY)

NO_API_KEY_MESSAGE = (
    "AI Service chưa được cấu hình GOOGLE_API_KEY hợp lệ nên không thể sinh câu trả lời từ học liệu. "
    "Vui lòng cấu hình API key cho AI Service rồi thử lại."
)

# Từ nối/đại từ không mang nội dung — bỏ khi đo mức trùng từ khóa.
_STOPWORDS = {
    "là", "và", "của", "cho", "trong", "một", "như", "thế", "nào", "có",
    "không", "được", "khi", "ra", "thì", "mà", "ở", "để", "với", "bạn",
    "mình", "hay", "hoặc", "các", "những", "nhiều", "giữa", "sự", "gì",
    "về", "tại", "sao", "hãy", "giúp", "đi", "rồi", "vậy", "hơn", "rất",
    "cũng", "đã", "đang", "sẽ", "bị", "bởi", "vì", "nên", "nếu", "lại",
    "đó", "này", "kia", "ai", "đâu", "bao", "nhiêu", "thêm", "ý", "trên",
    "dưới", "sau", "trước", "đến", "từ", "bằng", "theo", "vào", "làm",
    "cách", "muốn", "cần", "phải", "nhưng", "vẫn", "chỉ", "còn", "đúng",
    "sai", "ạ", "nhé", "nhỉ", "đấy", "thôi", "chứ", "hả",
}

_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
_FOLLOW_UP_RE = re.compile(
    r"^(nó|vậy|thế|và|còn|tiếp|thêm|ví dụ|giải thích thêm|tại sao|"
    r"ý trên|đoạn (đó|này)|cho (mình )?(một )?ví dụ|cụ thể hơn|rõ hơn)",
    re.IGNORECASE,
)
_SUMMARY_HINTS = (
    "tóm tắt",
    "tổng quan",
    "ý chính",
    "nội dung chính",
    "bài này nói",
    "bài giảng này nói",
    "summary",
    "overview",
)


def has_valid_google_key() -> bool:
    """Kiểm tra GOOGLE_API_KEY đã được cấu hình thật (không phải giá trị mẫu)."""
    key = (settings.GOOGLE_API_KEY or "").strip()
    return bool(key) and "your_google_api_key" not in key.lower() and key != "demo_google_api_key"


def format_gemini_error(e: Exception) -> str:
    """Rút gọn lỗi Gemini thành thông báo ngắn, trung thực cho người học."""
    raw = str(e)
    if "429" in raw or "quota" in raw.lower():
        m = re.search(r"Please retry in (\d+h\d+m)", raw)
        retry = f". Vui lòng thử lại sau {m.group(1)}" if m else ""
        return (
            "Dịch vụ AI đang hết hạn mức sử dụng miễn phí (Gemini lỗi 429)"
            f"{retry}. Đây là giới hạn từ nhà cung cấp, không phải lỗi của khóa học."
        )
    first_line = raw.splitlines()[0].strip() if raw.strip() else "lỗi không rõ"
    return f"Gemini không phản hồi: {first_line[:300]}"


def build_no_context_answer(lesson_id: int, lesson_title: Optional[str] = None) -> str:
    """Trả lời minh bạch khi không có bằng chứng trong học liệu của bài."""
    title = f'"{lesson_title}"' if lesson_title else f"bài học #{lesson_id}"
    return (
        f"**Trong bài giảng {title} hiện chưa có nội dung trả lời câu hỏi này.**\n\n"
        "Mình chỉ trả lời dựa trên phụ đề và tài liệu của đúng bài học, nên sẽ không suy đoán "
        "để tránh cung cấp thông tin sai.\n\n"
        "Bạn có thể thử:\n"
        "- Hỏi lại bằng một khái niệm khác có trong bài giảng.\n"
        "- Xem lại phần transcript hoặc slide đính kèm.\n"
        "- Nhờ giảng viên bổ sung nội dung này vào học liệu."
    )


def _tokenize(text: str) -> List[str]:
    """Tách từ tiếng Việt đơn giản, giữ dấu để tránh nhầm 'bò' với 'bộ'."""
    normalized = unicodedata.normalize("NFC", (text or "").lower())
    return [
        word
        for word in _WORD_RE.findall(normalized)
        if len(word) >= 2 and word not in _STOPWORDS
    ]


def _overlap(query_tokens: set[str], content: str) -> float:
    if not query_tokens:
        return 0.0
    content_tokens = set(_tokenize(content))
    return len(query_tokens & content_tokens) / len(query_tokens)


def _is_follow_up(question: str) -> bool:
    """Câu ngắn/đại từ thường là hỏi tiếp, cần ghép câu hỏi trước để truy xuất."""
    tokens = _tokenize(question)
    return len(tokens) <= 3 or bool(_FOLLOW_UP_RE.search((question or "").strip()))


def _is_summary_request(question: str) -> bool:
    lowered = (question or "").lower()
    return any(hint in lowered for hint in _SUMMARY_HINTS)


async def call_groq_fallback(
    question: str,
    context: str,
    lesson_id: int,
    reason: str = "gemini_error",
    chat_history: Optional[Iterable[dict]] = None,
    lesson_title: Optional[str] = None,
    course_level: Optional[str] = None,
) -> str:
    """Gọi Groq khi Gemini hết quota hoặc trả nội dung rỗng, dùng cùng prompt."""
    if not has_valid_groq_key():
        logger.warning("Groq API key is not configured; fallback unavailable", reason=reason)
        if reason == "empty":
            raise RuntimeError(
                "Gemini trả về nội dung rỗng và chưa cấu hình fallback AI. Vui lòng thử lại sau."
            )
        raise RuntimeError(
            "Gemini đã hết hạn mức hoặc gặp sự cố và chưa cấu hình fallback AI. Vui lòng thử lại sau."
        )

    system_prompt = build_tutor_system_prompt(
        lesson_id=lesson_id, lesson_title=lesson_title, course_level=course_level
    )
    user_message = build_rag_user_prompt(
        question=question,
        context=context,
        chat_history=chat_history,
        lesson_title=lesson_title or "",
    )

    logger.info("Switching to Groq fallback because Gemini failed", lesson_id=lesson_id)
    try:
        answer = await groq_generate(prompt=user_message, system_prompt=system_prompt)
        return answer.strip() if answer else "Groq không trả về phản hồi. Vui lòng thử lại."
    except Exception as e:
        logger.error("Groq fallback failed", error=str(e))
        raise RuntimeError("Gemini và Groq đều không khả dụng. Vui lòng thử lại sau.") from e


class RAGPipeline:
    """Pipeline RAG chính cho AI Tutor của Smart LMS.

    - Lesson-bounded: chỉ tìm trong chunks của đúng bài học.
    - Lọc bằng chứng trước khi gọi LLM: câu ngoài phạm vi không có context.
    - Phân tách nội dung bài giảng và kiến thức bổ sung trong prompt.
    - Hỗ trợ lịch sử hội thoại cho câu hỏi tiếp nối.
    - SSE streaming, sources có timestamp/trang để UI mở lại học liệu.
    """

    def __init__(self):
        self.embedder = get_embedder()
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0.25,
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 2048,
            },
        )

    def _build_retrieval_query(
        self, question: str, chat_history: Optional[Iterable[dict]] = None
    ) -> str:
        """Câu hỏi tiếp nối được ghép với câu hỏi trước để embed đúng chủ đề."""
        user_turns = [
            str(turn.get("content", "")).strip()
            for turn in (chat_history or [])
            if str(turn.get("role", "")).lower() == "user" and str(turn.get("content", "")).strip()
        ]
        if user_turns and _is_follow_up(question):
            return f"{user_turns[-1]} {question}".strip()
        return question

    def _select_evidence(
        self,
        chunks: List[dict],
        retrieval_query: str,
        question: str,
    ) -> List[dict]:
        """Giữ chunk có bằng chứng; loại câu ngoài phạm vi bài giảng."""
        if not chunks:
            return []

        query_tokens = set(_tokenize(retrieval_query))
        current_tokens = set(_tokenize(question))
        summary_request = _is_summary_request(question)
        scored: list[tuple[float, dict]] = []

        for chunk in chunks:
            similarity = chunk.get("similarity")
            similarity = float(similarity) if isinstance(similarity, (int, float)) else 0.0
            content = chunk.get("content") or ""
            overlap = _overlap(query_tokens, content)
            # Với câu hỏi mới (không phải hỏi tiếp), ưu tiên trùng từ khóa của chính câu hỏi.
            current_overlap = _overlap(current_tokens, content) if current_tokens else overlap
            evidence_score = similarity + 0.15 * max(overlap, current_overlap)

            if summary_request:
                keep = True
            else:
                best_overlap = max(overlap, current_overlap)
                keep = (
                    similarity >= settings.RAG_MIN_SIMILARITY
                    or (
                        similarity >= settings.RAG_LEXICAL_MIN_SIMILARITY
                        and best_overlap >= settings.RAG_MIN_LEXICAL_OVERLAP
                    )
                    # Nhiều từ khóa trùng khớp mạnh có thể bù cho similarity thấp hơn
                    # (câu hỏi dùng từ ngữ đời thường so với phụ đề).
                    or (similarity >= 0.52 and best_overlap >= 0.70)
                )
            if not keep:
                continue

            enriched = {
                **chunk,
                "lexical_overlap": round(overlap, 3),
                "evidence_score": round(evidence_score, 3),
            }
            scored.append((evidence_score, enriched))

        scored.sort(key=lambda item: item[0], reverse=True)
        if not summary_request and scored:
            # Bỏ nguồn kém hơn hẳn nguồn tốt nhất: tránh trích dẫn lan man, sai mốc.
            cutoff = scored[0][0] * settings.RAG_RELATIVE_SCORE_CUTOFF
            scored = [item for item in scored if item[0] >= cutoff]
        # Câu hỏi thường chỉ cần 3 nguồn sát nhất; câu tóm tắt cần nhiều đoạn hơn.
        limit = max(1, settings.RAG_MAX_CHUNKS if summary_request else min(3, settings.RAG_MAX_CHUNKS))
        selected = [chunk for _, chunk in scored[:limit]]
        # Context dễ đọc hơn khi giữ thứ tự đoạn trong bài.
        selected.sort(key=lambda item: item.get("chunk_index", 0))
        return selected

    async def _retrieve_chunks(
        self,
        question: str,
        lesson_id: int,
        top_k: Optional[int] = None,
        chat_history: Optional[Iterable[dict]] = None,
    ) -> List[dict]:
        """Embed truy vấn và lọc bằng chứng trong đúng lesson."""
        retrieval_query = self._build_retrieval_query(question, chat_history)
        try:
            query_embedding = await self.embedder.embed_query(retrieval_query)
            async with AsyncSessionLocal() as db:
                store = PgVectorStore(db)
                candidates = await store.similarity_search_by_lesson(
                    query_embedding=query_embedding,
                    lesson_id=lesson_id,
                    top_k=top_k or max(settings.RAG_CANDIDATE_K, settings.RAG_MAX_CHUNKS),
                    threshold=0.45,
                )
        except Exception as e:
            logger.error("pgvector similarity search failed", error=str(e))
            raise RuntimeError(
                "Không thể truy xuất kho học liệu vector của bài học. Vui lòng thử lại sau."
            ) from e

        selected = self._select_evidence(candidates, retrieval_query, question)
        return await self._expand_neighbors(selected, lesson_id)

    async def _expand_neighbors(
        self, selected: List[dict], lesson_id: int
    ) -> List[dict]:
        """Mở rộng ngữ cảnh sang chunk liền trước/sau trong cùng tài liệu.

        Câu hỏi tổng quan thường cần đoạn kế tiếp mới đủ ý (ví dụ danh sách chủ
        đề bị cắt giữa hai chunk). Chỉ mở rộng khi đã có bằng chứng, nên câu
        ngoài phạm vi vẫn không có ngữ cảnh để trả lời.
        """
        window = max(0, int(settings.RAG_CONTEXT_NEIGHBORS))
        if window == 0 or not selected:
            return selected

        existing_ids = {str(chunk.get("id")) for chunk in selected if chunk.get("id")}
        added: list[dict] = []

        async with AsyncSessionLocal() as db:
            for chunk in selected:
                document_id = chunk.get("document_id")
                index = chunk.get("chunk_index")
                if not document_id or not isinstance(index, int):
                    continue
                rows = (
                    await db.execute(
                        select(
                            DocumentChunk.id,
                            DocumentChunk.lesson_id,
                            DocumentChunk.document_id,
                            DocumentChunk.content,
                            DocumentChunk.chunk_index,
                            DocumentChunk.chunk_metadata,
                        ).where(
                            DocumentChunk.lesson_id == lesson_id,
                            DocumentChunk.document_id == document_id,
                            DocumentChunk.chunk_index.between(
                                max(0, index - window), index + window
                            ),
                        )
                    )
                ).all()
                for row in rows:
                    key = str(row.id)
                    if key in existing_ids:
                        continue
                    existing_ids.add(key)
                    added.append(
                        {
                            "id": key,
                            "lesson_id": row.lesson_id,
                            "document_id": row.document_id,
                            "content": row.content,
                            "chunk_index": row.chunk_index,
                            "metadata": row.chunk_metadata or {},
                            "similarity": None,
                            # Đánh dấu để prompt biết đây là ngữ cảnh bổ sung
                            # quanh đoạn khớp trực tiếp, không phải nguồn hạng nhất.
                            "neighbor": True,
                        }
                    )

        if not added:
            return selected

        merged = selected + added
        # Luôn giữ đủ các đoạn khớp trực tiếp; chỉ cắt bớt phần ngữ cảnh lân
        # cận nếu vượt trần, tránh việc mở rộng lấn át bằng chứng chính.
        max_total = max(len(selected), int(settings.RAG_MAX_CONTEXT_CHUNKS))
        if len(merged) > max_total:
            selected_ids = {str(chunk.get("id")) for chunk in selected}
            keep = [chunk for chunk in merged if str(chunk.get("id")) in selected_ids]
            extras = [
                chunk for chunk in merged if str(chunk.get("id")) not in selected_ids
            ][: max(0, max_total - len(keep))]
            merged = keep + extras
        merged.sort(
            key=lambda item: (
                str(item.get("document_id") or ""),
                int(item.get("chunk_index") or 0),
            )
        )
        cap = max(len(selected), int(settings.RAG_MAX_CONTEXT_CHUNKS))
        return merged[:cap]

    async def ask(
        self,
        question: str,
        lesson_id: int,
        chat_history: Optional[List[dict]] = None,
        top_k: Optional[int] = None,
        lesson_title: Optional[str] = None,
        course_level: Optional[str] = None,
        course_category: Optional[str] = None,
        grade_label: Optional[str] = None,
        target_audience: Optional[str] = None,
        language: Optional[str] = None,
        tutor_mode: Optional[str] = "socratic",
        user_id: Optional[int] = None,
    ) -> dict:
        """RAG không streaming; trả lời thật hoặc nói rõ chưa có trong bài."""
        if not has_valid_google_key():
            raise RuntimeError(NO_API_KEY_MESSAGE)

        chunks = await self._retrieve_chunks(
            question, lesson_id, top_k, chat_history=chat_history
        )
        if not chunks:
            return {
                "answer": build_no_context_answer(lesson_id, lesson_title),
                "sources": [],
                "lesson_id": lesson_id,
                "chunks_used": 0,
            }

        context = self._build_context(chunks)
        system_prompt = build_tutor_system_prompt(
            lesson_id=lesson_id,
            lesson_title=lesson_title,
            course_level=course_level,
            course_category=course_category,
            grade_label=grade_label,
            target_audience=target_audience,
            language=language,
            tutor_mode=tutor_mode,
        )
        user_message = build_rag_user_prompt(
            question=question,
            context=context,
            chat_history=chat_history,
            lesson_title=lesson_title or "",
        )
        full_prompt = f"{system_prompt}\n\n{user_message}"

        try:
            loop = asyncio.get_running_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: self.model.generate_content(full_prompt)),
                timeout=60.0,
            )
        except Exception as e:
            logger.warning("Gemini generate_content failed, switching to Groq fallback", error=str(e))
            answer = await call_groq_fallback(
                question,
                context,
                lesson_id,
                reason="gemini_error",
                chat_history=chat_history,
                lesson_title=lesson_title,
                course_level=course_level,
            )
            await record_usage(
                feature="tutor",
                provider="groq",
                prompt_tokens=estimate_tokens(full_prompt),
                completion_tokens=estimate_tokens(answer),
                is_estimated=True,
                user_id=user_id,
                lesson_id=lesson_id,
            )
        else:
            answer = (response.text or "").strip() if response else ""
            prompt_tokens, completion_tokens, total_tokens, is_real = usage_from_metadata(
                getattr(response, "usage_metadata", None)
            )
            if not is_real:
                prompt_tokens = estimate_tokens(full_prompt)
                completion_tokens = estimate_tokens(answer)
                total_tokens = prompt_tokens + completion_tokens
            await record_usage(
                feature="tutor",
                model=settings.GEMINI_MODEL,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                is_estimated=not is_real,
                user_id=user_id,
                lesson_id=lesson_id,
            )
            if not answer:
                logger.warning("Gemini returned empty content; switching to Groq fallback")
                answer = await call_groq_fallback(
                    question,
                    context,
                    lesson_id,
                    reason="empty",
                    chat_history=chat_history,
                    lesson_title=lesson_title,
                    course_level=course_level,
                )

        return {
            "answer": answer,
            "sources": [self._source_ref(c, lesson_title) for c in chunks],
            "lesson_id": lesson_id,
            "chunks_used": len(chunks),
        }

    async def ask_stream(
        self,
        question: str,
        lesson_id: int,
        chat_history: Optional[List[dict]] = None,
        top_k: Optional[int] = None,
        lesson_title: Optional[str] = None,
        course_level: Optional[str] = None,
        course_category: Optional[str] = None,
        grade_label: Optional[str] = None,
        target_audience: Optional[str] = None,
        language: Optional[str] = None,
        tutor_mode: Optional[str] = "socratic",
        user_id: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream SSE; sources được gửi trước khi sinh câu trả lời."""

        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        async def stream_text(text: str) -> AsyncGenerator[str, None]:
            for word in text.split(" "):
                yield sse({"type": "chunk", "content": word + " ", "token": word + " "})
                await asyncio.sleep(0.015)

        if not has_valid_google_key():
            logger.error("GOOGLE_API_KEY is not configured for AI Service")
            yield sse({"type": "error", "error": NO_API_KEY_MESSAGE})
            yield sse({"type": "done", "done": True})
            return

        try:
            chunks = await self._retrieve_chunks(
                question, lesson_id, top_k, chat_history=chat_history
            )
        except RuntimeError as e:
            logger.error("Embedding failed during document retrieval", error=str(e))
            yield sse({"type": "error", "error": str(e)})
            yield sse({"type": "done", "done": True})
            return
        except Exception as e:
            logger.error("Chunk retrieval failed during streaming", error=str(e))
            chunks = []

        # Không có bằng chứng → nói thật, không gọi LLM để tránh bịa.
        if not chunks:
            async for event in stream_text(build_no_context_answer(lesson_id, lesson_title)):
                yield event
            yield sse({"type": "sources", "data": []})
            yield sse({"type": "done", "done": True})
            return

        sources = [self._source_ref(c, lesson_title) for c in chunks]
        # Gửi nguồn ngay khi truy xuất xong để UI hiển thị trong lúc chờ câu trả lời.
        yield sse({"type": "sources", "data": sources})

        context = self._build_context(chunks)
        system_prompt = build_tutor_system_prompt(
            lesson_id=lesson_id,
            lesson_title=lesson_title,
            course_level=course_level,
            course_category=course_category,
            grade_label=grade_label,
            target_audience=target_audience,
            language=language,
            tutor_mode=tutor_mode,
        )
        user_message = build_rag_user_prompt(
            question=question,
            context=context,
            chat_history=chat_history,
            lesson_title=lesson_title or "",
        )
        full_prompt = f"{system_prompt}\n\n{user_message}"

        streamed_any = False
        gemini_error = None
        response_usage = None
        streamed_chars = 0
        try:
            stream_response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: self.model.generate_content(full_prompt, stream=True),
            )

            for chunk in stream_response:
                if getattr(chunk, "usage_metadata", None):
                    response_usage = chunk.usage_metadata
                if chunk.text:
                    streamed_any = True
                    streamed_chars += len(chunk.text)
                    yield sse({"type": "chunk", "content": chunk.text, "token": chunk.text})
                    await asyncio.sleep(0.01)
        except Exception as e:
            gemini_error = e
            logger.warning("Gemini streaming failed; switching to Groq fallback", error=str(e))

        used_provider = "gemini"
        if not streamed_any:
            used_provider = "groq"
            if has_valid_groq_key():
                logger.info("Streaming qua Groq fallback", lesson_id=lesson_id)
                try:
                    async for chunk_text in groq_stream(
                        prompt=user_message, system_prompt=system_prompt
                    ):
                        if chunk_text:
                            streamed_any = True
                            streamed_chars += len(chunk_text)
                            yield sse(
                                {"type": "chunk", "content": chunk_text, "token": chunk_text}
                            )
                            await asyncio.sleep(0.005)
                except Exception as groq_err:
                    logger.error("Groq streaming fallback failed", error=str(groq_err))
                    yield sse(
                        {
                            "type": "error",
                            "error": "Cả Gemini và Groq đều không khả dụng. Vui lòng thử lại sau.",
                        }
                    )
                    yield sse({"type": "done", "done": True})
                    return
            else:
                err_msg = (
                    format_gemini_error(gemini_error)
                    if gemini_error
                    else "Dịch vụ AI không phản hồi."
                )
                yield sse({"type": "error", "error": err_msg})
                yield sse({"type": "done", "done": True})
                return

        if streamed_any:
            prompt_tokens, completion_tokens, total_tokens, is_real = usage_from_metadata(
                response_usage
            )
            if used_provider != "gemini" or not is_real:
                prompt_tokens = estimate_tokens(full_prompt)
                completion_tokens = max(1, streamed_chars // 4)
                total_tokens = prompt_tokens + completion_tokens
                is_real = False
            await record_usage(
                feature="tutor",
                provider=used_provider,
                model=settings.GEMINI_MODEL if used_provider == "gemini" else None,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                is_estimated=not is_real,
                user_id=user_id,
                lesson_id=lesson_id,
            )

        yield sse({"type": "done", "done": True})

    @staticmethod
    def _source_ref(chunk: dict, lesson_title: Optional[str] = None) -> dict:
        """Chuẩn hóa nguồn trích dẫn, tương thích nguồn tài liệu cũ (page/file).

        `lesson_title` do Backend lấy từ DB gửi sang, để UI hiển thị đủ
        "bài học + video + mốc thời gian" cho mỗi dẫn chứng.
        """
        metadata = chunk.get("metadata") or {}
        start = metadata.get("start_seconds")
        end = metadata.get("end_seconds")
        source_type = metadata.get("source_type")
        if not source_type:
            # Tương thích chunk cũ chưa có source_type: suy ra từ dấu hiệu
            # thời gian/trang thay vì để trống trong trích dẫn.
            if isinstance(start, (int, float)):
                source_type = "youtube_subtitle"
            elif metadata.get("page"):
                source_type = "document"
            else:
                source_type = "transcript" if chunk.get("document_id") else "document"
        return {
            "lesson_title": lesson_title,
            "content": (chunk.get("content") or "")[:200] + "...",
            "similarity": round(chunk["similarity"], 3)
            if isinstance(chunk.get("similarity"), (int, float))
            else None,
            "document_id": chunk.get("document_id"),
            "page": metadata.get("page"),
            "filename": metadata.get("filename") or chunk.get("document_id"),
            "chunk_index": chunk.get("chunk_index", 1),
            "lesson_id": metadata.get("lesson_id"),
            "course_id": metadata.get("course_id"),
            "youtube_video_id": metadata.get("youtube_video_id"),
            "video_title": metadata.get("video_title"),
            "source_type": source_type,
            "start_seconds": start if isinstance(start, (int, float)) else None,
            "end_seconds": end if isinstance(end, (int, float)) else None,
            "start_timestamp": metadata.get("start_timestamp"),
            "end_timestamp": metadata.get("end_timestamp"),
        }

    def _build_context(self, chunks: List[dict]) -> str:
        """Ghép context có nguồn, tên video, mốc thời gian/trang để trích dẫn."""
        sorted_chunks = sorted(chunks, key=lambda x: x.get("chunk_index", 0))
        context_parts = []

        for index, chunk in enumerate(sorted_chunks, 1):
            metadata = chunk.get("metadata") or {}
            title = metadata.get("video_title") or metadata.get("filename") or chunk.get("document_id")
            start_ts = metadata.get("start_timestamp")
            end_ts = metadata.get("end_timestamp")
            page = metadata.get("page")
            if start_ts:
                source_label = f'Video "{title}" [{start_ts}–{end_ts}]' if end_ts else f'Video "{title}" [{start_ts}]'
            elif page:
                source_label = f"{title}, trang {page}"
            else:
                source_label = str(title or "học liệu")
            context_parts.append(f"[Nguồn {index} | {source_label}]\n{chunk['content']}")

        return "\n\n---\n\n".join(context_parts)
