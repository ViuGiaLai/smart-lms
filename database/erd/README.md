# 📊 Smart LMS – ERD Export (Tách module cho báo cáo)

## 📁 Cách dùng

Mỗi file `.dbml` = **1 diagram riêng** → paste lên [dbdiagram.io](https://dbdiagram.io/d) → chụp ảnh → dán vào báo cáo.

---

## 📂 Danh sách file theo module

| File | Dùng cho phần báo cáo | Bảng bao gồm |
|------|----------------------|--------------|
| `01_user_auth.dbml` | Quản lý Người dùng & Xác thực | `users`, `password_reset_tokens` |
| `02_course_structure.dbml` | Cấu trúc Khóa học | `learning_categories`, `education_levels`, `courses`, `lessons`, `lesson_materials` |
| `03_learning_activity.dbml` | Hoạt động Học tập | `enrollments`, `progress`, `course_reviews` |
| `04_quiz_assessment.dbml` | Kiểm tra & Đánh giá | `quizzes`, `quiz_questions`, `quiz_submissions` |
| `05_ai_features.dbml` | Tính năng AI | `chat_messages`, `ai_message_feedback`, `ai_usage_logs`, `essay_gradings`, `student_topic_mastery` |
| `06_analytics_discovery.dbml` | Phân tích & Khám phá | `learning_events`, `discovery_jobs`, `discovery_items` |
| `schema.dbml` | Toàn bộ (nếu cần) | 21 tables |
| `schema.sql` | Đối chiếu DDL | ⚠️ Không thực thi |

---

## 🚀 Hướng dẫn import từng file

1. Mở file `.dbml` → **Ctrl+A** → **Ctrl+C**
2. Vào **https://dbdiagram.io/d** → xóa nội dung cũ → **Ctrl+V**
3. Diagram tự render → chụp ảnh hoặc **Export → PNG/PDF**

> **Lưu ý:** Các module 03–06 có lặp lại bảng `users`, `courses`, `lessons` ở dạng **rút gọn** (chỉ hiện PK + vài field đại diện) để diagram hiển thị đường quan hệ đúng mà không bị lộn xộn.
