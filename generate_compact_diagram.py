# -*- coding: utf-8 -*-
"""
Tạo sơ đồ kiến trúc 3 dịch vụ SmartTutor LMS:
- Nền trắng tinh khiết (100% White background) chuẩn in ấn báo cáo / Word.
- Gọn gàng, ngắn gọn, chỉ làm nổi bật 3 dịch vụ và các thành phần cốt lõi.
- Xuất file PNG 300 DPI và SVG.
"""

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

def create_compact_diagram():
    # Khổ hình ngang gọn gàng (13 x 6.8 inches) vừa vặn 1/2 trang giấy A4 Word
    fig, ax = plt.subplots(figsize=(13, 6.8), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Font chữ chuẩn tiếng Việt
    plt.rcParams['font.sans-serif'] = ['Segoe UI', 'Arial', 'DejaVu Sans']
    plt.rcParams['font.family'] = 'sans-serif'

    # Thiết lập màu nền trắng tuyệt đối
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#FFFFFF')

    # Bảng màu tối giản, sang trọng cho tài liệu học thuật (Clean White / Slate)
    c_border_fe = "#2563EB"       # Xanh dương
    c_border_be = "#059669"       # Xanh lá
    c_border_ai = "#7C3AED"       # Tím
    c_border_db = "#475569"       # Xám than

    c_box_bg = "#FFFFFF"
    c_text_main = "#0F172A"
    c_text_sub = "#475569"
    c_text_blue = "#1D4ED8"
    c_text_green = "#047857"
    c_text_purple = "#6D28D9"

    def draw_service_box(x, y, w, h, title, port, tech, items, border_color, title_color):
        # Khung viền ngoài
        box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=1.0",
                             facecolor=c_box_bg, edgecolor=border_color, linewidth=1.8, zorder=2)
        ax.add_patch(box)
        
        # Tiêu đề dịch vụ
        ax.text(x + w/2, y + h - 3.2, title, ha='center', va='center',
                fontsize=11.5, fontweight='bold', color=title_color, zorder=3)
        ax.text(x + w/2, y + h - 6.2, f"{port} • {tech}", ha='center', va='center',
                fontsize=8.5, fontweight='semibold', color=c_text_sub, zorder=3)

        # Đường kẻ phân cách nhẹ
        ax.plot([x + 1.5, x + w - 1.5], [y + h - 8.2, y + h - 8.2], color="#E2E8F0", linewidth=1.0, zorder=3)

        # Nội dung chính
        start_y = y + h - 11.2
        for i, item in enumerate(items):
            ax.text(x + 2.0, start_y - (i * 3.3), f"• {item}", fontsize=8.6,
                    color=c_text_main, va='top', zorder=3)

    # ══════════════════════════════════════════════════════
    # HÀNG TRÊN: BA DỊCH VỤ CHÍNH (3 SERVICES)
    # ══════════════════════════════════════════════════════

    # 1. Frontend Service
    draw_service_box(
        x=4, y=42, w=27, h=48,
        title="1. FRONTEND SERVICE",
        port="Cổng 3000",
        tech="Next.js 14 • React • Tailwind",
        items=[
            "Giao diện Học viên, Giảng viên & Admin",
            "Trình học video & tài liệu bài giảng",
            "Gia sư AI Chatbox (SSE Streaming)",
            "Tóm tắt bài học & Flashcards tương tác",
            "Phòng thi Quiz & Tra cứu chứng chỉ",
            "Edge Middleware bảo vệ route & JWT"
        ],
        border_color=c_border_fe,
        title_color=c_text_blue
    )

    # 2. Backend Core Service
    draw_service_box(
        x=36.5, y=42, w=27, h=48,
        title="2. BACKEND SERVICE",
        port="Cổng 8000",
        tech="FastAPI • Python • SQLAlchemy 2",
        items=[
            "Xác thực JWT (Access / Refresh Token)",
            "Quản lý Khóa học, Bài giảng & Học liệu",
            "Ghi danh & Kiểm soát tiến độ học",
            "Hạn ngạch AI: Tutor, Quiz, Summary",
            "Chấm điểm trắc nghiệm & Cấp mã chứng chỉ",
            "Ký Presigned URL Cloudflare R2 (1 giờ)"
        ],
        border_color=c_border_be,
        title_color=c_text_green
    )

    # 3. AI Service
    draw_service_box(
        x=69, y=42, w=27, h=48,
        title="3. AI SERVICE",
        port="Cổng 8001",
        tech="FastAPI • Google GenAI SDK",
        items=[
            "Lesson-bounded RAG (Ngữ cảnh bài học)",
            "Ngưỡng tương đồng >= 0.5 & Từ chối ngoài bài",
            "AI Quiz Generator (Thang đo Bloom)",
            "Tóm tắt bài giảng & Sinh Flashcards",
            "Chấm tự luận theo Rubric tiêu chí",
            "Ghi nhận token tiêu thụ (ai_usage_logs)"
        ],
        border_color=c_border_ai,
        title_color=c_text_purple
    )

    # ══════════════════════════════════════════════════════
    # HÀNG DƯỚI: TẦNG DỮ LIỆU & LƯU TRỮ ĐÁM MÂY (STORAGE & CLOUD)
    # ══════════════════════════════════════════════════════

    # Khung Cơ sở dữ liệu (PostgreSQL + pgvector)
    box_db = FancyBboxPatch((4, 6), 44, 27, boxstyle="round,pad=0,rounding_size=1.0",
                            facecolor=c_box_bg, edgecolor=c_border_db, linewidth=1.5, zorder=2)
    ax.add_patch(box_db)
    ax.text(26, 29.5, "CƠ SỞ DỮ LIỆU POSTGRESQL 16 + PGVECTOR (SUPABASE)", ha='center', va='center',
            fontsize=10.2, fontweight='bold', color=c_text_main, zorder=3)
    ax.plot([6, 46], [26.5, 26.5], color="#E2E8F0", linewidth=1.0, zorder=3)
    
    db_items = [
        "Dữ liệu quan hệ: Users, Courses, Lessons, Enrollments, Progress, Quizzes, Submissions...",
        "Kho tri thức Vector 768 chiều: Bảng document_chunks",
        "Chỉ mục HNSW: idx_document_chunks_embedding_hnsw (Khoảng cách Cosine <=>)"
    ]
    for i, it in enumerate(db_items):
        ax.text(6.5, 23.0 - (i * 4.6), f"• {it}", fontsize=8.4, color=c_text_main, va='top', zorder=3)

    # Khung Lưu trữ đám mây & AI Ngoại vi
    box_cloud = FancyBboxPatch((52, 6), 44, 27, boxstyle="round,pad=0,rounding_size=1.0",
                              facecolor=c_box_bg, edgecolor=c_border_db, linewidth=1.5, zorder=2)
    ax.add_patch(box_cloud)
    ax.text(74, 29.5, "LƯU TRỮ ĐÁM MÂY & MÔ HÌNH AI NGOẠI VI (EXTERNAL SERVICES)", ha='center', va='center',
            fontsize=10.2, fontweight='bold', color=c_text_main, zorder=3)
    ax.plot([54, 94], [26.5, 26.5], color="#E2E8F0", linewidth=1.0, zorder=3)

    cloud_items = [
        "Cloudflare R2: Lưu trữ tệp video & tài liệu bài học qua Presigned URL có hạn",
        "Cloudinary: Lưu trữ & tối ưu hóa ảnh bìa khóa học (smart-lms/courses)",
        "Google Gemini API: gemini-2.5-flash & gemini-embedding-001 (768 chiều)",
        "Groq AI (Fallback): Dự phòng bằng LLaMA khi Gemini quá tải / lỗi"
    ]
    for i, it in enumerate(cloud_items):
        ax.text(54.5, 23.0 - (i * 4.6), f"• {it}", fontsize=8.4, color=c_text_main, va='top', zorder=3)

    # ══════════════════════════════════════════════════════
    # MŨI TÊN KẾT NỐI (ARROWS & LABELS)
    # ══════════════════════════════════════════════════════
    def draw_arrow(x1, y1, x2, y2, label="", color="#475569", lw=1.4):
        arrow = FancyArrowPatch((x1, y1), (x2, y2),
                                arrowstyle="Simple,tail_width=1.0,head_width=4.5,head_length=5.5",
                                color=color, linewidth=lw, zorder=4)
        ax.add_patch(arrow)
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            # Hộp nền nhãn màu trắng che đường kẻ
            tbox = FancyBboxPatch((mx - 4.5, my - 1.3), 9.0, 2.6, boxstyle="round,pad=0,rounding_size=0.4",
                                  facecolor="#FFFFFF", edgecolor="#CBD5E1", linewidth=0.8, zorder=5)
            ax.add_patch(tbox)
            ax.text(mx, my, label, fontsize=7.2, fontweight='bold', color=color, ha='center', va='center', zorder=6)

    # 1. Frontend <--> Backend
    draw_arrow(31, 70, 36.5, 70, label="REST API", color=c_border_fe)
    draw_arrow(36.5, 60, 31, 60, label="SSE Stream", color=c_border_be)

    # 2. Backend <--> AI Service
    draw_arrow(63.5, 70, 69, 70, label="Internal HTTP", color=c_border_ai)
    draw_arrow(69, 60, 63.5, 60, label="Token Proxy", color=c_border_ai)

    # 3. Backend -> Database
    draw_arrow(42, 42, 33, 33, label="SQLAlchemy", color="#0F766E")

    # 4. AI Service -> pgvector (HNSW)
    draw_arrow(73, 42, 44, 33, label="Vector Search", color="#6B21A8")

    # 5. Backend -> Cloudflare R2
    draw_arrow(57, 42, 63, 33, label="Presigned URL", color="#D97706")

    # 6. AI Service -> Gemini / Groq
    draw_arrow(85, 42, 85, 33, label="GenAI SDK", color="#9333EA")

    # Tiêu đề trên cùng
    ax.text(50, 96.0, "SƠ ĐỒ KIẾN TRÚC BA DỊCH VỤ CỦA HỆ THỐNG SmartTutor LMS", 
            ha='center', va='center', fontsize=14, fontweight='bold', color=c_text_main)

    plt.tight_layout()

    # Xuất ảnh
    png_path = "hinh2_kientruc_3_dichvu_smart_lms.png"
    svg_path = "hinh2_kientruc_3_dichvu_smart_lms.svg"
    plt.savefig(png_path, dpi=300, facecolor='#FFFFFF', edgecolor='none', bbox_inches='tight')
    plt.savefig(svg_path, format='svg', facecolor='#FFFFFF', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"Thành công: {png_path} và {svg_path}")

if __name__ == "__main__":
    create_compact_diagram()
