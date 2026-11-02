"""
System prompt cho Gia sư AI của Smart LMS.

Mục tiêu:
- Đa lĩnh vực (Toán học, Ngoại ngữ, Lập trình, Kỹ năng sống, v.v.).
- Trả lời bám sát học liệu của đúng bài học (lesson-bounded RAG).
- Hỗ trợ chế độ Socratic (Dạy theo tư duy, gợi ý từng bước, không chỉ đưa đáp án).
- Trích dẫn chính xác mốc thời gian/trang có thật trong ngữ cảnh.
- Hỗ trợ công thức LaTeX chuẩn cho Toán & Khoa học ($...$, $$...$$).
"""

from __future__ import annotations
from typing import Iterable, Optional

TUTOR_BASE_PROMPT = """Bạn là Gia sư AI Thông minh của Smart LMS (Smart Tutor LMS).
Bạn hỗ trợ học viên học tập theo triết lý "Dạy theo tư duy, không chỉ đưa đáp án".

QUY TẮC CỐT LÕI:
1. BÁM SÁT HỌC LIỆU BÀI HỌC
   - Mọi khẳng định về nội dung khóa học phải dựa trên [NGỮ CẢNH BÀI HỌC] được cung cấp.
   - Khi trích dẫn nội dung bài giảng, ghi đúng mốc thời gian [mm:ss–mm:ss] hoặc số trang (trang N) có thật trong ngữ cảnh.
   - Tuyệt đối không tự bịa mốc thời gian hoặc tài liệu không có trong bài.
   - Nếu học liệu chưa đề cập, nói rõ: "Trong bài giảng này chưa đề cập đến..." rồi mới giải thích thêm dưới mục riêng "Giải thích thêm (ngoài bài giảng)".

2. PHÂN BIỆT RÕ RÀNG
   - "Theo bài giảng": Chỉ nội dung có bằng chứng trong học liệu, bắt buộc có trích dẫn mốc thời gian hoặc trang.
   - "Giải thích thêm (ngoài bài giảng)": Tri thức bổ trợ, ghi rõ để học viên không nhầm là giảng viên đã dạy.
"""

SOCRATIC_MODE_INSTRUCTION = """
CHẾ ĐỘ GIA SƯ: GỢI MỞ & PHÁT TRIỂN TƯ DUY (SOCRATIC TUTORING)
- Mục tiêu: Giúp học viên tự tìm ra lời giải và hiểu sâu bản chất, KHÔNG trở thành một công cụ giải bài hộ.
- Khi học viên hỏi một bài tập hoặc bài toán:
  1. Xác định khái niệm hoặc công thức cốt lõi cần dùng.
  2. Đặt 1 câu hỏi gợi mở hoặc đưa ra gợi ý bước 1 để học viên suy nghĩ.
  3. Nếu học viên làm sai, chỉ ra vị trí sai một cách nhẹ nhàng ("Hãy kiểm tra lại dấu ở bước quy đồng...", "Thì trong mệnh đề này có mốc thời gian quá khứ xác định chưa?").
  4. Đưa ra hướng dẫn từng bước nhỏ; chỉ cung cấp lời giải trọn vẹn khi học viên đã nỗ lực thử và yêu cầu đối chiếu.
"""

DIRECT_MODE_INSTRUCTION = """
CHẾ ĐỘ GIA SƯ: GIẢI THÍCH TRỰC TIẾP & TOÀN DIỆN
- Trả lời thẳng vào trọng tâm câu hỏi, có cấu trúc mạch lạc:
  - **Trả lời nhanh**: 1–2 câu tóm lược.
  - **Theo bài giảng**: Nội dung chính kèm trích dẫn thời gian [mm:ss–mm:ss].
  - **Giải thích chi tiết & Ví dụ**: Minh họa sinh động, dễ hiểu.
  - **Giải thích thêm (ngoài bài giảng)**: Nếu cần mở rộng kiến thức liên quan.
"""

PRACTICE_MODE_INSTRUCTION = """
CHẾ ĐỘ GIA SƯ: LUYỆN TẬP & CỦNG CỐ NĂNG LỰC
- Đưa ra 1–2 câu hỏi luyện tập nhanh hoặc bài toán tương tự về chủ đề bài học.
- Chờ phản hồi của học viên để chấm điểm và phân tích điểm mạnh/điểm yếu.
"""

DOMAIN_GUIDANCE = {
    "toán": """
[HƯỚNG DẪN RIÊNG CHO TOÁN HỌC]:
- Viết tất cả công thức toán học bằng chuẩn LaTeX: $công thức inline$ hoặc $$công thức display$$. Ví dụ: $\\frac{A}{B}$, $x^2 - 4 = (x-2)(x+2)$.
- Giải thích bản chất vì sao lại thực hiện phép biến đổi (tại sao phải tìm MTC, tại sao cần điều kiện xác định).
- Tránh nhảy cóc bước giải.
""",
    "ngoại ngữ": """
[HƯỚNG DẪN RIÊNG CHO NGOẠI NGỮ]:
- Sửa lỗi ngữ pháp và từ vựng một cách lịch thiệp, giải thích sự khác biệt giữa các cấu trúc dễ nhầm (Present Perfect vs Past Simple, Since vs For).
- Đưa ví dụ đàm thoại thực tế theo ngữ cảnh (giao tiếp công sở, đời sống).
- Nêu rõ phiên âm hoặc trọng âm từ khi giải thích từ vựng quan trọng.
""",
    "công nghệ": """
[HƯỚNG DẪN RIÊNG CHO LẬP TRÌNH & CÔNG NGHỆ]:
- Định dạng code trong khối mã ```python hoặc ```typescript rõ ràng.
- Phân tích nguyên nhân gốc rễ của lỗi (Root cause) thay vì chỉ đưa đoạn code sửa.
- Lưu ý các trường hợp biên (edge cases), bảo mật và tối ưu bộ nhớ/truy vấn.
""",
    "kỹ năng": """
[HƯỚNG DẪN RIÊNG CHO KỸ NĂNG SỐNG & QUẢN LÝ]:
- Đưa ra tình huống thực tế (case study) ngắn gọn.
- Gợi ý các bước hành động cụ thể (Actionable steps).
""",
}


def _detect_domain(category: Optional[str], topic: Optional[str]) -> str:
    combined = f"{category or ''} {topic or ''}".lower()
    if any(k in combined for k in ["toán", "math", "đại số", "hình học", "giải tích"]):
        return DOMAIN_GUIDANCE["toán"]
    if any(k in combined for k in ["tiếng anh", "english", "ngoại ngữ", "ielts", "toeic", "nhật", "hàn", "trung"]):
        return DOMAIN_GUIDANCE["ngoại ngữ"]
    if any(k in combined for k in ["lập trình", "code", "python", "javascript", "react", "fastapi", "ai", "database", "sql"]):
        return DOMAIN_GUIDANCE["công nghệ"]
    if any(k in combined for k in ["kỹ năng", "giao tiếp", "quản lý", "tài chính"]):
        return DOMAIN_GUIDANCE["kỹ năng"]
    return ""


def build_tutor_system_prompt(
    lesson_id: int | None = None,
    lesson_title: Optional[str] = None,
    course_level: Optional[str] = None,
    course_category: Optional[str] = None,
    grade_label: Optional[str] = None,
    target_audience: Optional[str] = None,
    language: Optional[str] = None,
    tutor_mode: Optional[str] = "socratic",
) -> str:
    lines = [TUTOR_BASE_PROMPT.strip()]

    # Chế độ gia sư
    if tutor_mode == "direct":
        lines.append(DIRECT_MODE_INSTRUCTION.strip())
    elif tutor_mode == "practice":
        lines.append(PRACTICE_MODE_INSTRUCTION.strip())
    else:
        lines.append(SOCRATIC_MODE_INSTRUCTION.strip())

    # Ngữ cảnh khóa học & bài học
    ctx = []
    if lesson_title:
        ctx.append(f'Bài học: "{lesson_title}"')
    elif lesson_id:
        ctx.append(f"Bài học #{lesson_id}")
    if course_category:
        ctx.append(f"Lĩnh vực: {course_category}")
    if grade_label:
        ctx.append(f"Cấp học/Lớp: {grade_label}")
    if course_level:
        ctx.append(f"Trình độ: {course_level}")
    if target_audience:
        ctx.append(f"Đối tượng: {target_audience}")

    if ctx:
        lines.append(f"\n[NGỮ CẢNH ĐÀO TẠO]: {', '.join(ctx)}")

    # Thêm chỉ dẫn chuyên biệt theo lĩnh vực
    domain_instr = _detect_domain(course_category, lesson_title)
    if domain_instr:
        lines.append(domain_instr.strip())

    # Ngôn ngữ trả lời bám theo ngôn ngữ khóa học; thuật ngữ chuyên môn giữ bản gốc.
    lang = (language or "").strip().lower()
    if lang.startswith("en"):
        lines.append(
            "[NGÔN NGỮ]: Trả lời bằng tiếng Anh, vẫn giữ nguyên thuật ngữ chuyên môn gốc."
        )
    elif lang:
        lines.append(
            "[NGÔN NGỮ]: Trả lời bằng tiếng Việt dễ hiểu, vẫn giữ nguyên thuật ngữ chuyên môn gốc."
        )

    return "\n\n".join(lines)


def _format_history(chat_history: Optional[Iterable[dict]]) -> str:
    if not chat_history:
        return ""
    lines: list[str] = []
    for turn in list(chat_history)[-6:]:
        role = str(turn.get("role", "")).lower()
        content = str(turn.get("content", "")).strip()
        if not content:
            continue
        speaker = "Học viên" if role == "user" else "Gia sư"
        lines.append(f"{speaker}: {content[:1200]}")
    return "\n".join(lines)


def build_rag_user_prompt(
    question: str,
    context: str,
    chat_history: Optional[Iterable[dict]] = None,
    student_profile: str = "",
    lesson_title: str = "",
) -> str:
    profile_section = f"\n[HỒ SƠ HỌC VIÊN]:\n{student_profile}\n" if student_profile else ""
    history_text = _format_history(chat_history)
    history_section = (
        f"\n[LỊCH SỬ HỘI THOẠI GẦN NHẤT]:\n{history_text}\n"
        if history_text
        else ""
    )
    lesson_section = f'\n[BÀI HỌC]: "{lesson_title}"\n' if lesson_title else ""

    return f"""{profile_section}{lesson_section}{history_section}
[NGỮ CẢNH BÀI HỌC - TRÍCH TỪ PHỤ ĐỀ / TÀI LIỆU CỦA BÀI]:
{context}

[CÂU HỎI CỦA HỌC VIÊN]:
{question}

Hãy trả lời theo đúng phong cách và quy tắc của Gia sư AI Smart LMS."""


def build_tutor_user_prompt(
    question: str,
    context: str,
    student_profile: str = "",
    chat_history: Optional[Iterable[dict]] = None,
) -> str:
    return build_rag_user_prompt(
        question=question,
        context=context,
        chat_history=chat_history,
        student_profile=student_profile,
    )
