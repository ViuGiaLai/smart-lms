# 🎓 Smart LMS (Hệ thống Quản lý Đào tạo Trực tuyến với Trợ lý Gia sư AI)

Dự án nghiên cứu và phát triển nền tảng học tập trực tuyến thông minh (Smart LMS) tích hợp Trợ lý Gia sư ảo theo ngữ cảnh (Contextual AI Tutor) và bộ công cụ tự động sinh đề thi trắc nghiệm (AI Quiz Generator) bám sát tài liệu bài giảng.

---

## 🏛️ Kiến trúc Hệ thống

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Lucide icons.
- **Backend Core**: Python 3.11+ FastAPI (Asynchronous), SQLAlchemy 2.0 Async, Alembic, JWT Authentication (RBAC).
- **AI Service Engine**: FastAPI, LangChain, Google Gemini API / OpenAI, Whisper (Speech-to-Text), Pydantic Structured Outputs.
- **Database & Vector Store**: PostgreSQL 16 tích hợp extension `pgvector` (lưu trữ đồng nhất dữ liệu quan hệ và vector embeddings).
- **Cache & Realtime**: Redis, SSE (Server-Sent Events) streaming cho AI Chat.

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY (Chi tiết xem tại [HUONG_DAN_CHAY.md](./HUONG_DAN_CHAY.md))

### Cách 1: Khởi chạy bằng Docker Compose (Khuyên dùng)

> ⚠️ **LƯU Ý:** Bạn cần bật ứng dụng **Docker Desktop** trên Windows trước, chờ biểu tượng cá voi chuyển sang **màu xanh lá cây (Running)** rồi mới chạy lệnh:

```powershell
cd D:\all_my_project\smart-lms

# Khởi chạy toàn bộ hệ thống ở chế độ nền
docker compose up -d
```

- **Giao diện Web học tập:** `http://localhost:3000`
- **Màn hình Học & Chat AI:** `http://localhost:3000/courses/1/learn`
- **AI Sinh đề trắc nghiệm:** `http://localhost:3000/quiz/generate`
- **Backend API Docs (Swagger):** `http://localhost:8000/api/v1/docs`
- **AI Engine API Docs (Swagger):** khi chạy Docker, AI Service chỉ truy cập **nội bộ** từ Backend (không publish port 8001 ra host). Chạy AI Service trực tiếp (Cách 2 trong HUONG_DAN_CHAY.md) nếu cần mở `http://localhost:8001/docs`.

---

### Cách 2: Khởi chạy trực tiếp Giao diện Web (Next.js)
```powershell
cd D:\all_my_project\smart-lms\frontend
npm install
npm run dev
```
Truy cập ngay vào `http://localhost:3000`.

---

## 🎯 Điểm nổi bật về Kỹ thuật
1. **Lesson-Bounded RAG**: Chatbot giới hạn ngữ cảnh trong từng slide/bài học đang mở, trích dẫn số trang/thời gian, triệt tiêu ảo giác (Hallucination).
2. **Pydantic Structured Output**: Tự động sinh trắc nghiệm với JSON schema chuẩn hóa 100%, chống lỗi cú pháp khi lưu DB.
3. **SSE Real-time Streaming**: Trải nghiệm nhận câu trả lời dạng gõ máy chữ thời gian thực siêu mượt mà.
4. **Evaluation Benchmark**: Kèm script `ai-service/evaluate_rag.py` tự động đo lường Hit Rate @ K và Latency cho báo cáo khoa học.