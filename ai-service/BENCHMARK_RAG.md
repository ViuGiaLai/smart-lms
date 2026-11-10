# Benchmark RAG - Smart LMS

- Thời điểm chạy: 2026-11-05
- Model nhúng: `models/gemini-embedding-001` (768 chiều)
- Phương pháp: lesson-bounded similarity search trên bảng `document_chunks` (pgvector)
- Ground-truth: từ khóa đặc trưng đã xác minh tồn tại trong học liệu của từng bài
- Lệnh: `python evaluate_rag.py --top-k <K> --out BENCHMARK_RAG.md`

### Lần chạy Top-K = 4

| # | Bài | Câu hỏi | Từ khóa | Kết quả | Precision | Latency (ms) |
|---|-----|---------|---------|---------|-----------|--------------|
| 1 | 1 | Cơ chế nào giúp Python xử lý tác vụ bất đồng bộ mà không chặn luồng chính? | `event loop` | HIT | 0.25 | 2471.4 |
| 2 | 1 | Hàm nào dùng để chạy song song nhiều tác vụ I/O-bound trong AsyncIO? | `asyncio.gather` | HIT | 0.25 | 635.5 |
| 3 | 2 | RAG khắc phục hiện tượng gì của mô hình ngôn ngữ lớn? | `hallucination` | HIT | 0.25 | 606.1 |
| 4 | 3 | FastAPI xác thực dữ liệu đầu vào bằng thư viện nào? | `pydantic` | HIT | 0.25 | 600.8 |
| 5 | 3 | Cơ chế nào quản lý phiên làm việc cơ sở dữ liệu an toàn trong FastAPI? | `dependency injection` | HIT | 0.25 | 657.1 |
| 6 | 4 | PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào? | `hnsw` | HIT | 0.25 | 636.4 |
| 7 | 4 | Kỹ thuật phân đoạn văn bản trong RAG có tên tiếng Anh là gì? | `chunking` | HIT | 0.25 | 579.8 |
| 8 | 186 | Vì sao cùng một lực nhưng ứng suất lại khác nhau? | `diện tích` | HIT | 0.25 | 611.1 |

- **Hit Rate @ 4**: 100.00%
- **Context Precision @ 4**: 25.00%
- **Latency trung bình**: 849.78 ms
- **Số chunk truy xuất**: 32 / 8 câu hỏi

### Lần chạy Top-K = 2

| # | Bài | Câu hỏi | Từ khóa | Kết quả | Precision | Latency (ms) |
|---|-----|---------|---------|---------|-----------|--------------|
| 1 | 1 | Cơ chế nào giúp Python xử lý tác vụ bất đồng bộ mà không chặn luồng chính? | `event loop` | HIT | 0.50 | 3501.6 |
| 2 | 1 | Hàm nào dùng để chạy song song nhiều tác vụ I/O-bound trong AsyncIO? | `asyncio.gather` | HIT | 0.50 | 594.7 |
| 3 | 2 | RAG khắc phục hiện tượng gì của mô hình ngôn ngữ lớn? | `hallucination` | HIT | 0.50 | 570.0 |
| 4 | 3 | FastAPI xác thực dữ liệu đầu vào bằng thư viện nào? | `pydantic` | HIT | 0.50 | 589.6 |
| 5 | 3 | Cơ chế nào quản lý phiên làm việc cơ sở dữ liệu an toàn trong FastAPI? | `dependency injection` | HIT | 0.50 | 571.3 |
| 6 | 4 | PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào? | `hnsw` | HIT | 0.50 | 610.2 |
| 7 | 4 | Kỹ thuật phân đoạn văn bản trong RAG có tên tiếng Anh là gì? | `chunking` | HIT | 0.50 | 585.0 |
| 8 | 186 | Vì sao cùng một lực nhưng ứng suất lại khác nhau? | `diện tích` | HIT | 0.50 | 595.2 |

- **Hit Rate @ 2**: 100.00%
- **Context Precision @ 2**: 50.00%
- **Latency trung bình**: 952.19 ms
- **Số chunk truy xuất**: 16 / 8 câu hỏi

### Lần chạy Top-K = 1

| # | Bài | Câu hỏi | Từ khóa | Kết quả | Precision | Latency (ms) |
|---|-----|---------|---------|---------|-----------|--------------|
| 1 | 1 | Cơ chế nào giúp Python xử lý tác vụ bất đồng bộ mà không chặn luồng chính? | `event loop` | MISS | 0.00 | 2675.0 |
| 2 | 1 | Hàm nào dùng để chạy song song nhiều tác vụ I/O-bound trong AsyncIO? | `asyncio.gather` | HIT | 1.00 | 516.7 |
| 3 | 2 | RAG khắc phục hiện tượng gì của mô hình ngôn ngữ lớn? | `hallucination` | HIT | 1.00 | 538.6 |
| 4 | 3 | FastAPI xác thực dữ liệu đầu vào bằng thư viện nào? | `pydantic` | HIT | 1.00 | 566.2 |
| 5 | 3 | Cơ chế nào quản lý phiên làm việc cơ sở dữ liệu an toàn trong FastAPI? | `dependency injection` | HIT | 1.00 | 530.8 |
| 6 | 4 | PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào? | `hnsw` | HIT | 1.00 | 552.0 |
| 7 | 4 | Kỹ thuật phân đoạn văn bản trong RAG có tên tiếng Anh là gì? | `chunking` | HIT | 1.00 | 557.9 |
| 8 | 186 | Vì sao cùng một lực nhưng ứng suất lại khác nhau? | `diện tích` | HIT | 1.00 | 556.1 |

- **Hit Rate @ 1**: 87.50%
- **Context Precision @ 1**: 87.50%
- **Latency trung bình**: 811.66 ms
- **Số chunk truy xuất**: 8 / 8 câu hỏi
