# Smart LMS — Hệ thống Quản lý Đào tạo Trực tuyến với Trợ lý Gia sư AI

Nền tảng học tập trực tuyến tích hợp **Gia sư AI theo ngữ cảnh bài học** (Lesson-bounded RAG), **sinh đề trắc nghiệm** và **chấm tự luận theo rubric** dựa trên tài liệu của đúng bài giảng.

> Tài liệu mô tả kỹ thuật chi tiết: [`Smart_LMS.md`](./Smart_LMS.md)
> Phân tích thuyết minh và hướng triển khai: [`PHAN_TICH_THUYET_MINH_VA_HUONG_TRIEN_KHAI.md`](./PHAN_TICH_THUYET_MINH_VA_HUONG_TRIEN_KHAI.md)
> Hướng dẫn chạy: [`HUONG_DAN_CHAY.md`](./HUONG_DAN_CHAY.md)

---

## Kiến trúc

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Radix/shadcn, TanStack Query.
- **Backend**: Python FastAPI, SQLAlchemy 2.0 async, Alembic, JWT + phân quyền 3 vai trò.
- **AI Service**: FastAPI riêng, gọi trực tiếp Google Generative AI SDK (Gemini), fallback Groq. **Không dùng LangChain/LlamaIndex trong pipeline.**
- **Database & Vector Store**: PostgreSQL 16 + `pgvector` trên Supabase, vector 768 chiều, khoảng cách Cosine.
- **Streaming**: SSE cho câu trả lời của Gia sư AI.
- **Lưu trữ**: ảnh/thumbnail trên Cloudinary (`smart-lms/courses`), tài liệu/video trên Cloudflare R2 (signed URL 1 giờ).

---

## Chạy hệ thống

Chạy **3 service riêng**, không dùng Docker:

```powershell
# Backend — cổng 8000
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# AI Service — cổng 8001
cd ai-service
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001

# Frontend — cổng 3000
cd frontend
npm run dev
```

- Giao diện: `http://127.0.0.1:3000`
- Backend API docs: `http://127.0.0.1:8000/api/v1/docs`
- AI Service docs: `http://127.0.0.1:8001/docs`

Cài đặt, biến môi trường, migration và script vận hành: xem [`HUONG_DAN_CHAY.md`](./HUONG_DAN_CHAY.md).

---

## Điểm kỹ thuật chính

1. **Lesson-bounded RAG**: chỉ tìm trong `document_chunks` của bài đang mở; lọc bằng chứng theo similarity + trùng từ khóa; không có bằng chứng thì từ chối thay vì suy đoán; khi có bằng chứng thì mở rộng ±1 chunk lân cận cùng tài liệu.
2. **Trích dẫn nguồn**: trả `filename`, `document_title`, `start_seconds`/`end_seconds` cho phụ đề; `page` khi tài liệu PDF có metadata.
3. **Structured Output**: sinh trắc nghiệm qua Pydantic schema + `response_mime_type=application/json`, backend chuẩn hóa lại 4 phương án và đáp án trước khi lưu.
4. **SSE streaming**: backend chuyển tiếp từng dòng từ AI Service và lưu câu trả lời hoàn chỉnh vào `chat_messages`.
5. **Kiểm soát chi phí AI**: hạn mức theo người/ngày (tutor 80, sinh đề 40, chấm bài 60), trả `429` + `Retry-After`; token ghi vào `ai_usage_logs` kèm `is_estimated`.
6. **Đo lường**: `learning_events` theo lô, feedback hữu ích/không hữu ích cho câu trả lời AI, analytics giảng viên (`/instructor/analytics`) và admin.
7. **Đánh giá RAG**: `ai-service/evaluate_rag_v2.py` đo Hit Rate, Context Precision, Citation Rate, Refusal Accuracy, Faithfulness proxy.

Kết quả eval v2 trên bộ pilot 8 câu (05/11/2026): Hit Rate@4 100 %, Context Precision@4 55 %, Citation Rate 100 %, Refusal Accuracy 100 %, Faithfulness proxy 53,06 %. Đây là **benchmark kỹ thuật**, chưa phải đánh giá khoa học — xem [`ai-service/BENCHMARK_RAG_V2.md`](./ai-service/BENCHMARK_RAG_V2.md).

---

## Trạng thái dữ liệu

Hệ thống **chưa có người dùng thật**. Dữ liệu hiện tại là seed/demo:

- 10 tài khoản (2 admin, 5 giảng viên, 3 học viên), 42 khóa (7 published, 35 draft).
- 595 chunk/119 bài, provenance 100 % (document 318, youtube_subtitle 267, transcript 10).
- 3 học liệu tải lên ở 2 bài: 1 video `ready`, 2 tài liệu sai chủ đề đã bị cách ly (`failed`).
- 0 đánh giá khóa học; 23 lượt gọi AI; 6 sự kiện học tập (gồm `login` test).

Không dùng các số liệu này để tuyên bố "đã thử nghiệm với sinh viên" khi chưa chạy pilot thật.
