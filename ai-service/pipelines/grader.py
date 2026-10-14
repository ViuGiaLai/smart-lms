"""
Smart LMS - Essay Grader Pipeline
Chấm bài tự luận theo Rubric sử dụng Gemini.

Flow:
  1. Nhận bài làm của học sinh + rubric tiêu chí chấm
  2. Gọi Gemini với prompt chấm theo từng tiêu chí
  3. Parse kết quả JSON → GradingResult Pydantic model
  4. Tính tổng điểm và nhận xét chung
"""

import asyncio
import json
import re
from typing import List, Optional
import structlog

import google.generativeai as genai

from core.config import settings
from schemas.grader_schema import (
    GradingResult,
    CriteriaScore,
    RubricCriteria,
    GradingRequest,
)
from prompts.grader_prompt import build_grader_prompt

logger = structlog.get_logger(__name__)

genai.configure(api_key=settings.GOOGLE_API_KEY)


class EssayGrader:
    """
    Chấm bài tự luận theo Rubric sử dụng Gemini.

    Rubric-based grading:
    - Mỗi tiêu chí có điểm tối đa (max_score)
    - Gemini đánh giá từng tiêu chí → điểm + nhận xét
    - Tổng hợp điểm và nhận xét cuối
    """

    def __init__(self):
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            generation_config={
                "temperature": 0.2,       # Thấp để chấm điểm nhất quán
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 3000,
                "response_mime_type": "application/json",
            },
        )

    async def grade(self, request: GradingRequest) -> GradingResult:
        """
        Chấm bài theo rubric.

        Args:
            request: GradingRequest bao gồm:
                - student_answer: Bài làm của học sinh
                - rubric: List tiêu chí chấm (RubricCriteria)
                - question: Câu hỏi/đề bài (optional)
                - max_total_score: Tổng điểm tối đa

        Returns:
            GradingResult với điểm từng tiêu chí + tổng điểm + nhận xét
        """
        logger.info(
            "Grading essay",
            student_answer_length=len(request.student_answer),
            rubric_criteria_count=len(request.rubric),
            max_total_score=request.max_total_score,
        )

        # Build prompt
        prompt = build_grader_prompt(
            student_answer=request.student_answer,
            rubric=request.rubric,
            question=request.question,
            max_total_score=request.max_total_score,
        )

        # Gọi Gemini
        raw_json = await self._call_gemini(prompt)

        # Parse kết quả
        result = self._parse_grading_response(raw_json, request)

        logger.info(
            "Essay graded",
            total_score=result.total_score,
            max_score=result.max_total_score,
            percentage=result.percentage,
        )

        return result

    async def _call_gemini(self, prompt: str) -> str:
        """Gọi Gemini API async."""
        for attempt in range(3):
            try:
                response = await asyncio.get_running_loop().run_in_executor(
                    None,
                    lambda: self.model.generate_content(prompt),
                )
                return response.text
            except Exception as e:
                logger.warning("Grader API error", attempt=attempt + 1, error=str(e))
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)

    def _parse_grading_response(
        self, raw_json: str, request: GradingRequest
    ) -> GradingResult:
        """Parse JSON response thành GradingResult."""
        # Trích xuất JSON từ markdown nếu cần
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_json)
        if json_match:
            raw_json = json_match.group(1)

        # Tìm JSON start
        json_start = raw_json.find("{")
        if json_start >= 0:
            raw_json = raw_json[json_start:]

        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse grader response", error=str(e))
            # Fallback: tạo result mặc định với điểm 0
            return self._create_fallback_result(request, str(e))

        # Parse từng criteria score
        criteria_scores = []
        criteria_data = data.get("criteria_scores", data.get("tiêu_chí", []))

        for i, criteria in enumerate(request.rubric):
            # Tìm score tương ứng trong response
            score_data = None
            if i < len(criteria_data):
                score_data = criteria_data[i]
            else:
                # Tìm theo tên tiêu chí
                for sd in criteria_data:
                    if criteria.name.lower() in sd.get("name", "").lower():
                        score_data = sd
                        break

            if score_data:
                earned = min(
                    float(score_data.get("score", score_data.get("điểm", 0))),
                    criteria.max_score,
                )
                comment = score_data.get("comment", score_data.get("nhận_xét", ""))
            else:
                earned = 0.0
                comment = "Không thể đánh giá tiêu chí này."

            criteria_scores.append(
                CriteriaScore(
                    criteria_name=criteria.name,
                    criteria_description=criteria.description,
                    max_score=criteria.max_score,
                    earned_score=earned,
                    comment=comment,
                )
            )

        # Tính tổng điểm
        total_score = sum(cs.earned_score for cs in criteria_scores)
        max_total = request.max_total_score or sum(c.max_score for c in request.rubric)

        # Nhận xét chung từ Gemini
        overall_feedback = data.get(
            "overall_feedback",
            data.get("nhận_xét_chung", ""),
        )

        # Xác định mức độ đạt
        percentage = (total_score / max_total * 100) if max_total > 0 else 0
        grade_level = self._calculate_grade_level(percentage)

        return GradingResult(
            total_score=round(total_score, 2),
            max_total_score=max_total,
            percentage=round(percentage, 1),
            grade_level=grade_level,
            criteria_scores=criteria_scores,
            overall_feedback=overall_feedback,
            strengths=data.get("strengths", data.get("điểm_mạnh", [])),
            improvements=data.get("improvements", data.get("cần_cải_thiện", [])),
        )

    def _create_fallback_result(
        self, request: GradingRequest, error_msg: str
    ) -> GradingResult:
        """Tạo kết quả fallback khi parse thất bại."""
        max_total = request.max_total_score or sum(c.max_score for c in request.rubric)
        criteria_scores = [
            CriteriaScore(
                criteria_name=c.name,
                criteria_description=c.description,
                max_score=c.max_score,
                earned_score=0.0,
                comment=f"Lỗi chấm điểm: {error_msg}",
            )
            for c in request.rubric
        ]
        return GradingResult(
            total_score=0.0,
            max_total_score=max_total,
            percentage=0.0,
            grade_level="F",
            criteria_scores=criteria_scores,
            overall_feedback="Có lỗi xảy ra trong quá trình chấm bài. Vui lòng thử lại.",
            strengths=[],
            improvements=[],
        )

    @staticmethod
    def _calculate_grade_level(percentage: float) -> str:
        """Quy đổi % điểm thành mức xếp loại."""
        if percentage >= 90:
            return "A"  # Xuất sắc
        elif percentage >= 80:
            return "B"  # Giỏi
        elif percentage >= 70:
            return "C"  # Khá
        elif percentage >= 60:
            return "D"  # Trung bình
        else:
            return "F"  # Yếu
