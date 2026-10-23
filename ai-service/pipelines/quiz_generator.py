"""
Smart LMS - Quiz Generator Pipeline
Sinh câu hỏi trắc nghiệm từ nội dung tài liệu dùng Gemini + Pydantic Structured Output.

Flow:
  1. Nhận nội dung tài liệu (text) + tham số (số câu, độ khó, ...)
  2. Gọi Gemini với prompt cấu trúc → JSON output
  3. Parse và validate kết quả bằng Pydantic
  4. Trả về QuizSet chuẩn
"""

import asyncio
import json
import re
from typing import List, Optional
import structlog

import google.generativeai as genai

from core.config import settings
from schemas.quiz_schema import QuizQuestion, QuizSet, DifficultyLevel
from prompts.quiz_prompt import build_quiz_prompt

logger = structlog.get_logger(__name__)

# Cấu hình Gemini
genai.configure(api_key=settings.GOOGLE_API_KEY)


class QuizGenerator:
    """
    Sinh câu hỏi trắc nghiệm từ nội dung bài giảng.

    Đặc điểm:
    - Pydantic Structured Output: đảm bảo format JSON nhất quán
    - Đa dạng độ khó: dễ, trung bình, khó
    - Bloom's Taxonomy: câu hỏi đa dạng từ nhớ → phân tích
    - Giải thích đáp án: mỗi câu có explanation chi tiết
    """

    def __init__(self):
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0.7,       # Cao hơn để sinh câu hỏi đa dạng
                "top_p": 0.9,
                "top_k": 40,
                "max_output_tokens": 4096,
                "response_mime_type": "application/json",  # Yêu cầu JSON output
            },
        )

    async def generate(
        self,
        content: str,
        num_questions: int = 10,
        difficulty: DifficultyLevel = DifficultyLevel.MIXED,
        lesson_id: Optional[int] = None,
        language: str = "vi",
    ) -> QuizSet:
        """
        Sinh câu hỏi trắc nghiệm từ nội dung với cơ chế đa mô hình dự phòng (Cascading Multi-Model Fallback).
        """
        # Giới hạn input để tránh token overflow
        if len(content) > 30000:
            logger.warning("Content too long, truncating", original_len=len(content))
            content = content[:30000] + "\n...[Nội dung bị cắt bớt]"

        # Clamp num_questions
        num_questions = max(1, min(num_questions, 50))

        # Build prompt
        prompt = build_quiz_prompt(
            content=content,
            num_questions=num_questions,
            difficulty=str(difficulty.value if hasattr(difficulty, "value") else difficulty),
            language=language,
        )

        logger.info(
            "Generating quiz",
            num_questions=num_questions,
            difficulty=difficulty,
            lesson_id=lesson_id,
            content_length=len(content),
        )

        # Gọi Gemini với cơ chế fallback nhiều tầng (Multi-model & Smart Fallback)
        raw_json = await self._call_gemini_with_fallback(
            prompt=prompt,
            content=content,
            num_questions=num_questions,
            difficulty=str(difficulty.value if hasattr(difficulty, "value") else difficulty),
        )

        # Parse và validate với Pydantic
        quiz_set = self._parse_quiz_response(raw_json, lesson_id)

        logger.info(
            "Quiz generated successfully",
            questions_generated=len(quiz_set.questions),
            lesson_id=lesson_id,
        )

        return quiz_set

    async def _call_gemini_with_fallback(
        self,
        prompt: str,
        content: str,
        num_questions: int = 5,
        difficulty: str = "medium",
    ) -> str:
        """
        Gọi Gemini với cơ chế luân chuyển nhiều mô hình (Cascading Models).
        Nếu gặp lỗi 429 Quota Exceeded trên một model, tự động chuyển sang model kế tiếp.
        Nếu toàn bộ API đều cạn quota hoặc mất kết nối, pipeline sẽ báo lỗi rõ ràng
        thay vì trả về câu hỏi bịa đặt không bám sát học liệu thật.
        """
        # Danh sách mô hình theo thứ tự ưu tiên
        candidate_models = [settings.GEMINI_MODEL]
        fallback_models = getattr(
            settings,
            "GEMINI_FALLBACK_MODELS",
            ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-pro-latest"],
        )
        for m in fallback_models:
            if m not in candidate_models:
                candidate_models.append(m)

        last_error = None

        for model_name in candidate_models:
            try:
                logger.info("Attempting quiz generation with model", model=model_name)
                gen_model = genai.GenerativeModel(
                    model_name=model_name,
                    generation_config={
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "top_k": 40,
                        "max_output_tokens": 4096,
                        "response_mime_type": "application/json",
                    },
                )

                response = await asyncio.get_running_loop().run_in_executor(
                    None,
                    lambda: gen_model.generate_content(prompt),
                )
                if response and response.text and response.text.strip():
                    logger.info("Gemini generation succeeded with model", model=model_name)
                    return response.text

            except Exception as e:
                last_error = e
                err_str = str(e)
                logger.warning(
                    "Model attempt encountered error, trying next candidate",
                    model=model_name,
                    error=err_str[:120],
                )
                continue

        # Không tự sinh câu hỏi giả khi toàn bộ mô hình không khả dụng.
        logger.error(
            "All Gemini models exhausted quota or unavailable. No quiz generated.",
            last_error=str(last_error)[:200],
        )
        raise RuntimeError(
            "Không thể sinh câu hỏi trắc nghiệm: toàn bộ mô hình Gemini đều không khả dụng "
            "(hết quota hoặc lỗi kết nối). Vui lòng thử lại sau."
        )

    def _parse_quiz_response(
        self, raw_json: str, lesson_id: Optional[int]
    ) -> QuizSet:
        """
        Parse JSON response từ Gemini thành QuizSet Pydantic model.
        Xử lý các edge cases: JSON trong markdown code block, extra text, ...
        """
        # Trích xuất JSON từ markdown code block nếu có
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_json)
        if json_match:
            raw_json = json_match.group(1)

        # Tìm JSON object/array đầu tiên và điểm kết thúc phù hợp
        raw_json = raw_json.strip()
        idx_brace = raw_json.find("{")
        idx_bracket = raw_json.find("[")

        if idx_bracket != -1 and (idx_brace == -1 or idx_bracket < idx_brace):
            # Bắt đầu bằng array [...]
            last_bracket = raw_json.rfind("]")
            if last_bracket != -1:
                raw_json = raw_json[idx_bracket : last_bracket + 1]
        elif idx_brace != -1:
            # Bắt đầu bằng object {...}
            last_brace = raw_json.rfind("}")
            if last_brace != -1:
                raw_json = raw_json[idx_brace : last_brace + 1]

        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Gemini JSON response", error=str(e), raw=raw_json[:500])
            raise ValueError(f"Gemini trả về JSON không hợp lệ: {e}")

        # Handle cả dạng: {"questions": [...]} và [...]
        if isinstance(data, list):
            questions_data = data
        elif isinstance(data, dict):
            questions_data = data.get("questions", data.get("quiz", []))
        else:
            questions_data = []

        # Validate từng câu hỏi với Pydantic
        questions = []
        for i, q in enumerate(questions_data):
            try:
                raw_q = q.get("question") or q.get("question_text") or q.get("câu_hỏi") or ""
                raw_opts = q.get("options") or q.get("đáp_án") or []
                if not isinstance(raw_opts, list) or len(raw_opts) != 4:
                    raise ValueError("Câu hỏi phải có đúng 4 phương án")
                normalized_opts = []
                for opt_idx, opt in enumerate(raw_opts):
                    key = chr(65 + opt_idx)
                    text = opt.get("text", "") if isinstance(opt, dict) else str(opt)
                    normalized_opts.append({"key": key, "text": text})
                raw_ans = q.get("correct_answer") if q.get("correct_answer") is not None else q.get("đáp_án_đúng")

                # Chuẩn hóa raw_ans sang index số nguyên
                normalized_ans = 0
                if isinstance(raw_ans, int):
                    normalized_ans = raw_ans
                elif isinstance(raw_ans, str):
                    raw_ans_strip = raw_ans.strip()
                    if raw_ans_strip.isdigit():
                        normalized_ans = int(raw_ans_strip)
                    elif raw_ans_strip.upper() in ["A", "B", "C", "D"]:
                        normalized_ans = ["A", "B", "C", "D"].index(raw_ans_strip.upper())
                    else:
                        # Thử match với nội dung trong raw_opts
                        found = False
                        for opt_idx, opt_val in enumerate(normalized_opts):
                            opt_text = opt_val["text"]
                            if raw_ans_strip.lower() in opt_text.lower() or opt_text.lower() in raw_ans_strip.lower():
                                normalized_ans = opt_idx
                                found = True
                                break
                        if not found:
                            normalized_ans = 0

                question = QuizQuestion(
                    question_number=i + 1,
                    question=raw_q,
                    options=normalized_opts,
                    correct_answer=normalized_ans,
                    explanation=q.get("explanation", q.get("giải_thích", "")),
                    difficulty=q.get("difficulty", q.get("difficulty_level", q.get("độ_khó", "medium"))),
                    topic=q.get("topic", q.get("chủ_đề", "")),
                )
                questions.append(question)
            except Exception as e:
                logger.error("Invalid generated question", index=i, error=str(e))
                raise ValueError(f"Câu hỏi AI thứ {i + 1} không hợp lệ: {e}") from e

        if not questions:
            raise ValueError("AI không tạo được câu hỏi hợp lệ")

        return QuizSet(
            lesson_id=lesson_id,
            questions=questions,
            total_questions=len(questions),
        )
