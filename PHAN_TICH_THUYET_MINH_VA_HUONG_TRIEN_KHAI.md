# Phân tích Thuyết minh Đề tài & Hướng triển khai có người dùng thật

> Tài liệu này đối chiếu **thuyết minh ngày 13/10/2026** với **mã nguồn + dữ liệu đang chạy ngày 05/11/2026**.
> Mục tiêu không phải "khoe tính năng", mà là xác định: cái gì đã thật, cái gì mới là demo, và làm gì tiếp theo để có **một lớp học thật dùng hệ thống thật**.

---

## 1. Kết luận trong 60 giây

Hệ thống **đã có đủ khung kỹ thuật** của một LMS + gia sư AI: phân quyền 3 vai trò, quản lý khóa/bài, video, học liệu, quiz, tiến độ, RAG theo bài, streaming SSE, sinh đề, chấm tự luận, thống kê token.

Nhưng **chưa có người dùng thật**:

- 10 tài khoản, tất cả là seed.
- 5 lượt ghi danh của 2 học viên trên 5 khóa; **7 khóa published** sau khi hạ 32 khóa demo sang `draft`, nhưng vẫn chưa có lớp thật.
- 23 lượt gọi AI, 8 tin nhắn chat, 2 phản hồi AI, 6 sự kiện học tập (gồm 1 `login` test), 0 đánh giá khóa học (số liệu test, không phải người dùng thật).
- 122 bài nhưng chỉ **16 bài có video**, **3 học liệu tải lên ở 2 bài** (trong đó 2 tệp sai chủ đề đã bị cách ly), phần lớn transcript chỉ 200–300 ký tự (dữ liệu tổng hợp).

> **Cập nhật 05/11/2026 — đã triển khai phần P0 kỹ thuật:** quota AI theo người/ngày, feedback câu trả lời AI, `learning_events`, analytics giảng viên/admin, R2 signed URL, provenance 100% chunk, dọn 32 khóa demo sang `draft`, cách ly 2 học liệu sai chủ đề, nạp transcript cho bài 232, và bộ eval RAG v2. Các mục bên dưới được đánh dấu **Đã xử lý** hoặc **Còn lại** tương ứng.

Vì vậy vấn đề lớn nhất **không phải thiếu tính năng**, mà là:

> **Chưa có một khóa học thật – một giảng viên thật – một lớp thật – học liệu thật – và một bộ đo lường thật.**

Hướng đúng nhất: **thu hẹp còn 1 khóa pilot**, làm sạch dữ liệu giả, bổ sung học liệu thật, sửa 6 blocker vận hành, rồi chạy 4–6 tuần với 20–40 sinh viên và đo bằng số liệu.

---

## 2. Thuyết minh đang hứa gì?

| # | Tuyên bố cốt lõi | Cách thuyết minh mô tả |
|---|---|---|
| 1 | **AI Contextual Tutor** | Trả lời chỉ dựa trên tài liệu/slide của bài hiện tại, kèm trích dẫn số trang, từ chối khi tài liệu không đề cập để "triệt tiêu hallucination" |
| 2 | **Lesson-bounded RAG** | Ràng buộc ngữ cảnh theo từng bài học; đây là "tính mới" của đề tài |
| 3 | **AI Quiz Generator** | Bóc tách tài liệu, sinh câu hỏi 4 phương án + đáp án + lời giải, "rút ngắn 80% thời gian soạn đề" |
| 4 | **Đo lường khoa học** | Context Precision, Hit Rate, latency streaming |
| 5 | **3 phân hệ** | Học viên – Giảng viên – Quản trị viên, JWT/RBAC |
| 6 | **Thử nghiệm thực tế** | Giảng viên và sinh viên Đại học Đông Á tham gia thử nghiệm |

Ngoài ra thuyết minh nêu công nghệ: PostgreSQL + pgvector, HNSW, LangChain, Docker, Vercel/Render, Ant Design, `text-embedding-004`/`text-embedding-3-small`.

---

## 3. Hệ thống thực tế đang có gì?

### 3.1 Dữ liệu (kiểm tra trực tiếp trên Supabase, 05/11/2026)

| Hạng mục | Số liệu thật | Ý nghĩa |
|---|---|---|
| Tài khoản | 10 (2 admin, 5 giảng viên, 3 học viên) | Toàn bộ là seed |
| Khóa học | 42 (7 published, 35 draft) | 32 khóa demo đã hạ sang draft; 7 khóa published vẫn chưa có lớp thật |
| Bài học | 122 | 16 bài có video, 114 bài có `resources_url` |
| Transcript | 122 bài có transcript | 22 bài < 200 ký tự; phần lớn ~200–300 ký tự |
| Học liệu tải lên | 3 bản ghi / 2 bài | 1 video ready + 2 tài liệu bị cách ly (`failed`) vì sai chủ đề; tệp vẫn trên R2 |
| Ghi danh | 5 lượt / 2 học viên / 5 khóa | Không phải một lớp thật |
| Tiến độ | 7 bản ghi / 2 học viên; 3 bài hoàn thành | Hoạt động cuối 03/11/2026 |
| Vector | 595 chunk / 119 bài | Provenance 100%: document 318, youtube_subtitle 267, transcript 10; 267 chunk có mốc thời gian; 0 chunk còn `page` sau cách ly tài liệu sai |
| Quiz | 11 quiz / 31 câu hỏi | Chỉ 5 quiz gắn bài của khóa published |
| Lượt nộp quiz | 16 / 4 người / 3 quiz | Dữ liệu test |
| Chat AI | 8 tin nhắn / 2 người / 2 bài | Có 2 phản hồi hữu ích từ test |
| Lượt gọi AI | 23 (tutor 21, quiz 1, grader 1) | Phần lớn là test; có `is_estimated` khi thiếu usage thật |
| Sự kiện học tập | 6 | Từ test API + thao tác trình duyệt, gồm 1 `login` |
| Chấm tự luận | 1 | Dữ liệu test |
| Đánh giá khóa học | 0 | Chức năng đã có, chưa có người dùng thật |

### 3.2 Những gì đã thật sự chạy được

- Đăng ký/đăng nhập JWT, phân quyền student/instructor/admin; logout thu hồi token bằng `token_version`.
- Quản lý khóa học, bài học, học liệu; upload Cloudinary (thumbnail) và R2 (tài liệu/video).
- Nhập video YouTube, lấy phụ đề, đưa vào pgvector.
- Chat RAG streaming SSE, lưu lịch sử vào `chat_messages`, hiển thị nguồn + mốc thời gian ở UI.
- Sinh đề có preview, chuẩn hóa A–D, lưu ngân hàng đề, gắn `lesson_id`.
- Chấm tự luận theo rubric, lưu `essay_gradings`.
- Đánh giá khóa học 1–5 sao (mới bổ sung), chỉ học viên đã ghi danh.
- Thống kê token AI theo tính năng, có đánh dấu `is_estimated`.
- Quota AI theo người/ngày cho tutor, sinh đề, chấm bài; trả `429` + `Retry-After`.
- Feedback hữu ích/không hữu ích cho từng câu trả lời AI, lưu `ai_message_feedback`.
- Sự kiện học tập theo lô + analytics giảng viên/admin; UI `/instructor/analytics` đã chạy.
- Học liệu R2 trả signed URL 1 giờ, ẩn `storage_key`; tự chuyển học liệu kẹt sang `failed` khi khởi động.
- Provenance 100% chunk; cách ly 2 tài liệu sai chủ đề và gỡ 44 chunk khỏi AI; nạp 2 chunk transcript cho bài 232.
- 26 test backend pass; `tsc --noEmit` sạch; `next build` 27 route; 3 service trả 200.

### 3.3 Những điểm thuyết minh nói chưa đúng hoặc chưa có bằng chứng

| Tuyên bố | Thực tế | Bằng chứng |
|---|---|---|
| "Chỉ mục HNSW" | **Chưa có index HNSW trong DB.** `pg_indexes` chỉ có `document_chunks_pkey` + `ix_document_chunks_lesson_id`. Hàm `create_hnsw_index()` có nhưng không được gọi; 595 vector nên quét tuần tự vẫn chấp nhận được | Query `pg_indexes` ngày 05/11/2026 |
| "Trích dẫn số trang" | **0/595 chunk** còn `page` sau khi cách ly tài liệu PDF sai chủ đề; 267 chunk có mốc thời gian từ phụ đề. Chỉ trích dẫn trang khi giảng viên tải PDF đúng có metadata | Query `document_chunks` |
| "Triệt tiêu hallucination" | Có cơ chế từ chối + lọc bằng chứng; **đã đo trên bộ pilot**: Refusal Accuracy 100% (3/3 câu ngoài phạm vi), Citation Rate 100% | `BENCHMARK_RAG_V2.md` |
| "Giảm 80% thời gian soạn đề" | Chưa có phép đo trước/sau với giảng viên | Không có log/nhật ký đo |
| "Context Precision 25%" | Bản cũ dùng ground-truth 1 từ khóa, mỗi câu luôn lấy 4 chunk. Bộ v2 đo **Precision@4 = 55%**, kèm Citation/Refusal/Faithfulness proxy; vẫn cần chấm thủ công | `BENCHMARK_RAG_V2.md` |
| "LangChain/LlamaIndex" | **Không dùng** trong pipeline; gọi trực tiếp Google SDK | `grep` toàn `ai-service` |
| "Ant Design" | **Không dùng**; frontend dùng Radix/shadcn + Tailwind | `frontend/package.json` |
| "`text-embedding-004` / `text-embedding-3-small`" | Thực tế `models/gemini-embedding-001`, 768 chiều | `embedder.py`, `core/config.py` |
| "Docker/Vercel/Render" | Có `docker-compose.yml` nhưng môi trường đang chạy là 3 service local, không Docker; chưa deploy Vercel/Render | Lệnh chạy thực tế |
| "Học liệu R2 public URL" | Bản cũ đúng; **nay đã sửa**: API học liệu trả signed URL 1 giờ, ẩn `storage_key`, vẫn kiểm tra ghi danh | `documents.py`, `object_storage.py` |
| "Chưa có quota/analytics/feedback" | Bản cũ đúng; **nay đã sửa**: quota AI, `learning_events`, feedback AI, analytics giảng viên/admin | `ai_quota.py`, `events.py`, `analytics.py` |
| "Thử nghiệm với giảng viên/sinh viên Đông Á" | Chưa có người dùng thật; toàn bộ là seed/test | Số liệu mục 3.1 |

---

## 4. Ma trận đối chiếu: Thuyết minh ↔ Hệ thống ↔ Khoảng trống

| Năng lực | Trong thuyết minh | Trong hệ thống | Khoảng trống chặn người dùng thật | Ưu tiên |
|---|---|---|---|---|
| Học liệu thật | PDF/DOCX môn chuyên ngành | Parser/chunk/embed có; **3 học liệu tải lên ở 2 bài** | Chưa có bộ slide thật cho cả khóa; 2 tệp sai chủ đề đã bị cách ly | **Còn lại** |
| RAG theo bài | Lesson-bounded | Có, ngưỡng 0.5 + lọc từ khóa; mở rộng ±1 chunk | Chưa đo trên 50–100 câu; provenance đã 100% nhưng cần câu hỏi do GV gán nhãn | **Còn lại** |
| Trích dẫn | Số trang + timestamp | Có timestamp (267 chunk); page hiện 0 sau cách ly | Cần tải PDF đúng để parser gắn `page` | **Còn lại** |
| Sinh đề | 4 phương án + lời giải | Có preview + lưu DB | Chưa đo tỷ lệ GV chấp nhận; chưa đo thời gian tiết kiệm | P1 |
| Chấm tự luận | Không nêu | Có rubric + lịch sử | Chưa có quy trình GV duyệt lại | P1 |
| 3 phân hệ | Student/Instructor/Admin | Có đủ route | Onboarding lớp, import CSV đã có script; email mời chưa có | **Đã xử lý một phần** |
| Bảo mật học liệu | Không nêu | R2 **signed URL 1 giờ**, ẩn `storage_key` | Cần kiểm tra link hết hạn trên UI | **Đã xử lý** |
| Kiểm soát AI | Không nêu | Quota tutor 80, quiz 40, grader 60/ngày/người; trả 429 | Cần theo dõi chi phí thực tế khi có lớp | **Đã xử lý** |
| Đo lường | Hit Rate/Precision/latency | Có eval v2 + `learning_events` + feedback + analytics | Chưa có dữ liệu người dùng thật | **Đã xử lý hạ tầng** |
| Vận hành | Docker/Vercel/Render | Localhost, Redis timeout, có CI | Chưa có monitoring, backup, staging | **Còn lại** |

---

## 5. Vì sao hệ thống chưa có người dùng thật?

1. **Nội dung chưa thật.** Sau khi dọn, chỉ còn 7 khóa published nhưng phần lớn transcript vẫn ngắn, không video, không học liệu thật. Sinh viên vào sẽ thấy bài giảng rỗng; AI chỉ có vài câu để bám vào.
2. **Không có quy trình đưa lớp vào.** Đã có `import_class.py` (CSV, chạy thử mặc định và `--apply`, xuất credentials) nhưng chưa có email mời thật, mã lớp, hoặc hướng dẫn giảng viên.
3. **Không có lý do để quay lại.** Chưa có bài tập/bài kiểm tra theo tuần, chưa có thông báo, chưa có phản hồi của giảng viên.
4. **Chưa đo được giá trị với người thật.** Đã có hạ tầng analytics + feedback + eval v2, nhưng chưa có dữ liệu lớp thật.
5. **Rủi ro vận hành chưa được xử lý hết.** Signed URL/quota/CI đã có; Redis timeout, monitoring, backup, staging vẫn còn.

---

## 6. Hướng làm đúng nhất

### 6.1 Nguyên tắc

1. **Một khóa thật quan trọng hơn nhiều khóa demo.** Chất lượng học liệu quyết định chất lượng RAG.
2. **Không mở rộng ngang khi chưa có số liệu.** Mọi tính năng mới phải gắn với một chỉ số pilot.
3. **AI phải chứng minh được là hữu ích, không chỉ "chạy được".** Đo bằng helpfulness, citation accuracy, refusal accuracy.
4. **Mọi tuyên bố trong thuyết minh phải có bằng chứng hoặc được hạ xuống thành "mục tiêu/kế hoạch".**

### 6.2 Phạm vi pilot đề xuất

| Thành phần | Đề xuất |
|---|---|
| Khóa học | 1 khóa đang dạy trong học kỳ. Ưu tiên khóa **62 "Kỹ thuật cơ sở và vật liệu"** hoặc **81 "Power BI"** vì đã có 3 video + transcript thật (~15–20k ký tự/bài, 117–119 chunk) |
| Giảng viên | 1 giảng viên phụ trách khóa, cam kết cung cấp slide + duyệt đề + phản hồi 2 tuần/lần |
| Sinh viên | 1 lớp 20–40 sinh viên, có tài khoản thật, dùng trong 4–6 tuần |
| Học liệu | 8–12 bài; mỗi bài ≥ 1 slide PDF/DOCX thật + video/ghi âm; transcript do giảng viên xác nhận |
| Phạm vi tính năng | Học bài + hỏi AI tutor + làm quiz + xem tiến độ. **Không** làm thanh toán, mobile, gamification trong pilot |
| Thời lượng | 4 tuần chạy + 1 tuần chuẩn bị + 1 tuần tổng hợp |

**Việc đã làm với khóa demo:** 32 khóa không có học liệu thật đã chuyển sang `draft`, giữ 7 khóa published. Trong 7 khóa published, chỉ 2 khóa từng có học liệu tải lên (khóa 80: 1 video `ready` + 1 tài liệu sai chủ đề đã cách ly; khóa 81: 1 tài liệu sai chủ đề đã cách ly); các khóa còn lại dựa vào phụ đề YouTube/transcript nên cần giảng viên bổ sung trước khi mời sinh viên.

### 6.3 Sáu blocker P0 — trạng thái sau triển khai

1. **Chuẩn hóa provenance học liệu — Đã xử lý.**
   - Mỗi chunk có `source_type`, `filename`, `lesson_id`; chunk cũ được backfill.
   - `check_provenance.py` báo **100%** chunk có provenance tối thiểu (document 318, youtube_subtitle 267, transcript 10).
   - `page` hiện 0 vì tài liệu PDF duy nhất có số trang đã bị cách ly do sai chủ đề.

2. **Bảo vệ học liệu — Đã xử lý.**
   - API học liệu trả **signed URL hết hạn 1 giờ** (`R2_SIGNED_URL_EXPIRE_SECONDS=3600`), giữ URL công khai làm fallback.
   - Không trả `storage_key`; vẫn kiểm tra ghi danh/chủ khóa qua `require_course_access`.

3. **Kiểm soát AI — Đã xử lý.**
   - Quota/ngày/người: tutor 80, sinh đề 40, chấm bài 60; đặt 0 để tắt.
   - Trả `429` kèm `Retry-After`; đã kiểm thử trực tiếp.
   - Token/latency vẫn ghi vào `ai_usage_logs` kèm `is_estimated` khi thiếu usage thật.

4. **Onboarding lớp — Đã có một phần.**
   - `backend/scripts/import_class.py`: đọc CSV, chạy thử mặc định / `--apply`, tạo tài khoản + ghi danh, xuất credentials.
   - Còn lại: email mời thật, SMTP ngoài localhost, hướng dẫn 1 trang cho SV/GV.

5. **Đo lường — Đã xử lý hạ tầng.**
   - Bảng `learning_events` + API `POST /events` (lô tối đa 50, loại sự kiện đóng).
   - Feedback hữu ích/không hữu ích cho câu trả lời AI (`ai_message_feedback`).
   - Analytics giảng viên/admin + trang `/instructor/analytics`.
   - Còn lại: chạy với lớp thật để có số liệu.

6. **Vận hành & chất lượng — Đã có một phần.**
   - CI chạy compile backend/AI, `tsc --noEmit`, `next build`.
   - Tự chuyển học liệu kẹt `queued/processing` sang `failed` khi khởi động.
   - Còn lại: Sentry/uptime monitor, log tập trung, backup, staging; Redis timeout cần cấu hình fail-open rõ hơn.
   - HNSW: chưa tạo; 595 vector nên chưa cần, nhưng phải ghi đúng trạng thái.

---

## 7. Kế hoạch 4 tuần

| Tuần | Việc chính | Đầu ra kiểm chứng được |
|---|---|---|
| **Tuần 0** (3–5 ngày) | Chốt khóa/GV/lớp; baseline khảo sát sinh viên; unpublish khóa demo; sửa P0 bảo mật + quota AI | Danh sách lớp; khóa pilot đã sạch; checklist P0 pass |
| **Tuần 1** | Nạp 8–12 bài học liệu thật; kiểm tra provenance; GV duyệt nội dung; tạo 50–100 câu eval | 100% bài có học liệu + provenance; bộ eval có nhãn GV |
| **Tuần 2** | Import tài khoản, gửi email mời, tập huấn 1 buổi, bắt đầu học | ≥80% SV đăng nhập tuần 1; ≥1 câu hỏi AI/người |
| **Tuần 3** | Theo dõi hàng ngày; sửa lỗi; phỏng vấn 5 SV + 1 GV; bổ sung học liệu yếu | Danh sách lỗi ưu tiên; log feedback |
| **Tuần 4** | Đo cuối kỳ; tổng hợp số liệu; viết báo cáo; quyết định mở rộng | Báo cáo pilot có số liệu thật; quyết định go/no-go |

---

## 8. Bộ chỉ số phải đo (và đo ở đâu)

| Nhóm | Chỉ số | Công thức / cách thu | Mục tiêu pilot |
|---|---|---|---|
| Kích hoạt | Tỷ lệ đăng nhập tuần 1 | Số SV có `login` / tổng SV | ≥ 80% |
| Kích hoạt | Tỷ lệ dùng AI tutor | Số SV có ≥1 `ai_question` / tổng SV | ≥ 60% |
| Tương tác | Câu hỏi AI / SV / tuần | `ai_usage_logs` + `learning_events` | ≥ 3 |
| Tương tác | Tỷ lệ làm quiz | Số SV có ≥1 `quiz_submit` / tổng SV | ≥ 60% |
| Học tập | Tỷ lệ hoàn thành khóa | `progress` / tổng bài | ≥ 60% |
| Học tập | Điểm quiz trung bình | `quiz_submissions.score` | ≥ 7/10 |
| AI | Tỷ lệ câu trả lời hữu ích | thumbs up / (up+down) + phỏng vấn | ≥ 75% |
| AI | Citation accuracy | Mẫu 50 câu, 2 người chấm: nguồn có thật & hỗ trợ kết luận | ≥ 90% |
| AI | Refusal accuracy | 30 câu ngoài phạm vi: có từ chối đúng | ≥ 90% |
| AI | p95 first-token | Log latency streaming | < 3 giây |
| AI | p95 full answer | Log latency | < 15 giây |
| Giảng viên | Tỷ lệ câu hỏi AI được chấp nhận | Câu giữ nguyên/ít sửa / tổng câu sinh | ≥ 70% |
| Giảng viên | Thời gian soạn 1 đề 10 câu | Bấm giờ thủ công vs có AI | Giảm ≥ 50% |
| Chi phí | Token / SV / tuần | `ai_usage_logs` | Theo dõi, đặt ngưỡng |
| Hài lòng | CSAT | Khảo sát 1–5 cuối pilot | ≥ 4/5 |

> Lưu ý: **không đặt mục tiêu "giảm 80%"** nếu chưa đo. Mục tiêu hợp lý cho lần đầu là ≥ 50%, sau đó mới tối ưu.

---

## 9. Đánh giá AI đúng chuẩn khoa học (thay benchmark 8 câu)

Bộ v2 đã bổ sung đo Citation Rate, Refusal Accuracy và Faithfulness proxy trên 8 câu pilot (5 trong phạm vi, 3 ngoài phạm vi), nhưng vẫn chưa đủ để kết luận khoa học. Đề xuất bộ đánh giá mở rộng:

### 9.1 Bộ câu hỏi (50–100 câu, do giảng viên gán nhãn)

| Nhóm | Số câu | Mục đích |
|---|---|---|
| Trong bài, trả lời trực tiếp | 20–30 | Đo Hit Rate, Context Precision, answer correctness |
| Trong bài, cần tổng hợp 2–3 đoạn | 10–15 | Đo khả năng tổng hợp |
| Ngoài phạm vi bài | 15–20 | Đo refusal accuracy (không được bịa) |
| Câu hỏi mơ hồ/thiếu ngữ cảnh | 5–10 | Đo hành vi hỏi lại |
| Câu hỏi tiếp nối (follow-up) | 5–10 | Đo xử lý lịch sử hội thoại |

### 9.2 Chỉ số

- **Retrieval:** Hit Rate@K, Context Precision@K, Context Recall@K (có ground-truth đoạn liên quan).
- **Answer:** Faithfulness (câu trả lời có bám context không), Answer Correctness (so với đáp án GV), Citation Accuracy (trích dẫn đúng trang/timestamp).
- **Safety:** Refusal Accuracy (ngoài phạm vi), Hallucination Rate (khẳng định không có trong context).
- **Vận hành:** p50/p95 latency, error rate, token/câu.

### 9.3 Cách chấm

- 2 người chấm độc lập trên 30% mẫu; tính Cohen's kappa; tranh chấp do GV thứ 3 quyết.
- Lưu toàn bộ câu hỏi, câu trả lời, nguồn, nhãn vào `ai_eval_runs` để tái lập.
- Chạy lại sau mỗi thay đổi prompt/model/chunking.

---

## 10. Cần sửa gì trong thuyết minh?

| Chỗ đang viết | Nên sửa thành |
|---|---|
| "triệt tiêu hallucination" | "giảm thiểu hallucination bằng lesson-bounded RAG + cơ chế từ chối khi thiếu bằng chứng; đo bằng Refusal Accuracy và Hallucination Rate" |
| "kèm trích dẫn số trang" | "kèm trích dẫn trang với tài liệu có số trang, mốc thời gian với video; chỉ áp dụng khi metadata nguồn tồn tại" |
| "rút ngắn 80% thời gian" | "mục tiêu rút ngắn ≥50%; đo bằng thực nghiệm trước/sau với giảng viên" |
| "Context Precision 25%" | "Precision@4 = 55% trên bộ pilot v2; bổ sung Context Recall, Faithfulness, Citation Accuracy và chấm thủ công" |
| "HNSW" | "đã thiết kế hàm tạo HNSW; chỉ mục sẽ được tạo khi dữ liệu đủ lớn (hiện 595 vector)" — hoặc tạo index thật rồi mới ghi |
| "LangChain/LlamaIndex" | "gọi trực tiếp Google Generative AI SDK; không dùng LangChain trong pipeline hiện tại" |
| "Ant Design" | "Radix UI/shadcn + Tailwind CSS" |
| "text-embedding-004 / text-embedding-3-small" | "`models/gemini-embedding-001`, 768 chiều" |
| "Docker/Vercel/Render" | mô tả đúng môi trường đã chạy; nếu chưa deploy, ghi rõ "kế hoạch triển khai" |
| "thử nghiệm với giảng viên/sinh viên Đông Á" | chỉ ghi khi có dữ liệu; nếu chưa, ghi "kế hoạch pilot với 1 lớp" |

---

## 11. Nên làm ngay / Không nên làm

### Nên làm ngay (1–2 tuần)

1. Chốt khóa + GV + lớp pilot.
2. ~~Unpublish/đánh dấu khóa demo~~ — **đã làm**: 32 khóa chuyển `draft`, giữ 7 khóa published.
3. Nạp học liệu thật cho 8–12 bài — **đang làm**: provenance đã 100%, bài 232 đã nạp transcript; cần slide/video thật.
4. ~~Thêm quota AI + feedback thumbs + `learning_events`~~ — **đã làm**.
5. ~~Chuyển R2 sang signed URL~~ — **đã làm** (1 giờ).
6. Viết bộ eval 50 câu + script chấm — **đã có bộ 8 câu v2**, cần mở rộng lên 50–100 câu do GV gán nhãn.
7. CI + Sentry/uptime monitor — **CI đã có**, monitoring chưa.

### Không nên làm trong giai đoạn này

- Không mở thêm khóa/tính năng mới khi chưa có lớp thật.
- Không làm thanh toán, mobile app, gamification, B2B white-label.
- Không tuyên bố "đã thử nghiệm với sinh viên Đông Á" khi chưa có dữ liệu.
- Không tối ưu HNSW khi chỉ có 595 vector; ưu tiên chất lượng dữ liệu.
- Không dùng "số liệu đẹp" từ benchmark 8 câu để kết luận khoa học.

---

## 12. Quyết định đã chốt và thông tin còn cần

Đã chốt để triển khai:

1. **Khóa pilot mặc định:** khóa 62 (Cơ học kỹ thuật) hoặc 81 (Power BI) — cả hai có video + transcript thật.
2. **Phạm vi tính năng:** học bài + Gia sư AI + quiz + tiến độ/analytics; không thanh toán/mobile/gamification trong pilot.
3. **Mức độ can thiệp:** đã làm cả phân tích, sửa P0 kỹ thuật, script import lớp và bộ eval.

Thông tin còn cần từ giảng viên trước khi mở lớp:

1. **Lớp & giảng viên:** mã lớp, sĩ số, email giảng viên phụ trách.
2. **Học liệu:** slide PDF/DOCX và video/ghi âm thật cho 8–12 bài; đặc biệt tài liệu React.js đúng để thay tệp ASP.NET đã cách ly.
3. **Bộ câu hỏi eval:** 50–100 câu do giảng viên gán nhãn để thay bộ 8 câu pilot.

Sau khi có các thông tin này, chạy `import_class.py` để tạo lớp, nạp học liệu, rồi bắt đầu pilot 4–6 tuần.

---

## Phụ lục: bằng chứng kỹ thuật đã kiểm tra

- `backend/app/api/v1/auth.py`: đăng ký công khai luôn tạo `student`; quyền giảng viên do admin cấp.
- `backend/app/core/rate_limit.py`: rate limit login/register/refresh/forgot theo IP.
- `backend/app/api/v1/ai_tutor.py`: kiểm tra quyền theo khóa qua `require_course_access`; lưu chat vào PostgreSQL; gọi `enforce_ai_quota(db, user_id, "tutor")` trước khi stream.
- `backend/app/services/ai_quota.py`: quota theo ngày UTC, trả `429` + `Retry-After`.
- `backend/app/api/v1/events.py`: sự kiện học tập theo lô + feedback AI.
- `backend/app/api/v1/analytics.py`: analytics giảng viên/admin.
- `ai-service/pipelines/rag_pipeline.py`: lesson-bounded, lọc bằng chứng, mở rộng ±1 chunk; từ chối khi không có bằng chứng.
- `ai-service/vector_store/pgvector_store.py`: có hàm `create_hnsw_index()` nhưng không được gọi; DB chưa có index HNSW.
- `ai-service/evaluate_rag_v2.py`: 8 câu pilot, đo Hit Rate, Precision, Citation, Refusal, Faithfulness proxy.
- `ai-service/ingest_lesson_transcript.py`: nạp transcript còn thiếu vào pgvector, không xóa nguồn khác.
- `backend/app/services/object_storage.py`: `presign_download()` trả signed URL; API học liệu ẩn `storage_key`.
- `backend/app/main.py`: `Base.metadata.create_all()` khi khởi động + Alembic; docs public ở `/api/v1/docs`; phục hồi học liệu kẹt khi startup.
- `backend/tests`: 26 test pass sau khi sửa test migration hardcode `0012` thành kiểm tra head động.
- Dữ liệu: query trực tiếp Supabase ngày 05/11/2026 (xem mục 3.1).
