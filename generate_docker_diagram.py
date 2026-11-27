import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, ArrowStyle, FancyArrowPatch
import shutil
import os

# Font configuration
plt.rcParams['font.family'] = 'DejaVu Sans'

# Create canvas: 16.5 x 9.5 inches (spacious, balanced, high contrast, clean white)
fig, ax = plt.subplots(figsize=(16.5, 9.5), facecolor='#FFFFFF')
ax.set_facecolor('#FFFFFF')
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis('off')

# Professional Academic Color Palette
COLOR_TITLE_BG   = '#0F172A'  # Slate 900
COLOR_DOCKER_BG  = '#F8FAFC'  # Clean Slate 50
COLOR_DOCKER_BRD = '#0284C7'  # Docker Sky Blue
COLOR_CARD_BG    = '#FFFFFF'  # Pure white
COLOR_TEXT_TITLE = '#0F172A'  # Dark slate
COLOR_TEXT_SUB   = '#334155'  # Medium slate
COLOR_TEXT_MUTED = '#64748B'  # Light slate

C_CLIENT   = '#2563EB'  # Blue 600
C_FRONTEND = '#1D4ED8'  # Deep Blue
C_BACKEND  = '#0D9488'  # Teal 600
C_AI       = '#7C3AED'  # Purple 600
C_DB       = '#059669'  # Emerald 600
C_REDIS    = '#D97706'  # Amber 600
C_CLOUD    = '#16A34A'  # Green 600

# 1. Main Header Title
head = FancyBboxPatch((3.5, 91), 93, 6.5, boxstyle="round,pad=0.2,rounding_size=1.0",
                      facecolor=COLOR_TITLE_BG, edgecolor=COLOR_TITLE_BG)
ax.add_patch(head)
ax.text(50, 94.2, "HÌNH 17. MÔ HÌNH TRIỂN KHAI DOCKER COMPOSE - SmartTutor LMS",
        fontsize=14, fontweight='bold', color='#FFFFFF', ha='center', va='center')

# 2. Left Column: Client Layer (x: 3 -> 15, w: 12)
c_box = FancyBboxPatch((3, 40), 12, 45, boxstyle="round,pad=0.3,rounding_size=1.2",
                       facecolor='#EFF6FF', edgecolor='#3B82F6', linewidth=1.8)
ax.add_patch(c_box)

cpill = FancyBboxPatch((3, 79), 12, 6, boxstyle="round,pad=0.1,rounding_size=0.8",
                       facecolor=C_CLIENT, edgecolor=C_CLIENT)
ax.add_patch(cpill)
ax.text(9, 82, "NGƯỜI DÙNG\n(Clients)", fontsize=10.5, fontweight='bold', color='#FFFFFF', ha='center', va='center')

ax.text(9, 69, "Trình duyệt Web\n(Web Browser)", fontsize=9.2, fontweight='bold', color=COLOR_TEXT_TITLE, ha='center', va='center')
ax.text(9, 58, "• Học viên\n• Giảng viên\n• Quản trị viên", fontsize=8.8, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.6)

c_port_box = FancyBboxPatch((3.8, 43), 10.4, 7, boxstyle="round,pad=0.1,rounding_size=0.6",
                            facecolor='#DBEAFE', edgecolor='#93C5FD', linewidth=1)
ax.add_patch(c_port_box)
ax.text(9, 46.5, "HTTP / HTTPS\nCổng 3000 & 8000", fontsize=8.0, fontweight='bold', color='#1E40AF', ha='center', va='center')


# 3. Middle Area: Docker Host Environment (x: 17.5 -> 73.0, w: 55.5)
d_box = FancyBboxPatch((17.5, 10), 55.5, 75, boxstyle="round,pad=0.4,rounding_size=1.5",
                      facecolor=COLOR_DOCKER_BG, edgecolor=COLOR_DOCKER_BRD, linewidth=2.2, linestyle='--')
ax.add_patch(d_box)

d_bar = FancyBboxPatch((19, 78.5), 52.5, 5.0, boxstyle="round,pad=0.1,rounding_size=0.8",
                       facecolor='#E0F2FE', edgecolor='#BAE6FD', linewidth=1.2)
ax.add_patch(d_bar)
ax.text(21, 81, "DOCKER HOST ENVIRONMENT (docker-compose.yml)",
        fontsize=10.5, fontweight='bold', color='#0369A1', ha='left', va='center')
ax.text(69.5, 81, "Mạng nội bộ: default bridge",
        fontsize=9, fontstyle='italic', color='#0284C7', ha='right', va='center')

# --- TOP ROW INSIDE DOCKER ---
# Frontend Card (x: 19.5, y: 52, w: 23, h: 24)
fe_card = FancyBboxPatch((19.5, 52), 23, 24, boxstyle="round,pad=0.2,rounding_size=0.9",
                         facecolor=COLOR_CARD_BG, edgecolor=C_FRONTEND, linewidth=1.6)
ax.add_patch(fe_card)
fe_top = FancyBboxPatch((19.5, 71), 23, 5, boxstyle="round,pad=0.1,rounding_size=0.6",
                        facecolor=C_FRONTEND, edgecolor=C_FRONTEND)
ax.add_patch(fe_top)
ax.text(31, 73.5, "Frontend Web (smart_lms_frontend)", fontsize=9.0, fontweight='bold', color='#FFFFFF', ha='center', va='center')

fe_port = FancyBboxPatch((21.5, 65.5), 19, 3.8, boxstyle="round,pad=0.1,rounding_size=0.4",
                         facecolor='#EFF6FF', edgecolor='#BFDBFE')
ax.add_patch(fe_port)
ax.text(31, 67.4, "Cổng Ánh Xạ: 3000:3000", fontsize=8.2, fontweight='bold', color='#1D4ED8', ha='center', va='center')

ax.text(31, 58.5, "• Next.js 14 App Router • SSR & CSR\n• Giao diện Gia sư AI RAG & Khóa học\n• Tương thích thiết bị di động & máy tính",
        fontsize=8.0, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.5)


# Backend Card (x: 48, y: 52, w: 23.5, h: 24)
be_card = FancyBboxPatch((48, 52), 23.5, 24, boxstyle="round,pad=0.2,rounding_size=0.9",
                         facecolor=COLOR_CARD_BG, edgecolor=C_BACKEND, linewidth=1.6)
ax.add_patch(be_card)
be_top = FancyBboxPatch((48, 71), 23.5, 5, boxstyle="round,pad=0.1,rounding_size=0.6",
                        facecolor=C_BACKEND, edgecolor=C_BACKEND)
ax.add_patch(be_top)
ax.text(59.75, 73.5, "Backend API (smart_lms_backend)", fontsize=9.0, fontweight='bold', color='#FFFFFF', ha='center', va='center')

be_port = FancyBboxPatch((50, 65.5), 19.5, 3.8, boxstyle="round,pad=0.1,rounding_size=0.4",
                         facecolor='#F0FDFA', edgecolor='#99F6E4')
ax.add_patch(be_port)
ax.text(59.75, 67.4, "Cổng Ánh Xạ: 8000:8000", fontsize=8.2, fontweight='bold', color='#0F766E', ha='center', va='center')

ax.text(59.75, 58.5, "• FastAPI • SQLAlchemy Async • JWT Auth\n• Quản lý khóa học, bài tập & Quiz bảo mật\n• Cấp chứng chỉ số xác thực bằng mã HMAC",
        fontsize=8.0, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.5)


# --- BOTTOM ROW INSIDE DOCKER ---
# Left Sub-Column: Databases (Postgres & Redis)
# PostgreSQL Card (x: 19.5, y: 30, w: 23.5, h: 16)
db_card = FancyBboxPatch((19.5, 30), 23.5, 16, boxstyle="round,pad=0.2,rounding_size=0.8",
                         facecolor=COLOR_CARD_BG, edgecolor=C_DB, linewidth=1.5)
ax.add_patch(db_card)
db_top = FancyBboxPatch((19.5, 41.5), 23.5, 4.5, boxstyle="round,pad=0.1,rounding_size=0.5",
                        facecolor=C_DB, edgecolor=C_DB)
ax.add_patch(db_top)
ax.text(31.25, 43.7, "PostgreSQL 16 + pgvector (smart_lms_db)", fontsize=8.4, fontweight='bold', color='#FFFFFF', ha='center', va='center')

ax.text(31.25, 37.2, "Cổng: 5432:5432 • Volume: pgdata", fontsize=8.0, fontweight='bold', color='#047857', ha='center', va='center')
ax.text(31.25, 33.2, "• Lưu dữ liệu quan hệ & Vector nhúng (HNSW)", fontsize=7.6, color=COLOR_TEXT_SUB, ha='center', va='center')


# Redis Card (x: 19.5, y: 12.5, w: 23.5, h: 15)
rd_card = FancyBboxPatch((19.5, 12.5), 23.5, 15, boxstyle="round,pad=0.2,rounding_size=0.8",
                         facecolor=COLOR_CARD_BG, edgecolor=C_REDIS, linewidth=1.5)
ax.add_patch(rd_card)
rd_top = FancyBboxPatch((19.5, 23), 23.5, 4.5, boxstyle="round,pad=0.1,rounding_size=0.5",
                        facecolor=C_REDIS, edgecolor=C_REDIS)
ax.add_patch(rd_top)
ax.text(31.25, 25.2, "Redis 7 In-Memory (smart_lms_redis)", fontsize=8.4, fontweight='bold', color='#FFFFFF', ha='center', va='center')

ax.text(31.25, 19, "Cổng: 6379:6379 • Volume: redisdata", fontsize=8.0, fontweight='bold', color='#B45309', ha='center', va='center')
ax.text(31.25, 15, "• Bộ nhớ đệm Cache & Kiểm soát Rate Limit", fontsize=7.6, color=COLOR_TEXT_SUB, ha='center', va='center')


# Right Sub-Column: AI Service Card (x: 48, y: 12.5, w: 23.5, h: 33.5)
ai_card = FancyBboxPatch((48, 12.5), 23.5, 33.5, boxstyle="round,pad=0.2,rounding_size=0.9",
                         facecolor=COLOR_CARD_BG, edgecolor=C_AI, linewidth=1.6)
ax.add_patch(ai_card)
ai_top = FancyBboxPatch((48, 41.5), 23.5, 4.5, boxstyle="round,pad=0.1,rounding_size=0.6",
                        facecolor=C_AI, edgecolor=C_AI)
ax.add_patch(ai_top)
ax.text(59.75, 43.7, "AI Engine (smart_lms_ai_service)", fontsize=8.8, fontweight='bold', color='#FFFFFF', ha='center', va='center')

ai_port = FancyBboxPatch((50, 36.2), 19.5, 3.6, boxstyle="round,pad=0.1,rounding_size=0.4",
                         facecolor='#FAF5FF', edgecolor='#E9D5FF')
ax.add_patch(ai_port)
ax.text(59.75, 38.0, "Expose: 8001 (Chỉ truy cập nội bộ)", fontsize=7.8, fontweight='bold', color='#6B21A8', ha='center', va='center')

ax.text(59.75, 25.5, "• Động cơ RAG Chatbot (SSE Streaming)\n• Phân đoạn tài liệu PDF, phụ đề Video\n• Tóm tắt bài giảng & Tạo câu hỏi Quiz\n• Xác thực bảo mật: INTERNAL_API_KEY",
        fontsize=8.0, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.6)


# 4. Right Column: Cloud Services (x: 84.5 -> 97.5, w: 13)
ext_box = FancyBboxPatch((84.5, 12.5), 13, 72.5, boxstyle="round,pad=0.3,rounding_size=1.2",
                         facecolor='#F0FDF4', edgecolor='#16A34A', linewidth=1.8)
ax.add_patch(ext_box)

ext_pill = FancyBboxPatch((84.5, 79), 13, 6, boxstyle="round,pad=0.1,rounding_size=0.8",
                          facecolor='#16A34A', edgecolor='#16A34A')
ax.add_patch(ext_pill)
ax.text(91, 82, "DỊCH VỤ CLOUD\n(External)", fontsize=10.0, fontweight='bold', color='#FFFFFF', ha='center', va='center')

# Cloudflare R2 Card
r2_box = FancyBboxPatch((85.5, 52), 11, 24, boxstyle="round,pad=0.2,rounding_size=0.8",
                        facecolor='#FFFFFF', edgecolor='#86EFAC', linewidth=1.4)
ax.add_patch(r2_box)
ax.text(91, 71.5, "Cloudflare R2\n(Object Storage)", fontsize=8.8, fontweight='bold', color='#15803D', ha='center', va='center')
ax.text(91, 60, "• Lưu Video bài học\n• Lưu Slide PDF\n• Presigned URL (1h)\n  bảo vệ bản quyền",
        fontsize=7.6, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.4)

# Google Gemini API Card
gm_box = FancyBboxPatch((85.5, 17), 11, 29, boxstyle="round,pad=0.2,rounding_size=0.8",
                        facecolor='#FFFFFF', edgecolor='#86EFAC', linewidth=1.4)
ax.add_patch(gm_box)
ax.text(91, 41, "Google Gemini API\n(LLM & Vectors)", fontsize=8.8, fontweight='bold', color='#15803D', ha='center', va='center')
ax.text(91, 28, "• gemini-1.5-flash\n  (Xử lý ngữ cảnh RAG)\n• text-embedding-004\n  (Vector 768 chiều)",
        fontsize=7.6, color=COLOR_TEXT_SUB, ha='center', va='center', linespacing=1.4)


# 5. Connectors & Arrows
arr_simple = ArrowStyle("Simple, head_length=5.5, head_width=5.5, tail_width=1.8")

# Client -> Frontend (HTTP 3000)
ax.add_patch(FancyArrowPatch((15, 64), (19.5, 64), arrowstyle=arr_simple, color='#2563EB', mutation_scale=1.2))

# Frontend <-> Backend (REST API :8000)
ax.add_patch(FancyArrowPatch((42.5, 64), (48, 64), arrowstyle="<->, head_length=5, head_width=5", color='#0F172A', mutation_scale=1.2))
ax.text(45.25, 66.5, "REST API", fontsize=7.8, fontweight='bold', color='#0F172A', ha='center')

# Backend <-> Cloudflare R2 (S3 API)
# Gap between Backend (x=71.5) and Cloudflare R2 (x=85.5) is 14 units wide!
# Docker dashed line is at x=73.0.
# Arrow goes from 71.5 to 85.5 at y=64.
ax.add_patch(FancyArrowPatch((71.5, 64), (85.5, 64), arrowstyle="<->, head_length=5, head_width=5", color='#16A34A', mutation_scale=1.2))
# Place label at x=79 (right in the middle of gap 73->85.5), y=66.5
ax.text(79, 66.8, "S3 Presigned", fontsize=7.8, fontweight='bold', color='#15803D', ha='center')

# Backend <-> AI Service (Vertical Connection)
# Backend bottom is at y=52, AI Engine top is at y=46. Gap is 6 units.
ax.add_patch(FancyArrowPatch((55, 52), (55, 46), arrowstyle="<->, head_length=4.5, head_width=4.5", color='#7C3AED', mutation_scale=1.2))
ax.text(58, 49, "HTTP:8001 (Internal Key)", fontsize=7.5, fontweight='bold', color='#7C3AED', ha='left', va='center')

# AI Service <-> Google Gemini API
# Arrow from x=71.5 to x=85.5 at y=29.
ax.add_patch(FancyArrowPatch((71.5, 29), (85.5, 29), arrowstyle="<->, head_length=5, head_width=5", color='#16A34A', mutation_scale=1.2))
# Place label at x=79, y=31.5
ax.text(79, 31.8, "HTTPS API", fontsize=7.8, fontweight='bold', color='#15803D', ha='center')

# Backend & AI Service to PostgreSQL
# From Backend (48, 52) to Postgres (43, 44)
ax.add_patch(FancyArrowPatch((48, 52), (43, 44), arrowstyle=arr_simple, color='#059669', mutation_scale=1.1))
# From AI Engine (48, 38) to Postgres (43, 38)
ax.add_patch(FancyArrowPatch((48, 38), (43, 38), arrowstyle=arr_simple, color='#059669', mutation_scale=1.1))
ax.text(45.5, 41.5, "SQL", fontsize=7.5, fontweight='bold', color='#059669', ha='center')

# Backend to Redis (routed cleanly in the corridor x=44 to x=48)
ax.add_patch(FancyArrowPatch((48, 52), (43, 20), arrowstyle=arr_simple, color='#D97706', mutation_scale=1.1, connectionstyle="arc3,rad=0.06"))
ax.text(46, 23.5, "Cache", fontsize=7.5, fontweight='bold', color='#D97706', ha='center')


# 6. Bottom Clean Summary Note
foot = FancyBboxPatch((3.5, 2), 93, 5.5, boxstyle="round,pad=0.2,rounding_size=0.8",
                      facecolor='#F1F5F9', edgecolor='#CBD5E1', linewidth=1.2)
ax.add_patch(foot)
ax.text(50, 4.8, "Tóm tắt: Toàn bộ 5 dịch vụ container được điều phối đồng bộ qua lệnh 'docker compose up -d'.",
        fontsize=9.5, fontweight='bold', color='#1E293B', ha='center', va='center')
ax.text(50, 2.8, "Mạng nội bộ cô lập an toàn • Dữ liệu lưu trữ bền vững với Volumes (pgdata, redisdata) • Tích hợp đám mây Cloudflare R2 & Gemini AI",
        fontsize=8.5, color='#475569', ha='center', va='center')

# Save PNG (300 DPI) and SVG
png_path = r"D:\all_my_project\smart-lms\hinh17_trienkhai_docker_compose.png"
svg_path = r"D:\all_my_project\smart-lms\hinh17_trienkhai_docker_compose.svg"

plt.savefig(png_path, dpi=300, facecolor='#FFFFFF', bbox_inches='tight')
plt.savefig(svg_path, format='svg', facecolor='#FFFFFF', bbox_inches='tight')
plt.close()

print(f"Generated clean diagram successfully!")

# Copy to artifact folder
artifact_dir = r"C:\Users\works\.gemini\antigravity\brain\4c4dcd05-1ff9-4b9a-87b5-85d47c0ede9e"
if os.path.exists(artifact_dir):
    shutil.copy(png_path, os.path.join(artifact_dir, "hinh17_trienkhai_docker_compose.png"))
    print("Copied to artifact directory.")
