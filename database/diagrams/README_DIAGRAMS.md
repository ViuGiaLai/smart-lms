# 🎨 BỘ SƠ ĐỒ CHUẨN ĐỒ HỌA BÁO CÁO (ĐÃ STYLE GỌN GÀNG, SẠCH ĐẸP)

> **Nguyên nhân hình ảnh cũ bị xấu:** Tất cả chức năng bị nhét chung vào một sơ đồ hàng ngang quá rộng khiến draw.io tự động kéo giãn mũi tên chằng chịt, đè chữ và nền đen khó nhìn.
> **Giải pháp tối ưu cho Báo cáo:** Tách riêng sơ đồ theo từng Actor/Chức năng, chuyển giao diện sang nền trắng chuẩn academic, đường nối vuông góc (`ortho`) không bị đè chéo.

---

## 📁 Danh mục các File Sơ đồ Đã Tinh chỉnh:

| File Sơ đồ | Dành cho mục nào trong Báo cáo | Ưu điểm |
|---|---|---|
| [`usecase_student.puml`](file:///d:/all_my_project/smart-lms/database/diagrams/usecase_student.puml) | **Use Case Phân hệ Học viên** | Trình bày từ trên xuống, phân nhóm hộp chức năng rõ ràng, mũi tên vuông vức. |
| [`usecase_instructor.puml`](file:///d:/all_my_project/smart-lms/database/diagrams/usecase_instructor.puml) | **Use Case Phân hệ Giảng viên** | Bố cục từ trái sang phải, tách nhóm Khảo thí/Học liệu/AI rõ nét. |
| [`usecase_admin.puml`](file:///d:/all_my_project/smart-lms/database/diagrams/usecase_admin.puml) | **Use Case Phân hệ Quản trị** | Trình bày chuẩn nghiệp vụ quản trị người dùng, token và danh mục. |
| [`usecase_overview.puml`](file:///d:/all_my_project/smart-lms/database/diagrams/usecase_overview.puml) | **Sơ đồ Use Case Tổng quan rút gọn** | Gom gọn chức năng chính của cả 3 Actor, chụp 1 ảnh là vừa vặn trang A4. |
| [`sequence_ai_tutor_styled.puml`](file:///d:/all_my_project/smart-lms/database/diagrams/sequence_ai_tutor_styled.puml) | **Sequence Diagram AI Tutor** | Đánh số bước `[01], [02]...`, có màu sắc phân biệt giữa Frontend, Backend, AI và DB. |

---

## 📸 Hướng dẫn dán vào Draw.io để lấy ảnh đẹp nhất:

1. Mở **[draw.io](https://app.diagrams.net/)**.
2. **Khuyên dùng:** Đổi giao diện draw.io sang nền sáng (nếu đang ở Dark mode: bấm biểu tượng mặt trời/mặt trăng góc trên phải).
3. Vào menu: **Arrange** $\rightarrow$ **Insert** $\rightarrow$ **Advanced** $\rightarrow$ **PlantUML**.
4. Sao chép toàn bộ code trong file mong muốn (ví dụ `usecase_student.puml`) và dán vào.
5. Bấm **Insert**.
6. Chọn **File** $\rightarrow$ **Export as** $\rightarrow$ **PNG** (tích chọn *Transparent background* nếu muốn chèn Word/Docs đẹp, hoặc để nền trắng).
7. Lặp lại tương tự cho Giảng viên và Admin. Báo cáo của bạn sẽ có từng mục rõ ràng, chuyên nghiệp và điểm cộng thẩm mỹ rất cao!
