# -*- coding: utf-8 -*-
"""
Script tạo sơ đồ kiến trúc hệ thống ba dịch vụ SmartTutor LMS chất lượng cao (300 DPI)
Dành cho việc chèn vào báo cáo đồ án, khóa luận, tài liệu kỹ thuật Word.
"""

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ArrowStyle

def create_architecture_diagram():
    # Kích thước khung hình tỉ lệ chuẩn (16x11 inches)
    fig, ax = plt.subplots(figsize=(16, 11), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')
    
    # Thiết lập font chữ
    plt.rcParams['font.sans-serif'] = ['Segoe UI', 'Arial', 'DejaVu Sans']
    plt.rcParams['font.family'] = 'sans-serif'
    
    # Bảng màu chuyên nghiệp (Modern Tech Palette)
    c_bg = "#F8FAFC"          # Nền tổng thể
    c_title = "#0F172A"       # Màu tiêu đề chính
    
    # Màu khối dịch vụ
    c_frontend_bg = "#EFF6FF"
    c_frontend_border = "#3B82F6"
    c_frontend_header = "#1D4ED8"
    
    c_backend_bg = "#F0FDF4"
    c_backend_border = "#10B981"
    c_backend_header = "#047857"
    
    c_ai_bg = "#FAF5FF"
    c_ai_border = "#8B5CF6"
    c_ai_header = "#6D28D9"
    
    c_storage_bg = "#FFFBEB"
    c_storage_border = "#F59E0B"
    c_storage_header = "#B45309"
    
    c_card_bg = "#FFFFFF"
    c_card_border = "#CBD5E1"
    c_text_dark = "#1E293B"
    c_text_muted = "#64748B"
    c_arrow = "#475569"
    
    # Màu nền toàn bộ canvas
    fig.patch.set_facecolor(c_bg)
    ax.set_facecolor(c_bg)
    
    # ── TIÊU ĐỀ SƠ ĐỒ ──
    ax.text(50, 97.2, "HỆ THỐNG SmartTutor LMS — KIẾN TRÚC BA DỊCH VỤ VÀ CƠ SỞ TRI THỨC AI", 
            ha='center', va='center', fontsize=16, fontweight='bold', color=c_title)
    ax.text(50, 95.0, "Three-Tier Service Architecture with Lesson-Bounded RAG & Vector Store", 
            ha='center', va='center', fontsize=11, fontstyle='italic', color=c_text_muted)

    def draw_box(x, y, w, h, bg_color, border_color, radius=1.2, lw=1.5):
        box = FancyBboxPatch((x, y), w, h,
                             boxstyle=f"round,pad=0,rounding_size={radius}",
                             facecolor=bg_color, edgecolor=border_color, linewidth=lw, zorder=2)
        ax.add_patch(box)
        return box

    def draw_subcard(x, y, w, h, title, items, tag=None, tag_bg="#E2E8F0", tag_fg="#334155"):
        draw_box(x, y, w, h, c_card_bg, c_card_border, radius=0.8, lw=1.0)
        # Header subcard
        ax.text(x + 1.2, y + h - 1.8, title, fontsize=9.5, fontweight='bold', color=c_text_dark, va='top', zorder=3)
        if tag:
            tbox = FancyBboxPatch((x + w - len(tag)*0.8 - 1.5, y + h - 2.4), len(tag)*0.8 + 0.8, 1.4,
                                  boxstyle="round,pad=0,rounding_size=0.4", facecolor=tag_bg, edgecolor="none", zorder=3)
            ax.add_patch(tbox)
            ax.text(x + w - 1.1, y + h - 1.7, tag, fontsize=7.5, fontweight='bold', color=tag_fg, ha='right', va='center', zorder=4)
        
        # Items list
        start_y = y + h - 3.8
        for i, item in enumerate(items):
            ax.text(x + 1.4, start_y - (i * 1.55), f"• {item}", fontsize=8.2, color="#334155", va='top', zorder=3)

    # ═══════════════════════════════════════════════════════════
    # KHỐI 1: FRONTEND CLIENT TIER (Top Left, x=3, y=56, w=29, h=36)
    # ═══════════════════════════════════════════════════════════
    draw_box(3, 56, 29, 36.5, c_frontend_bg, c_frontend_border, radius=1.5, lw=2.0)
    # Header
    head_bg1 = FancyBboxPatch((3, 88.5), 29, 4.0, boxstyle="round,pad=0,rounding_size=1.2",
                              facecolor=c_frontend_header, edgecolor="none", zorder=3)
    ax.add_patch(head_bg1)
    ax.text(17.5, 90.5, "1. FRONTEND CLIENT (PORT 3000)", ha='center', va='center',
            fontsize=11.5, fontweight='bold', color='#FFFFFF', zorder=4)
    ax.text(17.5, 87.2, "Next.js 14 (App Router) • React 18 • TypeScript • Tailwind", ha='center', va='center',
            fontsize=8.5, fontweight='bold', color=c_frontend_header, zorder=3)
    
    # Subcards trong Frontend
    draw_subcard(4.5, 75.0, 26, 10.5, "Phân hệ Người dùng & Giao diện", [
        "Học viên (Student): Khóa học, video player, tiến độ",
        "Giảng viên (Instructor): Quản lý bài học, tạo quiz, tài liệu",
        "Quản trị viên (Admin): Tổng quan hệ thống, người dùng",
        "Edge Middleware: Kiểm tra hạn JWT, bảo vệ route"
    ], tag="UI/UX", tag_bg="#DBEAFE", tag_fg="#1D4ED8")

    draw_subcard(4.5, 58.0, 26, 15.5, "Mô-đun Tương tác AI & Đánh giá", [
        "AI Tutor Chatbox: Hỏi đáp RAG theo bài giảng",
        "SSE Client: Hiển thị câu trả lời streaming tức thì",
        "Tóm tắt & Flashcards: Thẻ bài ghi nhớ lật mặt",
        "Phòng thi Quiz: Làm bài trắc nghiệm Bloom",
        "Tra cứu chứng chỉ số: Xác thực mã HMAC công khai",
        "Learning Tracker: Ghi nhận sự kiện học tập thời gian thực"
    ], tag="Features", tag_bg="#DBEAFE", tag_fg="#1D4ED8")

    # ═══════════════════════════════════════════════════════════
    # KHỐI 2: BACKEND CORE SERVICE (Center, x=35.5, y=56, w=29, h=36)
    # ═══════════════════════════════════════════════════════════
    draw_box(35.5, 56, 29, 36.5, c_backend_bg, c_backend_border, radius=1.5, lw=2.0)
    head_bg2 = FancyBboxPatch((35.5, 88.5), 29, 4.0, boxstyle="round,pad=0,rounding_size=1.2",
                              facecolor=c_backend_header, edgecolor="none", zorder=3)
    ax.add_patch(head_bg2)
    ax.text(50.0, 90.5, "2. BACKEND SERVICE (PORT 8000)", ha='center', va='center',
            fontsize=11.5, fontweight='bold', color='#FFFFFF', zorder=4)
    ax.text(50.0, 87.2, "Python 3.12 • FastAPI • SQLAlchemy 2.0 Async • Alembic", ha='center', va='center',
            fontsize=8.5, fontweight='bold', color=c_backend_header, zorder=3)

    draw_subcard(37.0, 75.0, 26, 10.5, "Bảo mật & Quản lý Truy cập", [
        "JWT Authentication: Access & Refresh Token rotation",
        "Token Versioning: Thu hồi phiên đăng nhập tức thì",
        "Role-Based Access Control (RBAC): 3 vai trò",
        "Rate Limiter: Giới hạn IP qua Header proxy/Cloudflare",
        "Paywall Engine: Kiểm soát ghi danh & chặn truy cập chui"
    ], tag="Security", tag_bg="#D1FAE5", tag_fg="#047857")

    draw_subcard(37.0, 58.0, 26, 15.5, "Nghiệp vụ Đào tạo & Điều phối AI", [
        "Courses & Lessons API: Quản lý cấu trúc đào tạo",
        "Lesson-Bounded Guard: Xác thực quyền bài học",
        "AI Quota Controller: Hạn mức ngày (Tutor, Quiz, Summary)",
        "Quiz Grader Engine: Chấm điểm bài nộp & lưu kết quả",
        "Digital Certificate: Cấp mã xác thực HMAC chống giả",
        "R2 Storage Service: Sinh Presigned URL tải có thời hạn (1h)",
        "Learning Analytics: Thu thập & phân tích sự kiện học"
    ], tag="Core Engine", tag_bg="#D1FAE5", tag_fg="#047857")

    # ═══════════════════════════════════════════════════════════
    # KHỐI 3: AI SERVICE (Right, x=68, y=56, w=29, h=36)
    # ═══════════════════════════════════════════════════════════
    draw_box(68, 56, 29, 36.5, c_ai_bg, c_ai_border, radius=1.5, lw=2.0)
    head_bg3 = FancyBboxPatch((68, 88.5), 29, 4.0, boxstyle="round,pad=0,rounding_size=1.2",
                              facecolor=c_ai_header, edgecolor="none", zorder=3)
    ax.add_patch(head_bg3)
    ax.text(82.5, 90.5, "3. AI SERVICE (PORT 8001)", ha='center', va='center',
            fontsize=11.5, fontweight='bold', color='#FFFFFF', zorder=4)
    ax.text(82.5, 87.2, "FastAPI • Google GenAI SDK • PyPDF2 / pdfplumber", ha='center', va='center',
            fontsize=8.5, fontweight='bold', color=c_ai_header, zorder=3)

    draw_subcard(69.5, 75.0, 26, 10.5, "Lesson-Bounded RAG Engine", [
        "Vector Search: Truy vấn theo lesson_id & cosine dist",
        "Ngưỡng tương đồng >= 0.5 + lọc từ khóa bằng chứng",
        "Cơ chế Refusal: Từ chối dứt khoát ngoài phạm vi bài",
        "Context Window: Mở rộng ±1 chunk liền kề cùng tài liệu",
        "Citation Engine: Trích dẫn mốc video & số trang PDF"
    ], tag="Anti-Hallucination", tag_bg="#EDE9FE", tag_fg="#6D28D9")

    draw_subcard(69.5, 58.0, 26, 15.5, "Các Pipeline Trí tuệ Nhân tạo", [
        "AI Quiz Generator: Sinh đề Pydantic theo thang Bloom",
        "Lecture Summarizer: Tóm tắt, điểm chính & Flashcards",
        "Rubric Essay Grader: Chấm tự luận theo bảng tiêu chí",
        "Document Ingestor: Bóc tách PDF, DOCX, PPTX có số trang",
        "Embedding Pipeline: Vector hóa 768 chiều (Gemini)",
        "Token Usage Tracker: Ghi nhận mức tiêu thụ thực tế/ước lượng"
    ], tag="Pipelines", tag_bg="#EDE9FE", tag_fg="#6D28D9")

    # ═══════════════════════════════════════════════════════════
    # KHỐI 4: TẦNG DỮ LIỆU & LƯU TRỮ ĐÁM MÂY (Bottom Layer, y=6 đến 46)
    # ═══════════════════════════════════════════════════════════
    # Sub-block 4.1: PostgreSQL + pgvector (x=3, y=6, w=44, h=40)
    draw_box(3, 6, 44, 40, "#F1F5F9", "#64748B", radius=1.5, lw=2.0)
    head_bg4 = FancyBboxPatch((3, 42.0), 44, 4.0, boxstyle="round,pad=0,rounding_size=1.2",
                              facecolor="#334155", edgecolor="none", zorder=3)
    ax.add_patch(head_bg4)
    ax.text(25.0, 44.0, "CƠ SỞ DỮ LIỆU POSTGRESQL 16 + PGVECTOR (SUPABASE)", ha='center', va='center',
            fontsize=11.0, fontweight='bold', color='#FFFFFF', zorder=4)

    # Chia 2 cột trong CSDL
    draw_subcard(4.5, 8.0, 20, 32.5, "Bảng Dữ liệu Quan hệ (Relational)", [
        "users: Phân quyền admin, instructor, student",
        "courses, lessons: Nội dung, thời lượng, video",
        "lesson_materials: Học liệu cloud, trạng thái R2",
        "enrollments: Ghi danh khóa học hợp lệ",
        "progress: Tiến độ xem bài giảng, hoàn thành",
        "quizzes, quiz_questions: Ngân hàng câu hỏi",
        "quiz_submissions: Kết quả thi & đáp án đã nộp",
        "essay_gradings: Điểm & nhận xét tự luận",
        "chat_messages: Lịch sử hội thoại theo bài học",
        "ai_usage_logs: Thống kê token thực tế",
        "learning_events: Nhật ký hành vi học tập",
        "course_reviews: Đánh giá sao & nhận xét khóa"
    ], tag="Schema", tag_bg="#E2E8F0", tag_fg="#334155")

    draw_subcard(25.5, 8.0, 20, 32.5, "Kho Tri thức Vector (pgvector)", [
        "Bảng document_chunks: Lưu phân đoạn văn bản",
        "Embedding Vector: 768 chiều (gemini-embedding-001)",
        "Chỉ mục HNSW: idx_document_chunks_embedding_hnsw",
        "Toán tử khoảng cách Cosine: vector_cosine_ops (<=>)",
        "Ràng buộc chỉ mục: B-Tree trên lesson_id",
        "Provenance Metadata:",
        "  - source_type: youtube_subtitle, document",
        "  - filename: Tên tệp gốc bài giảng",
        "  - page: Số trang PDF trích xuất",
        "  - start_seconds, end_seconds: Mốc video",
        "Cách ly học liệu: Tự động gỡ chunk khi tệp lỗi"
    ], tag="HNSW 768D", tag_bg="#FEF3C7", tag_fg="#92400E")

    # Sub-block 4.2: Dịch vụ Cloud & AI Ngoại vi (x=50, y=6, w=47, h=40)
    draw_box(50, 6, 47, 40, c_storage_bg, c_storage_border, radius=1.5, lw=2.0)
    head_bg5 = FancyBboxPatch((50, 42.0), 47, 4.0, boxstyle="round,pad=0,rounding_size=1.2",
                              facecolor=c_storage_header, edgecolor="none", zorder=3)
    ax.add_patch(head_bg5)
    ax.text(73.5, 44.0, "DỊCH VỤ ĐÁM MÂY & MÔ HÌNH NGÔN NGỮ NGOẠI VI (EXTERNAL CLOUD)", ha='center', va='center',
            fontsize=11.0, fontweight='bold', color='#FFFFFF', zorder=4)

    # 4 thẻ dịch vụ ngoại vi
    draw_subcard(51.5, 25.0, 21.5, 15.5, "Cloudflare R2 Storage", [
        "Chuẩn tương thích S3 API",
        "Lưu trữ video bài giảng (MP4/WebM)",
        "Lưu tài liệu gốc (PDF, DOCX, PPTX)",
        "Bảo mật: Presigned URL 1 giờ",
        "Ẩn storage_key nội bộ khỏi Client"
    ], tag="Media Cloud", tag_bg="#FEF3C7", tag_fg="#B45309")

    draw_subcard(74.0, 25.0, 21.5, 15.5, "Google Gemini AI", [
        "LLM: gemini-2.5-flash",
        "Hỗ trợ Structured Output Pydantic",
        "Sinh SSE Streaming thời gian thực",
        "Model nhúng: gemini-embedding-001",
        "Vector đầu ra 768 chiều"
    ], tag="Primary LLM", tag_bg="#EDE9FE", tag_fg="#6D28D9")

    draw_subcard(51.5, 8.0, 21.5, 15.5, "Cloudinary & YouTube API", [
        "Cloudinary: Lưu ảnh bìa (thumbnail)",
        "Thư mục: smart-lms/courses",
        "Tối ưu WebP, nén ảnh tự động",
        "YouTube API: Lấy video ID bài giảng",
        "Transcript/Subtitle: Bóc tách phụ đề"
    ], tag="CDN & Video", tag_bg="#E0F2FE", tag_fg="#0284C7")

    draw_subcard(74.0, 8.0, 21.5, 15.5, "Groq AI (Fallback Provider)", [
        "Mô hình: LLaMA 3.3 / LLaMA 3.1",
        "Kích hoạt: Khi Gemini lỗi hoặc hết quota",
        "Tự động chuyển vùng dự phòng",
        "Đảm bảo SLA & sẵn sàng 24/7"
    ], tag="Fallback LLM", tag_bg="#FEE2E2", tag_fg="#DC2626")

    # ═══════════════════════════════════════════════════════════
    # MŨI TÊN & KẾT NỐI GIỮA CÁC THÀNH PHẦN (ARROWS & PROTOCOLS)
    # ═══════════════════════════════════════════════════════════
    def draw_connection(x1, y1, x2, y2, label="", sublabel="", rad=0.0, color="#334155", lw=1.6):
        arrow = patches.FancyArrowPatch(
            (x1, y1), (x2, y2),
            connectionstyle=f"arc3,rad={rad}",
            arrowstyle="Simple,tail_width=1.0,head_width=5.0,head_length=6.0",
            color=color, linewidth=lw, zorder=5
        )
        ax.add_patch(arrow)
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            # Offset text slightly
            tbox = FancyBboxPatch((mx - 5.5, my - 1.4), 11.0, 2.8, boxstyle="round,pad=0,rounding_size=0.4",
                                  facecolor="#FFFFFF", edgecolor="#94A3B8", linewidth=0.8, zorder=6)
            ax.add_patch(tbox)
            ax.text(mx, my + 0.4, label, fontsize=7.5, fontweight='bold', color=color, ha='center', va='center', zorder=7)
            if sublabel:
                ax.text(mx, my - 0.6, sublabel, fontsize=6.8, color="#64748B", ha='center', va='center', zorder=7)

    # 1. Frontend <--> Backend
    draw_connection(32, 77, 35.5, 77, label="REST API (JSON)", sublabel="JWT Bearer Token", color="#2563EB")
    draw_connection(35.5, 68, 32, 68, label="SSE Streaming", sublabel="ai-tutor / chat", color="#059669")

    # 2. Backend <--> AI Service
    draw_connection(64.5, 77, 68, 77, label="Internal REST", sublabel="X-Internal-Api-Key", color="#7C3AED")
    draw_connection(68, 68, 64.5, 68, label="SSE Proxy", sublabel="Streaming token", color="#7C3AED")

    # 3. Backend --> Database PostgreSQL
    draw_connection(42, 56, 28, 46, label="SQLAlchemy 2.0 Async", sublabel="Asyncpg Connection Pool", color="#0F766E")

    # 4. AI Service --> Vector Store (PostgreSQL)
    draw_connection(74, 56, 42, 46, label="pgvector Ingest & Search", sublabel="HNSW Cosine (<=>)", color="#6B21A8")

    # 5. Backend --> Cloudflare R2
    draw_connection(50, 56, 58, 46, label="Presigned S3 API", sublabel="Ký URL 1 giờ", color="#D97706")

    # 6. AI Service --> Gemini / Groq
    draw_connection(85, 56, 82, 46, label="Generative AI SDK", sublabel="Gemini / Fallback Groq", color="#9333EA")

    # ── CHÚ THÍCH HÌNH CHO WORD (CAPTION) ──
    caption_box = FancyBboxPatch((15, 1.0), 70, 3.8, boxstyle="round,pad=0,rounding_size=0.6",
                                 facecolor="#FFFFFF", edgecolor="#CBD5E1", linewidth=1.0, zorder=3)
    ax.add_patch(caption_box)
    ax.text(50, 2.9, "Hình 2. Kiến trúc ba dịch vụ và luồng xử lý tri thức AI của hệ thống SmartTutor LMS",
            fontsize=10.5, fontweight='bold', color=c_title, ha='center', va='center', zorder=4)
    ax.text(50, 1.7, "(Dịch vụ Độc lập: Frontend Next.js 3000 • Backend FastAPI 8000 • AI Service FastAPI 8001 • Supabase pgvector HNSW)",
            fontsize=8.5, fontstyle='italic', color=c_text_muted, ha='center', va='center', zorder=4)

    plt.tight_layout()
    
    # Xuất ảnh độ phân giải cao cho Word (PNG 300 DPI) và vector (SVG)
    png_path = "kientruc_3_dichvu_smart_lms.png"
    svg_path = "kientruc_3_dichvu_smart_lms.svg"
    plt.savefig(png_path, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
    plt.savefig(svg_path, format='svg', facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"Đã tạo thành công: {png_path} và {svg_path}")

if __name__ == "__main__":
    create_architecture_diagram()
