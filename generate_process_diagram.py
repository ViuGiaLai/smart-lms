import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, ArrowStyle, FancyArrowPatch
import shutil
import os

# Set font family and style
plt.rcParams['font.family'] = 'DejaVu Sans'

# Create canvas: compact, horizontal 4-stage pipeline, clean white background
fig, ax = plt.subplots(figsize=(14.5, 6.2), facecolor='#FFFFFF')
ax.set_facecolor('#FFFFFF')
ax.set_xlim(0, 100)
ax.set_ylim(0, 48)
ax.axis('off')

# Color palette: elegant, academic, high contrast on white
C_TITLE_BG = '#1E293B'   # Slate 800
C_BOX_BG   = '#F8FAFC'   # Slate 50
C_PRIMARY  = '#2563EB'   # Blue 600
C_PURPLE   = '#7C3AED'   # Purple 600
C_EMERALD = '#059669'   # Emerald 600
C_AMBER   = '#D97706'   # Amber 600
C_BORDER  = '#CBD5E1'   # Slate 300
C_TEXT_MAIN = '#0F172A' # Slate 900
C_TEXT_MUTED = '#475569'# Slate 600

# 1. Main Diagram Header Banner
header_box = FancyBboxPatch((4, 40), 92, 5.5,
                            boxstyle="round,pad=0.2,rounding_size=1.0",
                            facecolor='#1E293B', edgecolor='#0F172A', linewidth=1.5)
ax.add_patch(header_box)
ax.text(50, 42.8, "HÌNH 1. QUY TRÌNH NGHIỆP VỤ TỔNG QUÁT CỦA HỆ THỐNG SmartTutor LMS",
        fontsize=13, fontweight='bold', color='#FFFFFF', ha='center', va='center')

# Definition of the 4 key business stages
stages = [
    {
        "step": "BƯỚC 1",
        "title": "Khởi Tạo & Tải Học Liệu",
        "actor": "Giảng viên (Instructor)",
        "color": C_PRIMARY,
        "x": 4.5, "y": 7, "w": 20.5, "h": 29.5,
        "items": [
            ("• Thiết kế khóa học:", "Tạo cây đề cương chương, bài giảng."),
            ("• Tải học liệu:", "Upload Slide PDF, Video bài giảng, YouTube."),
            ("• Biên soạn bài thi:", "Tạo ngân hàng câu hỏi Quiz, thiết lập điểm chuẩn.")
        ]
    },
    {
        "step": "BƯỚC 2",
        "title": "Số Hóa Tri Thức & AI Vector",
        "actor": "Hệ thống AI & Vector DB",
        "color": C_PURPLE,
        "x": 28.5, "y": 7, "w": 20.5, "h": 29.5,
        "items": [
            ("• Bóc tách nội dung:", "Trích xuất PDF theo trang, phụ đề video."),
            ("• Phân đoạn (Chunking):", "Cắt đoạn ngữ nghĩa 800 ký tự (overlap 150)."),
            ("• Nhúng vector 768 chiều:", "Google Gemini Embedding."),
            ("• Lưu trữ pgvector:", "Lập chỉ mục HNSW (cosine) tăng tốc truy vấn.")
        ]
    },
    {
        "step": "BƯỚC 3",
        "title": "Học Tập & Gia Sư AI RAG",
        "actor": "Học viên (Student)",
        "color": C_AMBER,
        "x": 52.5, "y": 7, "w": 20.5, "h": 29.5,
        "items": [
            ("• Tiếp cận bài giảng:", "Ghi danh khóa học, xem video & tài liệu."),
            ("• Gia sư AI RAG:", "Hỏi đáp nội dung bài học qua SSE Streaming."),
            ("• Trích dẫn nguồn:", "Hiển thị kèm số trang PDF & nguồn học liệu."),
            ("• Tóm tắt & Flashcards:", "Ôn tập nhanh với thẻ học lật ghi nhớ kiến thức.")
        ]
    },
    {
        "step": "BƯỚC 4",
        "title": "Đánh Giá & Cấp Chứng Chỉ",
        "actor": "Hệ thống & Học viên",
        "color": C_EMERALD,
        "x": 76.5, "y": 7, "w": 19.0, "h": 29.5,
        "items": [
            ("• Làm Quiz trắc nghiệm:", "Học viên làm bài kiểm tra tiến độ."),
            ("• Tự động chấm điểm:", "Khóa đáp án trước khi nộp, phản hồi chi tiết."),
            ("• Điều kiện hoàn thành:", "Tiến độ đạt 100% & điểm bài thi đạt yêu cầu."),
            ("• Cấp chứng chỉ số:", "Mã định danh HMAC chống giả mạo, tra cứu QR.")
        ]
    }
]

# Render Stages
for st in stages:
    x, y, w, h = st["x"], st["y"], st["w"], st["h"]
    
    # Outer card
    card = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.2,rounding_size=1.2",
                          facecolor=C_BOX_BG, edgecolor=C_BORDER, linewidth=1.4)
    ax.add_patch(card)
    
    # Top header bar for stage
    top_bar = FancyBboxPatch((x, y + h - 5.8), w, 5.8,
                             boxstyle="round,pad=0.1,rounding_size=1.0",
                             facecolor=st["color"], edgecolor=st["color"], linewidth=1.0)
    ax.add_patch(top_bar)
    
    # Step badge & Stage title
    ax.text(x + w/2, y + h - 2.0, st["step"],
            fontsize=9.5, fontweight='bold', color='#FFFFFF', ha='center', va='center')
    ax.text(x + w/2, y + h - 4.2, st["title"],
            fontsize=10.5, fontweight='bold', color='#FFFFFF', ha='center', va='center')
    
    # Sub-actor badge
    actor_box = FancyBboxPatch((x + 1.2, y + h - 8.8), w - 2.4, 2.3,
                               boxstyle="round,pad=0.1,rounding_size=0.5",
                               facecolor='#E2E8F0', edgecolor='#CBD5E1', linewidth=0.8)
    ax.add_patch(actor_box)
    ax.text(x + w/2, y + h - 7.6, f"Chủ thể: {st['actor']}",
            fontsize=8.5, fontweight='bold', color='#334155', ha='center', va='center')
    
    # Content items
    curr_y = y + h - 11.2
    for heading, detail in st["items"]:
        ax.text(x + 1.2, curr_y, heading,
                fontsize=8.8, fontweight='bold', color=C_TEXT_MAIN, ha='left', va='center')
        curr_y -= 2.0
        ax.text(x + 1.2, curr_y, detail,
                fontsize=8.2, fontweight='normal', color=C_TEXT_MUTED, ha='left', va='center')
        curr_y -= 2.6

# Connecting Arrows between stages
arrow_style = ArrowStyle("Simple, head_length=7, head_width=7, tail_width=2.5")
for i in range(3):
    start_x = stages[i]["x"] + stages[i]["w"] + 0.3
    end_x   = stages[i+1]["x"] - 0.3
    mid_y   = 22.0
    
    arrow = FancyArrowPatch((start_x, mid_y), (end_x, mid_y),
                            arrowstyle=arrow_style,
                            color='#475569', mutation_scale=1.5, zorder=5)
    ax.add_patch(arrow)

# Bottom note footer
footer_box = FancyBboxPatch((4, 1.2), 92, 3.8,
                            boxstyle="round,pad=0.1,rounding_size=0.8",
                            facecolor='#F1F5F9', edgecolor='#E2E8F0', linewidth=1.0)
ax.add_patch(footer_box)
ax.text(50, 3.1, "Khép kín chu trình đào tạo: Soạn giảng số hóa -> Trợ giảng AI tương tác thông minh -> Kiểm tra đánh giá -> Cấp chứng chỉ xác thực số",
        fontsize=9, fontstyle='italic', color='#334155', ha='center', va='center')

# Tight layout and save
plt.tight_layout()

png_path = r"D:\all_my_project\smart-lms\hinh1_quytrinh_nghiepvu_smart_lms.png"
svg_path = r"D:\all_my_project\smart-lms\hinh1_quytrinh_nghiepvu_smart_lms.svg"

plt.savefig(png_path, dpi=300, facecolor='#FFFFFF', bbox_inches='tight')
plt.savefig(svg_path, format='svg', facecolor='#FFFFFF', bbox_inches='tight')
plt.close()

print(f"Successfully generated:")
print(f"1. PNG: {png_path}")
print(f"2. SVG: {svg_path}")

# Copy to artifact folder for Antigravity UI display
artifact_dir = r"C:\Users\works\.gemini\antigravity\brain\4c4dcd05-1ff9-4b9a-87b5-85d47c0ede9e"
if os.path.exists(artifact_dir):
    shutil.copy(png_path, os.path.join(artifact_dir, "hinh1_quytrinh_nghiepvu_smart_lms.png"))
    print("Copied to artifact directory.")
