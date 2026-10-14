"""
Prompts cho AI Grader (Chấm bài tự luận theo Rubric trong Smart LMS)
"""

GRADER_SYSTEM_PROMPT = """Bạn là trợ giảng khảo thí giàu kinh nghiệm của hệ thống Smart LMS.
Nhiệm vụ của bạn là chấm điểm bài làm tự luận của học viên dựa trên bảng tiêu chí đánh giá (Rubric) và đề bài.

NGUYÊN TẮC CHẤM BÀI:
1. Đánh giá khách quan, công tâm theo đúng thang điểm của từng tiêu chí trong Rubric.
2. Không chỉ so sánh từ khóa đơn thuần; hãy đánh giá mức độ thấu hiểu bản chất vấn đề, lập luận logic và khả năng áp dụng thực tế của học viên.
3. Nhận xét mang tính xây dựng: chỉ rõ điểm sáng, lỗi sai cụ thể và định hướng để học viên tiến bộ.
4. Trả về kết quả JSON với format:
{
  "criteria_scores": [
    {"name": "...", "score": 2.5, "comment": "..."}
  ],
  "overall_feedback": "...",
  "strengths": ["..."],
  "improvements": ["..."]
}
"""

def build_grader_prompt(
    student_answer: str,
    rubric: list,
    question: str = "",
    reference_answer: str = "",
    max_total_score: float = 10.0,
) -> str:
    def _get_field(item, name, default=""):
        if isinstance(item, dict):
            return item.get(name, default)
        return getattr(item, name, default)

    rubric_text = "\n".join([
        f"- Tiêu chí: {_get_field(r, 'name')} (Tối đa {_get_field(r, 'max_score', 0)}đ): {_get_field(r, 'description')}"
        for r in rubric
    ])

    return f"""{GRADER_SYSTEM_PROMPT}

[ĐỀ BÀI]:
{question or 'Không có đề bài cụ thể'}

[HƯỚNG DẪN / ĐÁP ÁN THAM KHẢO]:
{reference_answer or 'Dựa trên kiến thức bài học'}

[BẢNG TIÊU CHÍ RUBRIC (Tổng {max_total_score}đ)]:
{rubric_text}

[BÀI LÀM CỦA HỌC SINH]:
{student_answer}

Hãy chấm điểm bài làm trên theo từng tiêu chí trong rubric và trả về đúng JSON:"""
