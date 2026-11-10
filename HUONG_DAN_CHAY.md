# Hướng dẫn khởi chạy Smart LMS

Hệ thống chạy **3 service riêng**, không dùng Docker:

| Service | Cổng | Thư mục |
|---|---|---|
| Frontend (Next.js 14) | `3000` | `frontend` |
| Backend (FastAPI) | `8000` | `backend` |
| AI Service (FastAPI) | `8001` | `ai-service` |

Cơ sở dữ liệu là **PostgreSQL + pgvector trên Supabase (remote)**, không cần chạy PostgreSQL local. Redis là tùy chọn; nếu không có, backend vẫn chạy.

---

## 1. Chuẩn bị biến môi trường

### `backend/.env`
```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/<database>
SECRET_KEY=<chuỗi bí mật>
AI_SERVICE_URL=http://127.0.0.1:8001
AI_SERVICE_INTERNAL_KEY=<khớp INTERNAL_API_KEY của AI service>

CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>

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
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/<database>
GOOGLE_API_KEY=<Gemini API key>
GEMINI_API_KEY=<Gemini API key>
GROQ_API_KEY=<tùy chọn, dùng khi Gemini lỗi>
INTERNAL_API_KEY=<khớp AI_SERVICE_INTERNAL_KEY của backend>

RAG_CONTEXT_NEIGHBORS=1
RAG_MAX_CONTEXT_CHUNKS=9
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

---

## 2. Cài đặt lần đầu

```powershell
# Backend
cd D:\all_my_project\smart-lms\backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m alembic upgrade head

# AI Service
cd D:\all_my_project\smart-lms\ai-service
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# Frontend
cd D:\all_my_project\smart-lms\frontend
npm install
```

---

## 3. Khởi chạy (3 cửa sổ PowerShell)

### Backend — cổng 8000
```powershell
cd D:\all_my_project\smart-lms\backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- Swagger: `http://127.0.0.1:8000/api/v1/docs`
- Health: `http://127.0.0.1:8000/health`

### AI Service — cổng 8001
```powershell
cd D:\all_my_project\smart-lms\ai-service
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
```
- Health: `http://127.0.0.1:8001/health`

### Frontend — cổng 3000
```powershell
cd D:\all_my_project\smart-lms\frontend
npm run dev
```
- Giao diện: `http://127.0.0.1:3000`

Chạy production sau khi build:
```powershell
npm run build
npm run start
```

---

## 4. Đường dẫn chính

| Màn hình | URL |
|---|---|
| Trang chủ / danh mục khóa học | `http://127.0.0.1:3000` |
| Đăng nhập | `http://127.0.0.1:3000/login` |
| Học bài + Gia sư AI | `http://127.0.0.1:3000/courses/<id>/learn` |
| Bàn làm việc giảng viên | `http://127.0.0.1:3000/instructor-dashboard` |
| Phân tích học tập (giảng viên) | `http://127.0.0.1:3000/instructor/analytics` |
| Sinh đề trắc nghiệm | `http://127.0.0.1:3000/quiz/generate` |
| Quản trị | `http://127.0.0.1:3000/admin-dashboard` |
| API Backend | `http://127.0.0.1:8000/api/v1/docs` |
| API AI Service | `http://127.0.0.1:8001/docs` |

---

## 5. Migration

```powershell
cd D:\all_my_project\smart-lms\backend

# Xem revision hiện tại
.\venv\Scripts\python.exe -m alembic current

# Database trống: tạo toàn bộ schema
.\venv\Scripts\python.exe -m alembic upgrade head

# Database đã có bảng từ trước: đánh dấu baseline
.\venv\Scripts\python.exe -m alembic stamp head

# Sinh migration mới
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "mô tả thay đổi"
.\venv\Scripts\python.exe -m alembic upgrade head
```

Migration hiện tại: `0017_learning_events_ai_feedback`.
Bảng `document_chunks` (vector store) do AI Service quản lý nên không nằm trong migration của backend.

---

## 6. Script vận hành

Chạy trong `backend`:

```powershell
# Import lớp từ CSV (chạy không có --apply là chế độ xem trước)
.\venv\Scripts\python.exe -m scripts.import_class --csv danh_sach.csv --course-id 81
.\venv\Scripts\python.exe -m scripts.import_class --csv danh_sach.csv --course-id 81 --apply

# Chuyển khóa demo sang draft (chạy không có --apply là chế độ xem trước)
.\venv\Scripts\python.exe -m scripts.mark_demo_courses
.\venv\Scripts\python.exe -m scripts.mark_demo_courses --apply

# Phục hồi học liệu kẹt queued/processing
.\venv\Scripts\python.exe -m scripts.recover_stuck_materials

# Cách ly học liệu sai chủ đề, gỡ khỏi kho tri thức AI
.\venv\Scripts\python.exe -m scripts.quarantine_materials --material-id 2 --reason "Tệp không khớp bài học"
.\venv\Scripts\python.exe -m scripts.quarantine_materials --material-id 2 --reason "Tệp không khớp bài học" --apply
```

Chạy trong `ai-service`:

```powershell
# Kiểm tra provenance toàn bộ chunk
.\venv\Scripts\python.exe check_provenance.py

# Nạp transcript bài giảng còn thiếu vào pgvector
.\venv\Scripts\python.exe ingest_lesson_transcript.py --lesson-id 232 --apply
.\venv\Scripts\python.exe ingest_lesson_transcript.py --missing-only --apply

# Đánh giá RAG
.\venv\Scripts\python.exe evaluate_rag_v2.py --dataset eval_dataset_pilot.csv --top-k 4 --out BENCHMARK_RAG_V2.md
```

---

## 7. Kiểm tra nhanh sau khi khởi động

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing | Select-Object StatusCode
```

Kỳ vọng: backend `{"status":"ok"}`, AI service `{"status":"healthy"}`, frontend `200`.

Nếu Gemini hết hạn mức ngày, pipeline tự chuyển sang Groq (khi có `GROQ_API_KEY`); log sẽ có `429` từ Gemini nhưng câu trả lời vẫn trả về.

---

## 8. Lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Backend báo lỗi kết nối DB | `DATABASE_URL` sai hoặc Supabase chặn IP | Kiểm tra chuỗi kết nối, thêm IP vào allowlist |
| Gia sư AI trả lời "chưa có nội dung" | Bài chưa có chunk trong `document_chunks` | Chạy `ingest_lesson_transcript.py --lesson-id <id> --apply` hoặc tải tài liệu đúng |
| Học liệu mới tải mãi `queued/processing` | Tác vụ nền bị ngắt | Khởi động lại backend để `recover_stuck_materials` chuyển sang `failed`, rồi tải lại |
| `429` khi đăng nhập | Rate limit 10 request/phút/IP | Chờ 60 giây rồi thử lại |
| `429` khi gọi AI | Hết hạn mức ngày của người dùng | Chờ 00:00 UTC hoặc tăng biến `AI_*_DAILY_LIMIT` |
| Link học liệu hết hạn | Signed URL chỉ sống 1 giờ | Tải lại danh sách học liệu để lấy URL mới |
