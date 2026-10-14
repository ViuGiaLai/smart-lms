"""
Smart LMS - Summarizer Pipeline
Tóm tắt bài giảng thành bullet points và flashcards.

Output:
  - summary: Tóm tắt ngắn gọn (paragraph)
  - key_points: Các điểm chính (bullet points)
  - flashcards: Cặp câu hỏi-trả lời để ôn tập
  - keywords: Từ khóa quan trọng
"""

import asyncio
import json
import re
from typing import List, Optional
import structlog

import google.generativeai as genai
from pydantic import BaseModel

from core.config import settings

logger = structlog.get_logger(__name__)

genai.configure(api_key=settings.GOOGLE_API_KEY)


# ===== Output Schemas =====
class Flashcard(BaseModel):
    """Một flashcard học tập."""
    question: str   # Câu hỏi mặt trước
    answer: str     # Câu trả lời mặt sau
    topic: str = "" # Chủ đề (optional)


class SummaryResult(BaseModel):
    """Kết quả tóm tắt đầy đủ."""
    summary: str                    # Tóm tắt ngắn gọn (2-3 câu)
    key_points: List[str]           # Các điểm chính bullet
    flashcards: List[Flashcard]     # Flashcards ôn tập
    keywords: List[str]             # Từ khóa quan trọng
    lesson_id: Optional[int] = None


class LectureSummarizer:
    """
    Tóm tắt bài giảng thành nhiều dạng output để hỗ trợ học tập.
    """

    # System prompt cho summarizer
    SYSTEM_PROMPT = """Bạn là một trợ lý giáo dục thông minh, chuyên tóm tắt bài giảng.
Nhiệm vụ của bạn là phân tích nội dung bài giảng và tạo:
1. Tóm tắt ngắn gọn súc tích
2. Các điểm chính dạng bullet points  
3. Flashcards để ôn tập
4. Từ khóa quan trọng

Luôn trả lời bằng tiếng Việt, rõ ràng, dễ hiểu, phù hợp cho học sinh."""

    def __init__(self):
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0.4,
                "top_p": 0.85,
                "max_output_tokens": 3000,
                "response_mime_type": "application/json",
            },
        )

    async def summarize(
        self,
        content: str,
        num_key_points: int = 10,
        num_flashcards: int = 10,
        lesson_id: Optional[int] = None,
    ) -> SummaryResult:
        """
        Tóm tắt bài giảng.

        Args:
            content: Nội dung bài giảng cần tóm tắt
            num_key_points: Số bullet points cần tạo
            num_flashcards: Số flashcard cần tạo
            lesson_id: ID bài học

        Returns:
            SummaryResult với summary, key_points, flashcards, keywords
        """
        # Giới hạn input length
        if len(content) > 40000:
            logger.warning("Content truncated for summarizer")
            content = content[:40000] + "\n...[Nội dung tiếp theo đã bị cắt]"

        prompt = self._build_prompt(content, num_key_points, num_flashcards)

        logger.info(
            "Summarizing lecture",
            content_length=len(content),
            num_key_points=num_key_points,
            num_flashcards=num_flashcards,
            lesson_id=lesson_id,
        )

        raw_json = await self._call_gemini(prompt)
        result = self._parse_response(raw_json, lesson_id)

        logger.info(
            "Summarization complete",
            key_points=len(result.key_points),
            flashcards=len(result.flashcards),
            keywords=len(result.keywords),
        )

        return result

    def _build_prompt(
        self, content: str, num_key_points: int, num_flashcards: int
    ) -> str:
        """Build prompt cho Gemini."""
        return f"""{self.SYSTEM_PROMPT}

=== NỘI DUNG BÀI GIẢNG ===
{content}

=== YÊU CẦU OUTPUT ===
Trả về JSON theo schema sau (không thêm text ngoài JSON):
{{
    "summary": "Tóm tắt ngắn gọn bài giảng trong 2-3 câu",
    "key_points": [
        "Điểm chính 1: ...",
        "Điểm chính 2: ...",
        ... (tạo {num_key_points} điểm chính)
    ],
    "flashcards": [
        {{
            "question": "Câu hỏi mặt trước flashcard",
            "answer": "Câu trả lời mặt sau",
            "topic": "Chủ đề"
        }},
        ... (tạo {num_flashcards} flashcard)
    ],
    "keywords": ["từ khóa 1", "từ khóa 2", ... (10-15 từ khóa quan trọng)]
}}

Lưu ý:
- Flashcards phải dạng hỏi-đáp, câu hỏi rõ ràng có thể tự học
- Key points bắt đầu bằng động từ hành động
- Keywords là thuật ngữ chuyên môn quan trọng
- Tất cả bằng tiếng Việt"""

    async def _call_gemini(self, prompt: str) -> str:
        """Gọi Gemini với retry."""
        for attempt in range(3):
            try:
                response = await asyncio.get_running_loop().run_in_executor(
                    None,
                    lambda: self.model.generate_content(prompt),
                )
                return response.text
            except Exception as e:
                logger.warning("Summarizer API error", attempt=attempt + 1, error=str(e))
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)

    def _parse_response(self, raw_json: str, lesson_id: Optional[int]) -> SummaryResult:
        """Parse JSON response từ Gemini."""
        # Trích xuất JSON từ markdown
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_json)
        if json_match:
            raw_json = json_match.group(1)

        json_start = raw_json.find("{")
        if json_start >= 0:
            raw_json = raw_json[json_start:]

        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            logger.error("Failed to parse summarizer JSON")
            return SummaryResult(
                summary="Không thể tóm tắt nội dung này.",
                key_points=[],
                flashcards=[],
                keywords=[],
                lesson_id=lesson_id,
            )

        # Parse flashcards
        flashcards = []
        for fc in data.get("flashcards", []):
            try:
                flashcards.append(
                    Flashcard(
                        question=fc.get("question", fc.get("câu_hỏi", "")),
                        answer=fc.get("answer", fc.get("câu_trả_lời", "")),
                        topic=fc.get("topic", fc.get("chủ_đề", "")),
                    )
                )
            except Exception:
                pass

        return SummaryResult(
            summary=data.get("summary", data.get("tóm_tắt", "")),
            key_points=data.get("key_points", data.get("điểm_chính", [])),
            flashcards=flashcards,
            keywords=data.get("keywords", data.get("từ_khóa", [])),
            lesson_id=lesson_id,
        )
