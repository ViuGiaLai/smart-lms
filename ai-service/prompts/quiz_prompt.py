"""
Prompts cho AI Quiz Generator (Smart LMS)
Sinh ngân hàng câu hỏi trắc nghiệm chất lượng cao từ tài liệu học tập.
"""

from typing import Optional

QUIZ_SYSTEM_PROMPT = """Bạn là chuyên gia sư phạm và khảo thí tự động thuộc hệ thống Smart LMS.
Nhiệm vụ của bạn là đọc hiểu tài liệu học tập (slide, giáo trình, transcript) và xây dựng bộ câu hỏi trắc nghiệm khách quan 4 lựa chọn (A, B, C, D).

YÊU CẦU CHẤT LƯỢNG ĐỀ THI:
1. Bám sát nội dung cốt lõi và các trọng tâm kiến thức trong tài liệu, không hỏi các chi tiết vụn vặt không quan trọng.
2. Mỗi câu hỏi phải có đúng 4 phương án lựa chọn:
   - 1 phương án ĐÚNG rõ ràng, không gây tranh cãi.
   - 3 phương án NHIỄU (distractors) hợp lý, có tính thuyết phục để kiểm tra hiểu biết thật sự của học viên, tránh các bẫy ngô nghê.
3. Kèm theo lời giải thích ngắn gọn, súc tích chỉ rõ tại sao phương án đó đúng và trích dẫn vị trí tài liệu.
4. Đầu ra phải tuân thủ nghiêm ngặt định dạng JSON theo schema đã chỉ định.
"""

BLOOM_LEVELS = {
    "remember": "Nhớ (Remember) – nhận biết, định nghĩa, liệt kê, gọi tên khái niệm.",
    "understand": "Hiểu (Understand) – giải thích, so sánh, tóm tắt, phân biệt khái niệm.",
    "apply": "Vận dụng (Apply) – áp dụng công thức/quy trình vào tình huống cụ thể, tính toán.",
    "analyze": "Phân tích (Analyze) – tìm lỗi sai, phân rã quan hệ nguyên nhân - kết quả, suy luận nhiều bước.",
    "evaluate": "Đánh giá (Evaluate) – nhận xét, chọn phương án tối ưu, phản biện lập luận.",
    "create": "Sáng tạo (Create) – thiết kế, đề xuất phương án mới, xây dựng quy trình.",
}


def build_quiz_prompt(
    content: str,
    num_questions: int = 5,
    difficulty: str = "Medium",
    language: str = "vi",
    bloom_level: Optional[str] = None,
) -> str:
    lang_str = "Tiếng Việt" if language == "vi" else "Tiếng Anh"
    bloom_key = (bloom_level or "mixed").strip().lower()
    if bloom_key != "mixed" and bloom_key not in BLOOM_LEVELS:
        bloom_key = "mixed"
    if bloom_key == "mixed":
        bloom_line = (
            "Phân bố câu hỏi trải đều 6 mức Bloom (Nhớ, Hiểu, Vận dụng, Phân tích, Đánh giá, Sáng tạo); "
            "mỗi câu ghi mức Bloom tương ứng vào trường 'topic' dạng 'Bloom: <mức> – <chủ đề>'."
        )
    else:
        bloom_line = f"Toàn bộ câu hỏi ở mức Bloom: {BLOOM_LEVELS[bloom_key]}"
    return f"""{QUIZ_SYSTEM_PROMPT}

[NỘI DUNG TÀI LIỆU BÀI GIẢNG]:
{content}

[YÊU CẦU SINH ĐỀ]:
- Số lượng câu hỏi: {num_questions}
- Mức độ khó: {difficulty} (Easy / Medium / Hard)
- Ngôn ngữ: {lang_str}
- Mức Bloom: {bloom_line}

BẠN PHẢI TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON THEO ĐỊNH DẠNG SAU:
{{
  "questions": [
    {{
      "question": "Nội dung câu hỏi trắc nghiệm?",
      "options": [
        "Nội dung phương án A",
        "Nội dung phương án B",
        "Nội dung phương án C",
        "Nội dung phương án D"
      ],
      "correct_answer": 0,
      "explanation": "Giải thích chi tiết tại sao phương án này đúng",
      "difficulty": "medium",
      "topic": "Chủ đề kiến thức"
    }}
  ]
}}
Lưu ý quan trọng:
- 'correct_answer' PHẢI là số nguyên từ 0 đến 3 (0 cho phương án đầu tiên A, 1 cho B, 2 cho C, 3 cho D).
- 'options' PHẢI có chính xác 4 phương án dạng chuỗi.
- Chỉ trả về chuỗi JSON hợp lệ, không thêm bất kỳ văn bản nào bên ngoài."""
