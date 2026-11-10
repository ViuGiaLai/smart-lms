# Đánh giá RAG v2 — Smart LMS

- **Ngày chạy**: 2026-11-05
- **Bộ dữ liệu**: `eval_dataset_pilot.csv` (8 câu: 5 trong phạm vi, 3 ngoài phạm vi)
- **Bài học**: 185, 186, 187 (khóa 62 — Cơ học kỹ thuật), 233, 234, 235 (khóa 81 — Power BI)
- **Cấu hình**: top-k = 4, lesson-bounded, mở rộng ngữ cảnh ±1 chunk cùng tài liệu
- **Cách chạy**:

```bash
python evaluate_rag_v2.py --dataset eval_dataset_pilot.csv --top-k 4 --out BENCHMARK_RAG_V2.md
```

> Đây là số liệu trên bộ câu hỏi pilot, **không phải** kết quả trên toàn bộ khóa học.
> Cần thay bằng câu hỏi thật của lớp và chấm thủ công trước khi công bố khoa học.

### Đánh giá RAG v2

- **Số câu**: 8 (trong phạm vi: 5, ngoài phạm vi: 3)
- **Hit Rate @ 4**: 100.00%
- **Context Precision @ 4**: 55.00%
- **Keyword Recall**: 90.00%
- **Citation Rate**: 100.00%
- **Answer Keyword Coverage**: 70.00%
- **Refusal Accuracy**: 100.00%
- **Faithfulness proxy**: 53.06%
- **Latency truy xuất TB**: 982.47 ms
- **Latency sinh câu trả lời TB**: 4642.19 ms
- **Lỗi**: 0

| # | Bài | Phạm vi | Câu hỏi | Hit | Precision | Citation | Refusal | Faithfulness |
|---|-----|---------|---------|-----|-----------|----------|---------|--------------|
| 1 | 185 | in_scope | Môn cơ học kỹ thuật 1 gồm những chủ đề chính nào? | HIT | 0.75 | OK |  | 0.54 |
| 2 | 186 | in_scope | Giới hạn bền kéo của vật liệu được định nghĩa như thế nào? | HIT | 0.25 | OK |  | 0.61 |
| 3 | 187 | in_scope | Bản vẽ chế tạo thường có những thành phần chính nào? | HIT | 0.75 | OK |  | 0.58 |
| 4 | 234 | in_scope | Bài lab 1 yêu cầu nhập dữ liệu từ những nguồn nào? | HIT | 0.50 | OK |  | 0.45 |
| 5 | 235 | in_scope | Bài lab 2 dùng Power Query để làm gì? | HIT | 0.50 | OK |  | 0.47 |
| 6 | 185 | out_of_scope | Giá vàng hôm nay là bao nhiêu? |  | 0.00 |  | OK | 0.00 |
| 7 | 233 | out_of_scope | Làm sao gửi dữ liệu cảm biến từ ESP32 lên Firebase? |  | 0.00 |  | OK | 0.00 |
| 8 | 186 | out_of_scope | Ai là người sáng lập Facebook? |  | 0.00 |  | OK | 0.00 |

> Lưu ý: *Faithfulness proxy* chỉ đo mức trùng token với nguồn đã truy xuất, không thay thế đánh giá của con người. Cần chấm thủ công mẫu câu trả lời trước khi công bố số liệu khoa học.
