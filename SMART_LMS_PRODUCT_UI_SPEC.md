# Đặc tả sản phẩm và giao diện Smart LMS tích hợp Trợ lý AI

## 1. Mục tiêu và phạm vi

Smart LMS là hệ thống quản lý học tập trực tuyến cho ba vai trò: **Học viên**, **Giảng viên** và **Quản trị viên**. Sản phẩm phải giúp giảng viên tạo học liệu, giúp học viên học tập có định hướng, và giúp quản trị viên kiểm soát chất lượng nội dung cùng việc sử dụng AI.

Trợ lý AI không phải một chatbot độc lập. Mỗi câu trả lời phải gắn với khóa học và bài học hiện tại, ưu tiên nguồn đã được giảng viên cung cấp; khi không có đủ nguồn, AI phải nói rõ giới hạn thay vì suy đoán.

Phạm vi phiên bản đầu tiên bao gồm:

- Quản lý tài khoản, vai trò và trạng thái truy cập.
- Tạo, duyệt, xuất bản và lưu trữ khóa học.
- Bài học với video, transcript và nhiều tài liệu PDF, DOCX, PPTX.
- Học tập, lưu tiến độ, quiz, kết quả và chứng chỉ cơ bản.
- AI Tutor, RAG theo bài học, sinh đề AI và chấm tự luận có rubric.
- Lưu tệp riêng tư, theo dõi quá trình xử lý học liệu và phân tích học tập cơ bản.

Không đưa vào phạm vi đầu tiên: lớp học trực tuyến trực tiếp, diễn đàn cộng đồng lớn, thanh toán hoàn chỉnh, marketplace nhiều đơn vị, hoặc mạng xã hội học tập.

## 2. Đánh giá hiện trạng

### 2.1 Phần đã có và đúng hướng

| Nhóm | Hiện trạng trong dự án | Đánh giá |
|---|---|---|
| Phân quyền | Có `student`, `instructor`, `admin`, JWT và kiểm tra quyền tại API | Đúng hướng, cần ma trận quyền đầy đủ |
| Khóa học | Có bản nháp, xuất bản, lưu trữ; khóa học, bài học, ghi danh, tiến độ | Có lõi nghiệp vụ |
| Học liệu | Có video YouTube/tệp video, tài liệu nhiều tệp và R2 | Cần queue bền vững |
| AI Tutor | Có RAG theo bài, nguồn trích dẫn, streaming và lịch sử chat | Là điểm mạnh của sản phẩm |
| Kiểm tra | Có quiz thủ công/AI, nộp bài và kết quả | Cần mở rộng attempt, ngân hàng đề |
| Quản trị | Có dashboard, duyệt khóa, người dùng, danh mục, giám sát AI | Cần tách rõ các không gian thao tác |
| Phân tích | Có events, usage log và analytics ban đầu | Chưa đủ để ra quyết định đào tạo |

### 2.2 Khoảng trống cần xử lý trước khi vận hành thật

1. Tải tệp nền hiện dùng tác vụ nền trong tiến trình backend. Đây chưa phải hàng đợi bền vững: khi tiến trình dừng, tác vụ có thể gián đoạn.
2. Video/tài liệu đang đi qua backend và có thể được giữ trong bộ nhớ. Tệp lớn hoặc nhiều người tải cùng lúc sẽ làm hệ thống chậm.
3. Dữ liệu danh mục/cấp độ còn tồn tại cả dạng chuỗi lẫn quan hệ ID. Đây là nguyên nhân của lỗi hiển thị nhãn/mã như `[object Object]` hoặc `intermediate`.
4. R2 cần mặc định riêng tư; không dùng URL công khai lâu dài cho học liệu có kiểm soát truy cập.
5. Đã có một số kiểm thử backend, nhưng độ bao phủ và tự động hóa chưa đủ cho toàn bộ luồng phân quyền, upload, học tập và AI.
6. Chưa có tiêu chuẩn xuất bản bắt buộc: khóa học có thể thiếu học liệu hoặc RAG chưa hoàn tất.

## 3. Vai trò và ma trận quyền

| Chức năng | Học viên | Giảng viên | Quản trị viên |
|---|---:|---:|---:|
| Xem khóa đã xuất bản | Có | Có | Có |
| Ghi danh/học | Có | Có thể xem trước | Có thể xem trước |
| Hỏi AI Tutor | Có trong khóa đã ghi danh | Có khi xem trước | Có khi kiểm tra |
| Tạo/sửa khóa học của mình | Không | Có | Có |
| Tải/xóa học liệu khóa của mình | Không | Có | Có |
| Xuất bản khóa học | Gửi yêu cầu | Theo chính sách | Có quyền cuối |
| Quản lý danh mục/cấp học | Không | Chỉ chọn | Có |
| Xem analytics khóa học | Không | Chỉ khóa của mình | Toàn hệ thống |
| Đổi vai trò/khoá tài khoản | Không | Không | Có |

Quy tắc bắt buộc:

- Học viên chỉ nhận URL tệp khi đã ghi danh hoặc khóa học cho phép công khai.
- Giảng viên chỉ sửa/xóa khóa học do mình phụ trách.
- Admin có toàn quyền nhưng mọi thao tác nhạy cảm phải ghi audit log.
- Frontend chỉ dùng để ẩn/hiện nút; backend phải luôn là nơi quyết định quyền.

## 4. Vòng đời khóa học và bài học

### 4.1 Trạng thái khóa học

`draft` → `in_review` → `published` → `archived`

- **Bản nháp**: giảng viên sửa tự do, học viên không thấy.
- **Chờ duyệt**: khóa nội dung chính; giảng viên chỉ được rút về bản nháp hoặc sửa theo góp ý.
- **Đã xuất bản**: học viên có thể xem và ghi danh theo chính sách.
- **Lưu trữ**: không nhận học viên mới; người đã ghi danh vẫn có thể truy cập theo chính sách.

### 4.2 Điều kiện chuyển trạng thái

Một khóa chỉ được gửi duyệt khi có:

1. Tên, mô tả, lĩnh vực và cấp độ hợp lệ.
2. Giảng viên phụ trách.
3. Ít nhất một bài học ở trạng thái sẵn sàng.
4. Mỗi bài học có nội dung đọc, video hoặc ít nhất một tài liệu.
5. Không có tệp lỗi hoặc đang chờ xử lý bắt buộc.
6. Ảnh bìa, mục tiêu học tập và yêu cầu đầu vào nếu khóa được công khai.

Admin xuất bản sau khi kiểm tra checklist. Nếu trả về bản nháp, phải bắt buộc nhập lý do; giảng viên thấy lý do tại trang quản lý khóa học.

### 4.3 Trạng thái học liệu

`queued` → `uploading` → `processing` → `ready` hoặc `failed`

- `queued`: đã tạo job, chưa có worker nhận.
- `uploading`: đang tải trực tiếp lên R2.
- `processing`: worker đang trích xuất text, transcript hoặc tạo embeddings.
- `ready`: học viên có thể dùng.
- `failed`: có mã lỗi, thông báo dễ hiểu và nút thử lại.

Không được hiển thị `ready` khi video mới chỉ tải lên nhưng transcript/RAG bắt buộc chưa xong.

## 5. Mô hình dữ liệu đích

### 5.1 Danh mục và cấp độ

`learning_categories` và `education_levels` là nguồn dữ liệu chuẩn. Khóa học chỉ lưu `category_id` và `education_level_id`.

API trả về thống nhất:

```json
{
  "category": { "id": 12, "name": "Công nghệ thông tin", "slug": "cong-nghe-thong-tin" },
  "educationLevel": { "id": 3, "code": "intermediate", "name": "Trung cấp" }
}
```

UI chỉ hiển thị `name`; UI gửi `id`; mã `code` chỉ phục vụ lọc và tích hợp nội bộ. Sau khi chuyển dữ liệu cũ, bỏ hai trường chuỗi `category` và `level` để tránh dữ liệu mâu thuẫn.

### 5.2 Thực thể cần có

| Thực thể | Mục đích | Trường quan trọng |
|---|---|---|
| Course | Khóa học | status, instructor_id, category_id, education_level_id, outcomes |
| Lesson | Đơn vị học | course_id, title, order_index, source_type, version |
| LessonMaterial | Tệp/tài nguyên | lesson_id, type, storage_key, status, checksum |
| MediaJob | Hàng đợi xử lý | material_id, type, status, progress, retries, error |
| Enrollment | Quan hệ học | user_id, course_id, status, enrolled_at |
| Progress | Tiến độ từng bài | user_id, lesson_id, last_position, completed_at |
| QuizAttempt | Một lần làm bài | quiz_id, user_id, started_at, submitted_at, score |
| ChatMessage | Lịch sử AI | user_id, course_id, lesson_id, mode, sources |
| AuditLog | Theo dõi quản trị | actor_id, action, target_type, target_id, metadata |

### 5.3 Version học liệu

Khi giảng viên đổi video, slide hoặc transcript:

1. Tạo phiên bản mới của `LessonMaterial`.
2. Vô hiệu hóa vector của phiên bản cũ.
3. Chạy lại RAG cho phiên bản mới.
4. Lưu người học đã học phiên bản nào.
5. Báo cho học viên nếu nội dung đã thay đổi đáng kể.

## 6. Kiến trúc xử lý học liệu

### 6.1 Luồng upload chuẩn

1. Giảng viên chọn tệp.
2. Frontend gọi backend xin phiên upload tạm thời.
3. Backend kiểm tra quyền, dung lượng, loại tệp và tạo `LessonMaterial` + `MediaJob`.
4. Frontend tải thẳng multipart lên R2 bằng signed URL.
5. Frontend xác nhận hoàn tất upload với backend.
6. Worker nhận job và xử lý theo loại tệp.
7. Worker cập nhật phần trăm, trạng thái, lỗi hoặc kết quả.
8. Frontend cập nhật qua polling ngắn hạn hoặc SSE/WebSocket.

### 6.2 Worker theo loại tệp

| Loại | Công việc |
|---|---|
| PDF | Kiểm tra tệp, tách trang/text, OCR khi cần, chia chunk, embedding, lưu metadata trang |
| DOCX/PPTX | Tách heading/slide/text, giữ số trang hoặc số slide, chia chunk, embedding |
| Video tải lên | Kiểm tra codec, tạo thumbnail, đọc metadata, tạo transcript nếu có quyền, tạo index transcript |
| YouTube | Chỉ lưu liên kết/metadata; chỉ lấy subtitle khi video cho phép và chính sách bản quyền phù hợp |

### 6.3 Yêu cầu kỹ thuật

- R2 bucket để private, database chỉ lưu `storage_key`.
- API phát signed URL ngắn hạn sau khi kiểm tra quyền.
- Dùng Celery/RQ/Arq với Redis hoặc hệ thống queue managed; không dùng `BackgroundTasks` cho xử lý dài.
- Job idempotent: chạy lại không tạo vector hoặc tệp trùng.
- Retry theo cấp: lỗi mạng retry tối đa 3 lần; lỗi tệp báo failed ngay.
- Có nút `Thử lại`, `Hủy job`, `Xem lỗi kỹ thuật` cho giảng viên/admin.

## 7. Đặc tả AI Tutor

### 7.1 Mục tiêu

AI giúp học viên hiểu bài, luyện tư duy và tìm đúng đoạn tài liệu. AI không thay giảng viên, không tự bịa đáp án, không trả lời ngoài phạm vi khi thiếu nguồn.

### 7.2 Ba chế độ

| Chế độ | Hành vi | Khi dùng |
|---|---|---|
| Gợi mở Socratic | Hỏi lại, chia nhỏ vấn đề, tránh lộ đáp án | Học viên đang làm bài/luyện tập |
| Giải thích trực tiếp | Giải thích khái niệm theo nguồn | Học viên chưa hiểu lý thuyết |
| Luyện tập | Sinh câu hỏi ngắn, nhận xét câu trả lời | Ôn tập sau bài học |

### 7.3 Quy tắc câu trả lời

1. Tìm kiếm theo `lesson_id` trước; chỉ mở rộng phạm vi khóa học khi người dùng chủ động chọn.
2. Gắn tối đa 3 nguồn phù hợp: trang/slides hoặc khoảng thời gian video.
3. Nếu độ tin cậy thấp, trả lời: “Học liệu hiện chưa có đủ thông tin để trả lời chắc chắn”.
4. Không tạo đáp án đầy đủ trong chế độ gợi mở khi đây là câu hỏi đánh giá.
5. Lưu lịch sử trên server theo học viên + bài học; local storage chỉ là cache.
6. Sau mỗi câu trả lời, hiện 2–3 gợi ý tiếp theo dựa vào chính câu trả lời và bài đang học.

### 7.4 Theo dõi chất lượng AI

- Lưu feedback hữu ích/không hữu ích và lý do.
- Theo dõi câu không có nguồn, lỗi provider, độ trễ, token và chi phí.
- Tạo bộ câu hỏi kiểm chuẩn cho từng môn trước khi xuất bản AI Tutor.
- Giảng viên xem các câu hỏi lặp lại nhiều để cải thiện bài giảng.

## 8. Đặc tả UI và trải nghiệm

### 8.1 Nguyên tắc toàn hệ thống

- Một vai trò chỉ thấy menu phù hợp với vai trò đó.
- Không có menu ngang thứ hai nếu sidebar đã là điều hướng chính.
- Một màn hình chỉ có một hành động chính nổi bật.
- Hành động phụ gom vào menu `Học liệu`, `Thêm`, hoặc dấu ba chấm.
- Dùng nhãn tiếng Việt cho người dùng: “Trung cấp”, không hiện mã `intermediate`.
- Luôn có đủ 5 trạng thái: tải, rỗng, thành công, lỗi, không có quyền.
- Mọi nút icon phải có tooltip và nhãn hỗ trợ đọc màn hình.

### 8.2 Hệ màu và chữ

| Thành phần | Quy tắc |
|---|---|
| Màu chính | Một màu thương hiệu duy nhất dùng cho hành động chính |
| Thành công | Xanh lá chỉ cho hoàn tất/sẵn sàng |
| Cảnh báo | Vàng/cam cho đang chờ hoặc cần chú ý |
| Lỗi | Đỏ cho lỗi, xóa, bị từ chối |
| Nền | Không dùng quá ba lớp nền trên cùng một khung |
| Chữ | Một font sans-serif cho UI; serif chỉ dùng nếu có lý do nội dung học thuật rõ ràng |
| Cỡ chữ | Nội dung tối thiểu 14px desktop và 15–16px mobile |

### 8.3 Sidebar theo vai trò

**Học viên**

- Trang chủ
- Khóa học của tôi
- Khám phá khóa học
- Tiến độ
- Kết quả và chứng chỉ

**Giảng viên**

- Bảng điều khiển
- Khóa học của tôi
- Tạo khóa học
- Học liệu
- Ngân hàng đề
- Học viên và kết quả
- Phân tích

**Quản trị viên**

- Tổng quan
- Người dùng
- Kiểm duyệt khóa học
- Danh mục và cấp học
- Giám sát AI và dữ liệu
- Khám phá học liệu AI

Trên mobile, sidebar trở thành drawer. Khi đang ở trang học, không hiển thị sidebar quản trị; chỉ hiện nút quay lại khóa học, danh sách bài học và nút mở AI Tutor.

### 8.4 Màn hình học viên

#### Trang khám phá khóa học

- Thanh tìm kiếm, lọc lĩnh vực, cấp độ, thời lượng, trạng thái miễn phí/trả phí.
- Card khóa học: ảnh, tên, giảng viên, cấp độ, số bài, tiến độ nếu đã ghi danh.
- CTA thay đổi theo trạng thái: `Ghi danh`, `Học tiếp`, `Xem chi tiết`.

#### Trang chi tiết khóa học

- Hero gọn: ảnh, tên, mô tả, giảng viên, mục tiêu học tập, nút ghi danh.
- Danh sách bài theo accordion; học viên chưa ghi danh chỉ xem preview được quy định.
- Khu vực đánh giá và phản hồi sau khi hoàn thành.

#### Không gian học bài học

Desktop:

```text
Thanh điều khiển bài học
├─ Danh sách bài học có thể thu gọn
├─ Nội dung chính: video / tài liệu / transcript / quiz
└─ AI Tutor dạng panel phải, có nút thu gọn
```

Mobile:

```text
Thanh trên: Quay lại | Tiến độ | Mở AI
Nội dung chính cuộn một cột
Nút Danh sách bài học mở drawer
AI Tutor mở bottom sheet toàn màn hình
```

Trong AI Tutor, tin nhắn học viên căn phải và tin nhắn AI căn trái nhưng không tạo khoảng trống quá lớn. Khung chat có chiều rộng đọc thoải mái, nguồn thu gọn, gợi ý đặt gần ô nhập. Khi đóng panel, lịch sử đang học giữ nguyên và khi mở lại tiếp tục đúng bài học.

### 8.5 Màn hình giảng viên

#### Danh sách khóa học

- Bộ lọc: trạng thái, lĩnh vực, thời gian cập nhật.
- Mỗi card/hàng: trạng thái, số bài sẵn sàng, học viên, tiến độ xử lý học liệu.
- Nút chính: `Quản lý khóa học`.
- Menu phụ: xem trước, sao chép, gửi duyệt, lưu trữ.

#### Trình tạo khóa học

Chia thành bốn bước rõ ràng:

1. Thông tin khóa học.
2. Bài học và học liệu.
3. Quiz/đánh giá.
4. Kiểm tra và gửi duyệt.

Không tạo khóa học hoàn chỉnh sau bước 1 rồi báo lỗi mơ hồ ở bước 3. Lưu bản nháp từ đầu; mỗi bước có trạng thái lưu thành công và có thể quay lại.

#### Trang quản lý khóa học

Header có: trạng thái, `Xem trước`, `Gửi duyệt/Xuất bản`, menu khác.

Mỗi bài học hiển thị:

- Thứ tự, tiêu đề, thời lượng, tình trạng video/tài liệu/RAG.
- Nhóm nút gọn: `Sửa`, `Học liệu ▾`, `Xem`, `Xóa`.
- Menu `Học liệu` gồm tải tài liệu, tải video, lấy transcript, xem hàng đợi.
- Danh sách tệp hiển thị tên, dung lượng, trạng thái, lỗi, nút thử lại và xóa.

Modal sửa thông tin khóa học dùng select có nhãn cho lĩnh vực/cấp độ; không dùng object hoặc mã kỹ thuật làm value hiển thị.

### 8.6 Màn hình admin

- URL dùng query nhất quán: `/admin-dashboard?tab=users`, `courses`, `ai`, `categories`.
- `#ai` cũ phải chuyển về query một lần để tương thích, sau đó chỉ dùng query.
- Mỗi tab là một mục đích riêng, không trộn bảng người dùng với kiểm duyệt khóa học.
- Trang AI hiển thị service status, hàng đợi, lỗi theo job, token, chi phí, tốc độ và chất lượng RAG.

## 9. Trạng thái giao diện bắt buộc

| Tình huống | Giao diện cần có |
|---|---|
| Đang tải trang | Skeleton đúng cấu trúc, không quay vòng vô hạn |
| Danh sách rỗng | Lý do ngắn + nút hành động phù hợp |
| Upload | Tên tệp, phần trăm, nút hủy nếu chưa gửi xong |
| Xử lý nền | Trạng thái job, thời gian bắt đầu, nút làm mới/thử lại |
| Lỗi | Thông báo dễ hiểu, chi tiết kỹ thuật chỉ mở khi cần |
| Không có quyền | Màn hình 403 rõ ràng, không để dữ liệu nhấp nháy trước khi chuyển trang |
| Xóa | Hộp xác nhận nêu rõ thứ bị xóa và hậu quả |

## 10. API và bảo mật

### 10.1 Quy tắc API

- API dùng response nhất quán: `data`, `message`, `error`, `requestId`.
- Không trộn `camelCase` và `snake_case` trong cùng một endpoint.
- Endpoint tạo job trả `jobId`, `materialId`, `status`; frontend không tự đoán trạng thái.
- Có endpoint đọc job theo quyền và endpoint thử lại job lỗi.
- Các thao tác xóa trả trạng thái rõ ràng và id đã xóa.

### 10.2 Bảo mật bắt buộc

1. R2 private và signed URL ngắn hạn.
2. Không để khóa API, R2 secret hoặc token trong frontend/Git.
3. Xoay vòng các khóa từng được chia sẻ ngoài môi trường bảo mật.
4. JWT có refresh/revoke; cân nhắc cookie HttpOnly cho web production.
5. Rate limit tập trung qua Redis, không chỉ in-process.
6. Kiểm tra MIME thực tế, kích thước, checksum và quét tệp trước xử lý.
7. Audit log cho đổi quyền, xuất bản, xóa và cấp URL nhạy cảm.
8. Sao lưu PostgreSQL và kiểm tra khôi phục định kỳ.

## 11. Kiểm thử và tiêu chí nghiệm thu

### 11.1 Bộ kiểm thử cần xây dựng

- Unit test: chuẩn hóa danh mục/cấp độ, phân quyền, tính tiến độ, xác thực file.
- API integration test: tạo khóa, tạo bài, upload, job, RAG, quiz, nộp bài.
- E2E test: ba vai trò, desktop và mobile.
- Security test: học viên không lấy URL học liệu của khóa không được phép; giảng viên không sửa khóa người khác.
- Load test: nhiều upload đồng thời, AI chậm, Redis/worker restart.
- RAG evaluation: bộ câu hỏi chuẩn theo môn, kiểm tra citation, từ chối khi thiếu nguồn và độ trung thực.

### 11.2 Điều kiện phát hành

- Không còn lỗi P0/P1 mở.
- Tất cả migration chạy được từ database trống và database cũ.
- Luồng upload tệp lớn không giữ toàn bộ tệp trong RAM backend.
- Worker restart không làm job biến mất; job lỗi có thể retry.
- Học viên không đọc được tệp private nếu không có quyền.
- UI đạt mobile width 320px, tablet và desktop mà không tràn ngang.
- Có backup/restore đã kiểm chứng.

## 12. Lộ trình triển khai

### Giai đoạn 1 — Ổn định lõi dữ liệu và quyền

1. Chuẩn hóa category/education level về ID quan hệ.
2. Viết migration dữ liệu cũ và API response chuẩn.
3. Hoàn thiện ma trận quyền và audit log.
4. Thêm checklist xuất bản khóa học.

**Hoàn thành khi:** không còn mã kỹ thuật trên UI, không còn `[object Object]`, và không thể xuất bản khóa thiếu nội dung bắt buộc.

### Giai đoạn 2 — Học liệu và R2

1. Tạo `MediaJob` và worker queue bền vững.
2. Chuyển upload sang signed multipart URL.
3. Chuyển R2 sang private; chỉ cấp signed URL sau kiểm tra quyền.
4. Bổ sung retry, hủy job, progress và màn hình lỗi.

**Hoàn thành khi:** upload tệp lớn không làm backend chậm, restart worker không làm mất job, và giảng viên biết chính xác tệp đang ở bước nào.

### Giai đoạn 3 — Trải nghiệm học và AI Tutor

1. Hoàn thiện Focus Player responsive.
2. Gợi ý 2–3 câu hỏi AI theo ngữ cảnh sau mỗi câu trả lời.
3. Hoàn thiện nguồn bấm được, lịch sử và feedback.
4. Tạo analytics câu hỏi AI cho giảng viên.

**Hoàn thành khi:** học viên mở/đóng AI không mất hội thoại và mọi trả lời có căn cứ đều truy cập được nguồn.

### Giai đoạn 4 — Đánh giá và phân tích

1. Thêm quiz attempt, cấu hình số lần làm và trộn đề.
2. Hoàn thiện ngân hàng câu hỏi theo chủ đề/Bloom/độ khó.
3. Dashboard giảng viên: tiến độ, điểm yếu, tỷ lệ hoàn thành.
4. Dashboard admin: job lỗi, AI cost, chất lượng RAG, audit.

**Hoàn thành khi:** giảng viên xác định được bài/câu hỏi gây khó và có căn cứ để cải thiện nội dung.

### Giai đoạn 5 — Chất lượng và triển khai thật

1. Viết test tự động và CI.
2. Thêm monitoring, error tracking, backup/restore.
3. Tách dev/staging/production, quản lý secret.
4. Chạy pilot nhỏ với người dùng thật và thu feedback.

**Hoàn thành khi:** hệ thống có quy trình kiểm thử, khôi phục và theo dõi lỗi trước mỗi lần phát hành.

## 13. Thứ tự ưu tiên quyết định

Không ưu tiên thêm màn hình mới trước. Thứ tự đúng là:

1. Dữ liệu chuẩn và phân quyền.
2. Upload/R2/queue bền vững.
3. Xuất bản khóa học có kiểm tra.
4. Focus Player và AI Tutor đúng vai trò.
5. Quiz/analytics.
6. Test, giám sát và triển khai production.

Theo thứ tự này, Smart LMS sẽ chuyển từ một hệ thống demo nhiều tính năng thành một nền tảng học tập có thể vận hành, mở rộng và bảo vệ học liệu đúng mục tiêu.
