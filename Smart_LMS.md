# 🎓 Smart LMS – Hệ thống Quản lý Đào tạo Trực tuyến với Trợ lý Gia sư AI

> **Stack:** Next.js 14 + FastAPI (Python) + PostgreSQL + pgvector + Gemini API

---

## 📌 Tổng quan dự án

| Thông tin | Chi tiết |
|---|---|
| **Tên dự án** | Smart Learning Management System (Smart LMS) |
| **Mục tiêu** | Nền tảng học trực tuyến tích hợp AI Gia sư 24/7 hiểu đúng nội dung bài giảng |
| **Đối tượng** | Học viên, Giáo viên, Tổ chức đào tạo, Doanh nghiệp |
| **Ngôn ngữ** | Tiếng Việt + Tiếng Anh |

---

## 🤖 3 AI Cốt lõi

### 1. AI Gia sư RAG – Hiểu đúng bài đang học
- Học viên hỏi → AI tìm trong nội dung bài giảng → Trả lời đúng ngữ cảnh
- Trích dẫn chính xác timestamp trong video
- Streaming realtime qua SSE

### 2. AI Sinh đề Trắc nghiệm Tự động
- Giáo viên upload PDF/DOCX → AI tạo câu hỏi + 4 đáp án + giải thích
- Dùng Pydantic Structured Output → JSON chuẩn lưu thẳng DB
- Giảm 80% thời gian soạn đề

### 3. AI Chấm bài theo Rubric
- Giáo viên định nghĩa tiêu chí → AI chấm từng tiêu chí
- Nhận xét chi tiết: điểm mạnh, điểm yếu, gợi ý
- Phát hiện bài làm sao chép, thiếu tư duy

---

## 🏗️ Cấu trúc Dự án

```
smart-lms/
├── frontend/                   # Next.js 14
├── backend/                    # FastAPI Python
├── ai-service/                 # AI Engine
├── docker-compose.yml
└── README.md
```

---

## ⚛️ Frontend – Next.js 14

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   │
│   ├── (student)/
│   │   ├── dashboard/page.tsx          # Tổng quan học tập
│   │   ├── courses/
│   │   │   ├── page.tsx                # Danh sách khóa học
│   │   │   └── [id]/
│   │   │       ├── page.tsx            # Chi tiết khóa học
│   │   │       └── learn/page.tsx      # Học: Video + AI Chat
│   │   ├── quiz/[id]/page.tsx          # Làm bài kiểm tra
│   │   └── progress/page.tsx           # Tiến độ học tập
│   │
│   ├── (instructor)/
│   │   ├── dashboard/page.tsx
│   │   ├── courses/
│   │   │   ├── create/page.tsx         # Tạo khóa học
│   │   │   └── [id]/manage/page.tsx    # Quản lý bài học
│   │   └── quiz/generate/page.tsx      # Sinh đề AI
│   │
│   └── (admin)/
│       ├── dashboard/page.tsx
│       ├── users/page.tsx
│       └── analytics/page.tsx
│
├── components/
│   ├── ai-tutor/
│   │   ├── ChatBox.tsx                 # Giao diện chat AI
│   │   ├── ChatMessage.tsx
│   │   └── StreamingText.tsx           # Hiển thị streaming SSE
│   ├── course/
│   │   ├── VideoPlayer.tsx
│   │   ├── LessonSidebar.tsx
│   │   └── ProgressBar.tsx
│   └── quiz/
│       ├── QuizCard.tsx
│       └── ResultCard.tsx
│
└── lib/
    ├── api.ts                           # Axios config
    └── hooks/
        ├── useAIChat.ts                 # Hook chat streaming
        └── useCourse.ts
```

---

## ⚡ Backend – FastAPI

```
backend/
├── app/
│   ├── main.py                         # Entry point
│   ├── core/
│   │   ├── config.py                   # Settings từ .env
│   │   ├── database.py                 # PostgreSQL async
│   │   └── security.py                 # JWT, bcrypt, RBAC
│   │
│   ├── api/v1/
│   │   ├── auth.py                     # Đăng ký / Đăng nhập
│   │   ├── courses.py                  # CRUD khóa học
│   │   ├── lessons.py                  # CRUD bài học
│   │   ├── quiz.py                     # Bài kiểm tra
│   │   ├── progress.py                 # Tiến độ học viên
│   │   ├── ai_tutor.py                 # Chat AI (SSE stream)
│   │   └── ai_quiz_gen.py              # Sinh đề AI
│   │
│   ├── models/                         # SQLAlchemy ORM
│   │   ├── user.py
│   │   ├── course.py
│   │   ├── lesson.py
│   │   ├── quiz.py
│   │   └── progress.py
│   │
│   ├── schemas/                        # Pydantic validation
│   │   ├── user.py
│   │   ├── course.py
│   │   └── quiz.py
│   │
│   └── services/
│       ├── course_service.py
│       ├── progress_service.py
│       └── payment_service.py
│
├── alembic/                            # Migration DB
├── .env                                # Biến môi trường
└── requirements.txt
```

---

## 🤖 AI Service – Engine AI

```
ai-service/
├── main.py                             # FastAPI AI riêng
│
├── pipelines/
│   ├── rag_pipeline.py                 # RAG: hỏi đáp bài giảng
│   ├── quiz_generator.py               # Sinh câu hỏi trắc nghiệm
│   ├── grader.py                       # Chấm bài tự luận Rubric
│   └── summarizer.py                   # Tóm tắt bài giảng
│
├── document_processor/
│   ├── pdf_parser.py                   # Đọc PDF, DOCX
│   ├── video_transcriber.py            # Whisper: video → text
│   ├── chunker.py                      # Chia văn bản tối ưu
│   └── embedder.py                     # Tạo vector embedding
│
├── vector_store/
│   └── pgvector_store.py               # Lưu/tìm vector PostgreSQL
│
├── prompts/
│   ├── tutor_prompt.py                 # Prompt AI gia sư
│   ├── quiz_prompt.py                  # Prompt sinh đề
│   └── grader_prompt.py               # Prompt chấm bài
│
└── schemas/
    └── quiz_schema.py                  # Pydantic Structured Output
```

---

## 🗄️ Database Schema

```sql
-- Người dùng
users (id, name, email, password_hash, role, avatar, created_at)

-- Khóa học
courses (id, title, description, instructor_id, price, thumbnail, status)

-- Bài học
lessons (id, course_id, title, video_url, duration, order_index)

-- Vector: nội dung bài giảng đã embedding
lesson_chunks (id, lesson_id, content, timestamp_start,
               embedding vector(1536), created_at)

-- Câu hỏi trắc nghiệm
quizzes (id, lesson_id, title, questions jsonb, created_by_ai)

-- Kết quả thi
submissions (id, user_id, quiz_id, score, answers jsonb, submitted_at)

-- Tiến độ học tập
progress (id, user_id, lesson_id, percent_complete, last_watched_at)

-- Lịch sử chat AI
chat_history (id, user_id, lesson_id, messages jsonb, created_at)
```

---

## 🔄 Kiến trúc Hệ thống

```
┌─────┐
│                    Next.js Frontend                     │
│   Student UI | Instructor UI | Admin UI | AI Chat UI   │
└──┬───────┬───────┘
             │ REST API                 │ SSE Streaming
┌──▼──┐  ┌▼─────┐
│    FastAPI Backend      │  │       AI Service          │
│  Auth | Course | Quiz   │─►│  RAG | Quiz Gen | Grader  │
│  Progress | Payment     │  │  Summarizer | Transcriber │
└──┬──┘  └┬─────┘
             │                          │
┌──▼───────▼─────┐
│              PostgreSQL + pgvector extension           │
│    Dữ liệu quan hệ        Vector Embeddings (1536d)   │
└───┘
             │
┌──▼┐
│  Redis (Cache/Queue)  │  ← Celery workers xử lý nền
└────┘     (upload video, gửi email)
```

---

## 💰 Mô hình Kinh doanh

| Mô hình | Mô tả | Doanh thu |
|---|---|---|
| **Subscription** | AI Tutor 24/7 theo tháng | 99k–399k/tháng/người |
| **Marketplace** | Hoa hồng khóa học giáo viên đăng bán | 25–30% |
| **B2B** | Bán cho doanh nghiệp, trường học | 20–500tr/năm/hợp đồng |
| **Chứng chỉ AI-Verified** | Thu phí thi & cấp chứng chỉ | 299k/lần |

---

## 📅 Lộ trình Phát triển

### Phase 1 – MVP (Tháng 1–2)
- [ ] Setup project (Next.js + FastAPI + PostgreSQL + Docker)
- [ ] Auth: Đăng ký, đăng nhập, JWT, phân quyền
- [ ] CRUD: Khóa học, Bài học, Upload video
- [ ] AI Gia sư RAG cơ bản (PDF → Vector → Chat)

### Phase 2 – Core Features (Tháng 3–4)
- [ ] AI sinh đề trắc nghiệm từ tài liệu
- [ ] Video transcription (Whisper) → Vector
- [ ] Hệ thống bài kiểm tra + chấm điểm tự động
- [ ] Dashboard tiến độ học tập

### Phase 3 – Enhancement (Tháng 5–6)
- [ ] AI chấm bài tự luận theo Rubric
- [ ] Cá nhân hóa lộ trình học tập
- [ ] Gamification (XP, Badge, Leaderboard)
- [ ] Tích hợp thanh toán (VNPay, MoMo)

### Phase 4 – Scale (Tháng 7+)
- [ ] B2B White-label
- [ ] Chứng chỉ AI-Verified (QR code)
- [ ] Phân tích học viên nâng cao
- [ ] App mobile (React Native)

---

## 🛠️ Cài đặt Môi trường

### Yêu cầu
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+ (với pgvector extension)
- Docker & Docker Compose
- Git

### Biến môi trường Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/smart_lms
SECRET_KEY=your-secret-key-here
GEMINI_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key (optional)
REDIS_URL=redis://localhost:6379
AWS_S3_BUCKET=your-bucket (for video storage)
```

### Biến môi trường Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

---

## 🚀 Khởi động Dự án

```bash
# Clone project
git clone https://github.com/your-username/smart-lms.git
cd smart-lms

# Chạy toàn bộ bằng Docker
docker-compose up -d

# Hoặc chạy từng service

# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# AI Service
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Frontend
cd frontend
npm install
npm run dev
```

---

## 📚 Tài liệu tham khảo

- [FastAPI Docs](https://fastapi.tiangolo.com)
- [Next.js 14 Docs](https://nextjs.org/docs)
- [LangChain Docs](https://python.langchain.com)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Google Gemini API](https://ai.google.dev)
- [OpenAI Whisper](https://github.com/openai/whisper)

---

*Cập nhật lần cuối: 06/10/2026*
