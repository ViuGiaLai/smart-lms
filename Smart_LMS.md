# Smart LMS – Hệ thống Quản lý Đào tạo Trực tuyến tích hợp Trợ lý AI

Tài liệu này mô tả **đúng những gì đang chạy trong mã nguồn** tại thời điểm cập nhật, không dùng số liệu dự kiến. Các mục chưa triển khai được ghi rõ ở phần cuối.

---

## 1. Tổng quan

| Thông tin | Giá trị thực tế |
|---|---|
| Tên dự án | Smart Learning Management System (Smart LMS) |
| Frontend | Next.js 14 (App Router), cổng `3000` |
| Backend | FastAPI + SQLAlchemy 2.0 async, cổng `8000` |
| AI Service | FastAPI riêng, cổng `8001` |
| Cơ sở dữ liệu | PostgreSQL + pgvector (Supabase) |
| Mô hình ngôn ngữ | Google Gemini (`gemini-2.5-flash`, có fallback Groq) |
| Model nhúng | `models/gemini-embedding-001`, **768 chiều** |
| Lưu ảnh/thumbnail | Cloudinary (folder `smart-lms/courses`) |
| Lưu học liệu | Cloudflare R2 (S3-compatible) |
| Xác thực | JWT tự phát hành ở backend (không dùng NextAuth) |
| Triển khai khi phát triển | Chạy 3 service riêng, **không dùng Docker** |

---

## 2. Các nhóm chức năng AI

| Chức năng | Trạng thái | Endpoint / mã nguồn chính |
|---|---|---|
| Gia sư RAG theo bài học (lesson-bounded), streaming SSE | Đã triển khai | `POST /api/v1/ai-tutor/chat`, `ai-service/routers/rag.py`, `pipelines/rag_pipeline.py` |
| Lưu và xem lại lịch sử hội thoại | Đã triển khai | `GET/DELETE /api/v1/ai-tutor/history`, bảng `chat_messages` |
| Sinh đề trắc nghiệm có xem trước | Đã triển khai | `POST /api/v1/ai-quiz-gen/preview`, `/generate` |
| Chấm bài tự luận theo Rubric | Đã triển khai | `POST /api/v1/grading/evaluate`, `GET /grading/history`, bảng `essay_gradings` |
| Ghi nhận lượng token tiêu thụ | Đã triển khai | `ai-service/core/usage.py`, bảng `ai_usage_logs`, `GET /api/v1/admin/ai-monitoring` |
| Hạn mức AI theo người/ngày | Đã triển khai | `backend/app/services/ai_quota.py`; áp dụng cho tutor, sinh đề, chấm bài; trả `429` kèm `Retry-After` |
| Phản hồi câu trả lời AI | Đã triển khai | `PUT /api/v1/ai-tutor/messages/{id}/feedback`, bảng `ai_message_feedback` |
| Phân tích hành vi học tập | Đã triển khai | `POST /api/v1/events`, `GET /api/v1/instructor/courses/{id}/analytics`, `GET /api/v1/admin/analytics/overview` |
| Tóm tắt bài giảng & Flashcards | Đã triển khai | `POST /api/v1/courses/{c_id}/lessons/{l_id}/summarize`, `ai-service/routers/summarizer.py`, UI tab Tóm tắt bài học |
| Nhập video YouTube + phụ đề | Đã triển khai | `backend/app/api/v1/youtube.py`, `services/subtitle_service.py`, `services/transcript_service.py` |
| Khám phá học liệu (discovery) | Đã triển khai | `backend/app/api/v1/ai_discovery.py`, tab Discovery trong trang quản trị |

### Nguyên tắc chống ảo giác
- Truy xuất bị chặn theo `lesson_id`: `similarity_search_by_lesson`.
- Ngưỡng tương đồng tối thiểu `0.5`; không có chunk phù hợp thì trả lời rõ là bài học chưa đề cập.
- Nguồn trích dẫn kèm `start_seconds`/`end_seconds` để mở lại đúng đoạn video. Hiện **267/595 chunk** có mốc thời gian (phụ đề YouTube); **0 chunk** còn số trang vì tài liệu PDF duy nhất có `page` đã bị cách ly do sai chủ đề. Khi giảng viên tải PDF đúng, parser sẽ gắn `page` trở lại.
- Tải tài liệu mới cho bài sẽ **thay thế** tri thức AI cũ của bài đó (`delete_by_lesson`), giao diện cảnh báo trước khi tải.
- Câu hỏi ngoài phạm vi bài học bị lọc bằng chứng trước khi gọi LLM; nếu không có bằng chứng, hệ thống trả lời từ chối thay vì suy đoán. Khi đã có bằng chứng, pipeline mở rộng thêm ±1 chunk lân cận cùng tài liệu để không cắt ý câu hỏi tổng quan.

---

## 3. Kiến trúc và luồng xử lý

```
Trình duyệt (Next.js 3000)
    │  REST + SSE
    ▼
Backend FastAPI (8000) ──► PostgreSQL + pgvector (Supabase)
    │  HTTP nội bộ, header X-Internal-Api-Key
    │  kèm X-User-Id để ghi nhận token
    ▼
AI Service (8001) ──► Gemini API (chat, quiz, grader, embedding)
                └──► Groq API (fallback khi Gemini lỗi/hết hạn mức)
```

- Backend là nơi duy nhất kiểm tra quyền (enrollment, chủ khóa học, admin) trước khi gọi AI Service.
- AI Service chỉ mở trong mạng nội bộ; mọi đường dẫn trừ `/health` đều yêu cầu `X-Internal-Api-Key`.
- Hội thoại được Backend lưu vào PostgreSQL trong lúc chuyển tiếp SSE, không phụ thuộc vào việc trình duyệt có đóng tab hay không.
- Lượng token được AI Service ghi trực tiếp vào `ai_usage_logs`; nếu nhà cung cấp không trả `usage_metadata` thì ghi số ước lượng và đánh dấu `is_estimated = true`.

---

## 4. Cấu trúc thư mục (phần chính)

```
smart-lms/
├── frontend/                         # Next.js 14
│   ├── app/
│   │   ├── (student)/                # dashboard, courses, learn, quiz, progress, results, certificates
│   │   ├── (instructor)/             # dashboard, courses, materials, quiz, results, students, grading
│   │   └── (admin)/                  # admin-dashboard, youtube-import
│   ├── components/ai-tutor/          # ChatBox, ChatMessage, StreamingText
│   └── lib/
│       ├── api.ts                    # Axios + toàn bộ endpoint
│       └── hooks/useAIChat.ts        # SSE, lịch sử chat (server + localStorage)
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/                   # auth, courses, lessons, quiz, progress, ai_tutor,
│   │   │                             # ai_quiz_gen, grading, student, instructor, admin,
│   │   │                             # documents, uploads, youtube, categories, ai_discovery,
│   │   │                             # events, analytics
│   │   ├── models/                   # user, course, lesson, quiz, progress, enrollment,
│   │   │                             # chat_message, essay_grading, ai_usage, lesson_material,
│   │   │                             # learning_event, ai_feedback...
│   │   └── services/                 # course, enrollment, progress, quiz, subtitle, srt,
│   │                                 # transcript, youtube, object_storage, ai_quota
│   └── alembic/versions/             # 0001 → 0017
│
└── ai-service/
    ├── main.py
    ├── routers/                      # rag, quiz, grader, summarizer, documents, discovery
    ├── pipelines/                    # rag_pipeline, quiz_generator, grader, summarizer
    ├── document_processor/           # pdf_parser, chunker, embedder, video_transcriber
    ├── vector_store/pgvector_store.py
    ├── core/                         # config, database, usage, groq_client
    ├── prompts/
    ├── evaluate_rag.py               # benchmark cũ (Hit Rate / Precision / Latency)
    ├── evaluate_rag_v2.py            # benchmark mới: citation, refusal, faithfulness proxy
    └── ingest_lesson_transcript.py   # nạp transcript bài giảng còn thiếu vào pgvector
```

---

## 5. Cơ sở dữ liệu thực tế

Các bảng đang tồn tại trong schema `public`:

| Bảng | Vai trò | Cột chính |
|---|---|---|
| `users` | Tài khoản, phân quyền | `id`, `email`, `role`, `is_active`, `token_version` |
| `courses` | Khóa học | `id`, `instructor_id`, `title`, `thumbnail`, `status`, `slug` |
| `lessons` | Bài học | `id`, `course_id`, `title`, `video_url`, `transcript`, `subtitle_status`, `subtitle_srt` |
| `lesson_materials` | Học liệu tải lên | `lesson_id`, `file_url`, `storage_key`, `status`, `error_message` |
| `document_chunks` | Vector tri thức | `id (uuid)`, `lesson_id`, `content`, `chunk_index`, `embedding (768)`, `chunk_metadata` |
| `quizzes` | Đề trắc nghiệm | `id`, `course_id`, `lesson_id`, `title`, `is_ai_generated` |
| `quiz_questions` | Câu hỏi | `quiz_id`, `question_text`, `options (json)`, `correct_answer`, `explanation` |
| `quiz_submissions` | Bài nộp trắc nghiệm | `quiz_id`, `user_id`, `answers`, `score`, `passed`, `time_spent` |
| `chat_messages` | Lịch sử chat AI | `user_id`, `course_id`, `lesson_id`, `role`, `content`, `sources (json)` |
| `essay_gradings` | Kết quả chấm tự luận | `instructor_id`, `rubric`, `criteria_scores`, `total_score`, `grade_level` |
| `ai_usage_logs` | Token tiêu thụ | `feature`, `provider`, `model`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `is_estimated` |
| `learning_events` | Sự kiện học tập | `user_id`, `course_id`, `lesson_id`, `event_type`, `duration_seconds`, `event_metadata` |
| `ai_message_feedback` | Đánh giá câu trả lời AI | `message_id`, `user_id`, `rating (up/down)`, `comment`, unique `(message_id, user_id)` |
| `enrollments` | Ghi danh | `user_id`, `course_id` |
| `course_reviews` | Đánh giá khóa học | `course_id`, `user_id`, `rating (1-5)`, `comment`, unique `(course_id, user_id)` |
| `progress` | Tiến độ | `user_id`, `lesson_id`, `percent_complete`, `last_watched_at` |
| `student_topic_mastery` | Độ thành thạo theo chủ đề | `user_id`, `topic`, `mastery_score` |
| `learning_categories`, `education_levels` | Danh mục, cấp học | cây danh mục, mã cấp học |
| `discovery_jobs`, `discovery_items` | Khám phá học liệu | trạng thái job, kết quả đề xuất |

Vector dùng khoảng cách Cosine (`vector_cosine_ops`), số chiều **768**. **Đã tạo chỉ mục HNSW trên Supabase database** (`idx_document_chunks_embedding_hnsw` trên bảng `document_chunks` using hnsw vector_cosine_ops), giúp tối ưu tốc độ tìm kiếm vector tương đồng láng giềng gần nhất theo đúng thiết kế đề tài. Migration hiện tại là `0017_learning_events_ai_feedback`.

---

## 6. API chính

| Nhóm | Đường dẫn |
|---|---|
| Xác thực | `POST /api/v1/auth/register`, `/login`, `/refresh`, `/forgot-password` |
| Khóa học | `GET /api/v1/courses`, `/courses/{id}`, `/courses/slug/{slug}` |
| Học tập | `POST /api/v1/courses/{id}/enroll`, `POST /courses/{id}/lessons/{lessonId}/complete` |
| Đánh giá | `GET/PUT /api/v1/courses/{id}/reviews`, `DELETE /courses/{id}/reviews/{reviewId}` |
| Trắc nghiệm | `GET/POST /api/v1/quizzes/...`, `POST /api/v1/quizzes/{id}/submit` |
| Gia sư AI | `POST /api/v1/ai-tutor/chat`, `GET/DELETE /api/v1/ai-tutor/history`, `PUT /ai-tutor/messages/{id}/feedback` |
| Sinh đề AI | `POST /api/v1/ai-quiz-gen/preview`, `POST /api/v1/ai-quiz-gen/generate` |
| Chấm tự luận | `POST /api/v1/grading/evaluate`, `GET /api/v1/grading/history`, `DELETE /api/v1/grading/{id}` |
| Sự kiện học tập | `POST /api/v1/events` (lô tối đa 50 sự kiện, loại đóng); `login` do backend ghi tự động khi đăng nhập |
| Phân tích | `GET /api/v1/instructor/courses/{id}/analytics`, `GET /api/v1/admin/analytics/overview` |
| Giảng viên | `GET /api/v1/instructor/dashboard`, `/courses`, `/students`, `/quizzes`, `/materials` |
| Quản trị | `GET /api/v1/admin/stats`, `/admin/ai-monitoring`, `/admin/users`, `/admin/courses` |
| Học liệu | `POST /api/v1/documents/...`, `POST /api/v1/uploads/image` |
| YouTube | `POST /api/v1/youtube/analyze`, `/import`, `/lessons/{id}/subtitle/fetch` |

Tài liệu đầy đủ (OpenAPI) chạy tại `http://127.0.0.1:8000/docs`.

---

## 7. Biến môi trường

### `backend/.env`
```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/postgres
SECRET_KEY=<chuỗi bí mật tối thiểu 32 ký tự>
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_INTERNAL_KEY=<khớp INTERNAL_API_KEY của AI Service>

CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>
CLOUDINARY_FOLDER=smart-lms/courses

R2_ENDPOINT=<endpoint S3-compatible>
R2_BUCKET=<bucket>
R2_ACCESS_KEY_ID=<access key>
R2_SECRET_ACCESS_KEY=<secret key>
R2_PUBLIC_BASE_URL=<base url công khai>
R2_SIGNED_URL_EXPIRE_SECONDS=3600

# Hạn mức AI theo người/ngày (đặt 0 để tắt)
AI_TUTOR_DAILY_LIMIT=80
AI_QUIZ_DAILY_LIMIT=40
AI_GRADING_DAILY_LIMIT=60

# Tự chuyển học liệu kẹt queued/processing quá hạn sang failed khi khởi động
MATERIAL_STUCK_MINUTES=45
```

### `ai-service/.env`
```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/postgres
GOOGLE_API_KEY=<Gemini API key>
GEMINI_MODEL=gemini-flash-latest
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-001
GROQ_API_KEY=<tùy chọn, dùng khi Gemini lỗi>
INTERNAL_API_KEY=<khớp AI_SERVICE_INTERNAL_KEY của backend>

# Mở rộng ngữ cảnh RAG sang chunk lân cận cùng tài liệu
RAG_CONTEXT_NEIGHBORS=1
RAG_MAX_CONTEXT_CHUNKS=9
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## 8. Khởi động khi phát triển (không Docker)

```powershell
# 1. Backend
cd backend
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. AI Service
cd ai-service
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001

# 3. Frontend
cd frontend
npm run dev
```

Kiểm tra nhanh:
- Backend: `GET http://127.0.0.1:8000/health`
- AI Service: `GET http://127.0.0.1:8001/health`
- Frontend: `http://127.0.0.1:3000`

---

## 9. Benchmark RAG

### 9.1. Bộ đánh giá v2 (đang dùng)

Bộ đánh giá nằm tại `ai-service/evaluate_rag_v2.py`, dùng câu hỏi thật của các bài pilot trong `eval_dataset_pilot.csv` (8 câu: 5 trong phạm vi, 3 ngoài phạm vi; bài 185, 186, 187, 233, 234, 235).

```powershell
cd ai-service
.\venv\Scripts\python.exe .\evaluate_rag_v2.py --dataset eval_dataset_pilot.csv --top-k 4 --out BENCHMARK_RAG_V2.md
```

Kết quả đo ngày 05/11/2026 (chi tiết trong `ai-service/BENCHMARK_RAG_V2.md`):

| Chỉ số | Kết quả |
|---|---|
| Hit Rate @ 4 | 100,00 % |
| Context Precision @ 4 | 55,00 % |
| Keyword Recall | 90,00 % |
| Citation Rate | 100,00 % |
| Answer Keyword Coverage | 70,00 % |
| Refusal Accuracy | 100,00 % |
| Faithfulness proxy | 53,06 % |
| Latency truy xuất TB | 982,47 ms |
| Latency sinh câu trả lời TB | 4.642,19 ms |
| Lỗi | 0 |

Cấu hình đo: lesson-bounded, top-k = 4, mở rộng ±1 chunk lân cận cùng tài liệu. Ba câu ngoài phạm vi đều bị từ chối đúng; đây là điểm đã được sửa so với bản eval đầu tiên (bản đầu báo 0 % do bộ đo thiếu cụm từ từ chối của pipeline).

### 9.2. Bộ đánh giá cũ (lưu để đối chiếu)

`ai-service/evaluate_rag.py` chạy 8 câu trên 5 bài, chỉ đo Hit Rate/Precision/Latency:

| Top-K | Hit Rate | Context Precision | Latency trung bình |
|---|---|---|---|
| 1 | 87,50 % (7/8) | 87,50 % | 811,66 ms |
| 2 | 100,00 % (8/8) | 50,00 % | 952,19 ms |
| 4 | 100,00 % (8/8) | 25,00 % | 849,78 ms |

Ghi chú phương pháp: ground-truth cũ chỉ là 1 từ khóa; Precision giảm khi K tăng vì mỗi bài chỉ có một đoạn chứa đúng từ khóa. Cả hai bộ đều là **benchmark kỹ thuật trên dữ liệu pilot**, chưa phải đánh giá khoa học: cần 50–100 câu do giảng viên gán nhãn và chấm thủ công mẫu câu trả lời trước khi công bố.

---

## 10. Trạng thái triển khai và giới hạn

### Đã hoàn thiện
- Đăng ký/đăng nhập JWT, phân quyền học viên – giảng viên – quản trị viên; rate limit đăng nhập theo IP.
- Quản lý khóa học, bài học, học liệu; thumbnail Cloudinary; học liệu R2 trả URL có chữ ký 1 giờ, ẩn `storage_key`.
- Nhập video YouTube, tải phụ đề, chuyển phụ đề thành tri thức pgvector.
- Gia sư RAG streaming, trích dẫn nguồn, lưu lịch sử hội thoại, nút hữu ích/không hữu ích.
- Sinh đề trắc nghiệm AI có xem trước, lưu ngân hàng đề, gắn đề với bài học.
- Chấm bài tự luận theo Rubric, lưu lịch sử chấm.
- Giám sát dịch vụ và lượng token trên trang quản trị.
- Đánh giá khóa học: học viên đã ghi danh chấm 1-5 sao, nhận xét, điểm trung bình và phân bố sao; quản trị viên kiểm duyệt/xóa.
- Hạn mức AI theo người/ngày (tutor 80, sinh đề 40, chấm bài 60; đặt 0 để tắt).
- Sự kiện học tập và trang phân tích cho giảng viên/quản trị viên.
- Benchmark RAG v2 có số liệu lặp lại được, gồm cả kiểm tra từ chối câu ngoài phạm vi.
- Dọn dữ liệu demo: 32 khóa không có học liệu thật chuyển sang `draft`; giữ 7 khóa published có nội dung.
- Công cụ vận hành: `import_class.py`, `mark_demo_courses.py`, `recover_stuck_materials.py`, `quarantine_materials.py`, `ingest_lesson_transcript.py`.

### Chưa triển khai hoặc còn giới hạn
- Thanh toán/đăng ký gói trả phí (chưa có `payment_service`).
- Hàng đợi nền Redis/Celery: xử lý tài liệu hiện dùng `BackgroundTasks` của FastAPI.
- Tóm tắt bài giảng chưa có nút trên giao diện.
- Chứng chỉ điện tử có trang hiển thị nhưng chưa có quy trình cấp/phát hành tự động.
- Ứng dụng mobile, gamification, B2B white-label chưa nằm trong mã nguồn hiện tại.
- Đã tạo chỉ mục HNSW `idx_document_chunks_embedding_hnsw` trực tiếp trên bảng `document_chunks`.
- Hai học liệu bị cách ly do sai chủ đề (`lesson_materials.id=2` gắn ASP.NET vào bài React.js; `id=3` gắn ESP32 vào bài Power BI). Tệp vẫn trên R2, trạng thái `failed`, đã gỡ khỏi kho tri thức AI; cần giảng viên tải lại tài liệu đúng.
- Bài 232 (React.js) đã được nạp 2 chunk từ `lessons.transcript` để Gia sư AI trả lời được; nên bổ sung thêm slide/video transcript đầy đủ.
- 35/42 khóa đang `draft` (gồm 32 khóa demo đã dọn) — chỉ 7 khóa published, trong đó 2 khóa có học liệu tải lên thật.

---

*Cập nhật lần cuối: 05/11/2026 – đối chiếu trực tiếp với mã nguồn và cơ sở dữ liệu đang chạy.*
