"""
Smart LMS - AI Discovery Pipeline
Tự động khám phá học liệu, lĩnh vực, chương trình đào tạo, video YouTube thực tế
và cấu trúc bài học theo chủ đề được yêu cầu.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Optional
import google.generativeai as genai
import structlog

from core.config import settings
from core.groq_client import groq_generate, has_valid_groq_key

logger = structlog.get_logger(__name__)

DISCOVERY_SYSTEM_PROMPT = """Bạn là Chuyên gia Phát triển Chương trình Đào tạo & AI Discovery của Smart LMS (Trường Đại học Đông Á).
Nhiệm vụ của bạn là nghiên cứu, khám phá và đề xuất cấu trúc khóa học hoàn chỉnh dựa trên chủ đề, bậc đào tạo đại học và chuyên ngành được yêu cầu.

YÊU CẦU BẮT BUỘC:
1. Đảm bảo tính khoa học và sư phạm bậc đại học: Phân chia bài học từ nền tảng lý thuyết đến ứng dụng thực tiễn / đồ án.
2. Trả về đúng định dạng JSON hợp lệ (không chứa markdown backticks ngoài JSON nếu được yêu cầu).
3. Đề xuất video bài giảng YouTube thực tế hoặc mẫu bài giảng chuẩn sư phạm.
4. Nêu rõ mục tiêu đầu ra (outcomes theo chuẩn Bloom), yêu cầu tiên quyết (prerequisites), và giáo trình tham khảo (references).

CẤU TRÚC JSON MẪU:
{
  "course_title": "Tên học phần / khóa học đại học",
  "domain": "Khoa / Chuyên ngành",
  "category_slug": "slug-danh-muc",
  "level_code": "GENERAL | FOUNDATION | MAJOR | CAPSTONE | CERTIFICATION | POSTGRADUATE",
  "grade_label": "Bậc học (VD: Năm 1 - Đại cương, Năm 2 - Cơ sở ngành, Năm 3 - Chuyên ngành, Đồ án tốt nghiệp, Chuẩn đầu ra)",
  "proficiency_level": "Nền tảng | Chuyên sâu | Nâng cao",
  "target_audience": "Sinh viên Trường Đại học Đông Á",
  "language": "vi",
  "description": "Mô tả học phần chi tiết theo đề cương chi tiết",
  "summary": "Tóm tắt đề xuất chương trình",
  "outcomes": ["Mục tiêu chuẩn đầu ra 1", "Mục tiêu chuẩn đầu ra 2"],
  "prerequisites": ["Học phần tiên quyết 1"],
  "lessons": [
    {
      "title": "Bài 1: Tên bài giảng",
      "description": "Mô tả nội dung bài giảng",
      "video_url": "https://www.youtube.com/watch?v=...",
      "duration": 2700,
      "transcript_summary": "Tóm tắt nội dung chính và mốc thời gian",
      "resources_url": "Slide_Bai_1.pdf"
    }
  ],
  "references": [
    {
      "title": "Tên giáo trình / tài liệu tham khảo",
      "provider": "Nhà xuất bản / Giảng viên ĐH Đông Á",
      "url": "https://...",
      "type": "pdf | web"
    }
  ]
}
"""


class DiscoveryPipeline:
    def __init__(self):
        try:
            self.model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                generation_config={"temperature": 0.3},
            )
        except Exception:
            self.model = None

    async def discover(
        self,
        topic: str,
        target_level: Optional[str] = None,
        domain_category: Optional[str] = None,
        target_audience: Optional[str] = None,
    ) -> dict[str, Any]:
        """Khám phá và sinh cấu trúc khóa học hoàn chỉnh bằng AI."""
        user_prompt = f"""Hãy khám phá và xây dựng chương trình đào tạo cho:
- Chủ đề: {topic}
- Cấp học/Trình độ mong muốn: {target_level or 'Tự động phát hiện'}
- Lĩnh vực: {domain_category or 'Tự động phát hiện'}
- Đối tượng: {target_audience or 'Học viên'}

Hãy sinh từ 3 đến 6 bài học có thứ tự logic và tài liệu tham khảo. Trả về đúng định dạng JSON theo schema đã chỉ định."""

        full_prompt = f"{DISCOVERY_SYSTEM_PROMPT}\n\n{user_prompt}"

        raw_text = ""
        # 1. Thử gọi Gemini
        if self.model and (settings.GOOGLE_API_KEY or "").strip():
            try:
                loop = asyncio.get_running_loop()
                response = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: self.model.generate_content(full_prompt)),
                    timeout=35.0,
                )
                raw_text = (response.text or "").strip()
            except Exception as e:
                logger.warning("Gemini discovery failed, trying Groq fallback", error=str(e))

        # 2. Fallback Groq nếu Gemini lỗi
        if not raw_text and has_valid_groq_key():
            try:
                raw_text = await groq_generate(
                    prompt=user_prompt,
                    system_prompt=DISCOVERY_SYSTEM_PROMPT,
                    temperature=0.3,
                )
            except Exception as e:
                logger.error("Groq discovery failed", error=str(e))

        # 3. Parse JSON
        if raw_text:
            cleaned = re.sub(r"^```json\s*", "", raw_text.strip(), flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned.strip())
            try:
                data = json.loads(cleaned)
                if isinstance(data, dict) and "lessons" in data:
                    return data
            except json.JSONDecodeError:
                # Cố trích xuất object JSON
                m = re.search(r"\{.*\}", cleaned, re.DOTALL)
                if m:
                    try:
                        return json.loads(m.group(0))
                    except Exception:
                        pass

        # 4. Fallback cấu trúc chất lượng cao nếu cả hai mô hình đều không sẵn sàng
        return {
            "course_title": f"{topic} – Học phần Đào tạo Chuẩn ĐH Đông Á",
            "domain": domain_category or "Khoa Công nghệ Thông tin",
            "category_slug": "ky-thuat-phan-mem",
            "level_code": "MAJOR",
            "grade_label": target_level or "Chuyên ngành (Năm 3)",
            "proficiency_level": "Đại học / Chuyên sâu",
            "target_audience": target_audience or "Sinh viên Trường Đại học Đông Á",
            "language": "vi",
            "description": f"Đề cương học phần đào tạo có cấu trúc hoàn chỉnh về {topic}.",
            "summary": f"Đề xuất giáo trình học phần trọng tâm về {topic} cho sinh viên ĐH Đông Á.",
            "outcomes": [
                f"Nắm vững các khái niệm nền tảng của {topic}",
                "Giải quyết các bài tập và tình huống ứng dụng thực tiễn",
            ],
            "prerequisites": ["Sẵn sàng học tập"],
            "lessons": [
                {
                    "title": f"Bài 1: Giới thiệu và Nguyên lý cơ bản về {topic}",
                    "description": "Nắm bắt bức tranh tổng quan và các khái niệm đầu tiên.",
                    "video_url": "https://www.youtube.com/watch?v=0k2G_Z4qZpQ",
                    "duration": 1800,
                    "transcript_summary": "[00:00 - 10:00] Tổng quan.\n[10:01 - 30:00] Khái niệm cốt lõi.",
                    "resources_url": "Slide_01.pdf",
                },
                {
                    "title": f"Bài 2: Phương pháp & Kỹ năng Trọng tâm",
                    "description": "Các kỹ thuật và kiến thức trọng yếu.",
                    "video_url": "https://www.youtube.com/watch?v=tSLZXqY3X_0",
                    "duration": 2400,
                    "transcript_summary": "[00:00 - 15:00] Kỹ năng cốt lõi.\n[15:01 - 40:00] Thực hành.",
                    "resources_url": "Slide_02.pdf",
                },
            ],
            "references": [
                {"title": "Open Educational Resources", "provider": "OER", "url": "https://oer.org", "type": "web"}
            ],
        }
