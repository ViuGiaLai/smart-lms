# 🚀 HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG SMART LMS

Hệ thống Quản lý Đào tạo Trực tuyến với Trợ lý Gia sư Thông minh (Smart LMS) hỗ trợ 2 cách khởi chạy:
1. **Cách 1: Khởi chạy toàn bộ hệ thống bằng Docker (Khuyên dùng)**
2. **Cách 2: Khởi chạy trực tiếp từng thành phần (Frontend, Backend, AI Engine)**

---

## 📌 CÁCH 1: KHỞI CHẠY BẰNG DOCKER COMPOSE (ĐƠN GIẢN NHẤT)

### Bước 1: Mở Docker Desktop
> ⚠️ **LƯU Ý QUAN TRỌNG:** Trước khi gõ lệnh trong terminal, bạn **bắt buộc phải mở Docker Desktop trên Windows**:
1. Bấm phím **Windows** (hoặc mở Start Menu), gõ tìm `Docker Desktop` và nhấp mở.
2. Chờ khoảng **15 - 30 giây** cho đến khi góc dưới bên trái của cửa sổ Docker Desktop hiện biểu tượng **màu xanh lá cây (Docker Engine running)**.

### Bước 2: Điền khóa Google Gemini API
Mở tệp `ai-service\.env` (tại `D:\all_my_project\smart-lms\ai-service\.env`) và điền API key miễn phí của bạn:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Lấy API Key miễn phí tại: https://aistudio.google.com/app/apikey)*

### Bước 3: Chạy lệnh Docker Compose
Mở PowerShell tại thư mục dự án và thực hiện:
```powershell
cd D:\all_my_project\smart-lms

# Khởi động toàn bộ các container (Postgres pgvector, Redis, Backend, AI Service, Frontend)
docker compose up -d
```

### Bước 4: Kiểm tra trạng thái
```powershell
docker compose ps
```
Nếu muốn xem log hoạt động thời gian thực:
```powershell
docker compose logs -f
```

---

## 📌 CÁCH 2: KHỞI CHẠY TRỰC TIẾP TỪNG PHẦN (DEVELOPMENT MODE)

Nếu bạn muốn debug trực tiếp hoặc xem ngay giao diện Web:

### 1. Khởi chạy Giao diện Frontend (Next.js 14)
Máy tính của bạn đã có sẵn Node.js và npm. Mở một cửa sổ PowerShell:
```powershell
cd D:\all_my_project\smart-lms\frontend

# Cài đặt các thư viện (chỉ cần chạy lần đầu)
npm install

# Khởi động máy chủ giao diện Web
npm run dev
```
👉 Truy cập ngay vào: **`http://localhost:3000`**

---

### 2. Khởi chạy Cơ sở dữ liệu (PostgreSQL + pgvector)
Nếu không chạy toàn bộ docker compose, bạn có thể chỉ bật container Database:
```powershell
docker run -d --name smart_lms_db `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgrespassword `
  -e POSTGRES_DB=smart_lms `
  -p 5432:5432 `
  pgvector/pgvector:pg16
```

---

### 3. Khởi chạy Backend Core (FastAPI - Port 8000)
Mở một cửa sổ PowerShell mới:
```powershell
cd D:\all_my_project\smart-lms\backend

# Tạo môi trường ảo Python
python -m venv venv
.\venv\Scripts\activate

# Cài đặt thư viện
pip install -r requirements.txt

# Chạy server API
uvicorn app.main:app --reload --port 8000
```
👉 Xem tài liệu Swagger API tại: **`http://localhost:8000/api/v1/docs`**

---

### 4. Khởi chạy AI Engine (Port 8001)
Mở một cửa sổ PowerShell mới:
```powershell
cd D:\all_my_project\smart-lms\ai-service

# Tạo môi trường ảo Python
python -m venv venv
.\venv\Scripts\activate

# Cài đặt thư viện
pip install -r requirements.txt

# Chạy server AI Service
uvicorn main:app --reload --port 8001
```
👉 Xem tài liệu Swagger AI tại: **`http://localhost:8001/docs`**

---

## 🌐 DANH SÁCH ĐƯỜNG DẪN TRUY CẬP HỆ THỐNG

| Dịch vụ | Đường dẫn URL | Mô tả chức năng |
| :--- | :--- | :--- |
| **Giao diện Học tập (Frontend)** | `http://localhost:3000` | Trang chủ, danh mục khóa học, Focus Player, chat gia sư ảo, làm bài trắc nghiệm |
| **Màn hình Học tập & AI Chat** | `http://localhost:3000/courses/1/learn` | Trải nghiệm trực tiếp Focus Player + AI Tutor SSE Streaming |
| **Công cụ AI Sinh Đề Trắc Nghiệm** | `http://localhost:3000/quiz/generate` | Giảng viên tải lên slide/bài giảng để AI sinh đề trắc nghiệm chuẩn Pydantic Schema |
| **Bàn làm việc Giảng viên** | `http://localhost:3000/instructor-dashboard` | Quản lý khóa học và đề thi |
| **Tổng quan Học viên** | `http://localhost:3000/dashboard` | Lộ trình học, tiến độ và thông báo |
| **Quản trị viên (Admin)** | `http://localhost:3000/admin-dashboard` | Giám sát tài nguyên, token AI tiêu thụ |
| **API Backend Swagger** | `http://localhost:8000/api/v1/docs` | Đầy đủ API: Auth (JWT), Courses, Lessons, Quizzes, Progress |
| **API AI Engine Swagger** | `http://localhost:8001/docs` | API RAG Streaming, Quiz Generator, Essay Grader, Document Ingestion |

---

## 🗄️ CƠ SỞ DỮ LIỆU & MIGRATION (ALEMBIC)

Backend tự động tạo bảng khi khởi động (tiện cho môi trường dev), nhưng vẫn có sẵn migration chuẩn trong `backend/alembic/versions`.

```powershell
cd D:\all_my_project\smart-lms\backend

# Xem revision hiện tại của database
alembic current

# Database TRỐNG (chưa có bảng): tạo toàn bộ schema
alembic upgrade head

# Database ĐÃ có bảng từ trước: đánh dấu là đã áp dụng baseline, tránh lỗi "table already exists"
alembic stamp head

# Sinh migration mới khi thay đổi model
alembic revision --autogenerate -m "mô tả thay đổi"
alembic upgrade head
```

> ℹ️ Revision `0001_initial_schema` là baseline: 7 bảng `users`, `courses`, `lessons`, `quizzes`, `quiz_questions`, `quiz_submissions`, `progress`.
> Bảng `document_chunks` (vector store) do AI Service quản lý nên được loại khỏi migration của backend.

---

## 🛑 LỆNH TẮT HỆ THỐNG (KHI DÙNG DOCKER)
Khi không sử dụng nữa, bạn có thể tắt các container để giải phóng RAM:
```powershell
cd D:\all_my_project\smart-lms
docker compose down
```
*(Dữ liệu khóa học, người dùng và vector embedding vẫn được lưu an toàn trong Docker Volume).*
