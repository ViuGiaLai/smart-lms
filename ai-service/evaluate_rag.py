"""
Smart LMS - Module Đánh giá và Thực nghiệm RAG (RAG Evaluation & Benchmarking)
Phục vụ đo lường định lượng các chỉ số khoa học theo Thuyết minh đề tài:
1. Hit Rate @ K (Tỷ lệ tìm thấy đoạn thông tin gốc trong Top-K kết quả)
2. Context Precision (Tỷ lệ chunk truy xuất thực sự liên quan trong Top-K)
3. Thời gian truy xuất trung bình (Retrieval Latency ms) của lesson-bounded search

Lưu ý phương pháp: Ground-truth được xác định bằng từ khóa đặc trưng xuất hiện
trong học liệu đã nạp (bảng `document_chunks`). Mỗi bài học hiện có 4 chunk nên
khi đo Top-K = 4 thì Hit Rate dễ đạt 100%; muốn phân biệt chất lượng xếp hạng nên
giảm K xuống 1-2 (ví dụ chạy `run_evaluation(top_k=2)`).
"""

import asyncio
import sys
import time
from typing import List, Dict
import structlog

# Console Windows mặc định dùng cp1252 nên cần ép UTF-8 để in được tiếng Việt
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

from core.database import AsyncSessionLocal
from vector_store.pgvector_store import PgVectorStore
from document_processor.embedder import get_embedder

logger = structlog.get_logger(__name__)

# Bộ dữ liệu kiểm thử thực nghiệm mẫu (Test Benchmark Set)
# lesson_id và ground_truth_keyword được đối chiếu trực tiếp với nội dung
# các chunk đã nạp vào pgvector để bảo đảm ground-truth tồn tại trong học liệu.
TEST_BENCHMARK = [
    {
        "lesson_id": 1,
        "question": "Cơ chế nào giúp Python xử lý tác vụ bất đồng bộ mà không chặn luồng chính?",
        "ground_truth_keyword": "event loop",
    },
    {
        "lesson_id": 2,
        "question": "Lệnh nào giúp Generator tiết kiệm RAM khi duyệt dữ liệu lớn?",
        "ground_truth_keyword": "yield",
    },
    {
        "lesson_id": 3,
        "question": "FastAPI xác thực dữ liệu đầu vào bằng thư viện nào?",
        "ground_truth_keyword": "pydantic",
    },
    {
        "lesson_id": 4,
        "question": "Kỹ thuật Chunking trong RAG có vai trò gì?",
        "ground_truth_keyword": "chunking",
    },
    {
        "lesson_id": 4,
        "question": "PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào?",
        "ground_truth_keyword": "hnsw",
    },
]

async def run_evaluation(top_k: int = 4) -> Dict[str, float]:
    """
    Chạy thực nghiệm đánh giá mô hình RAG trên bộ câu hỏi kiểm thử.
    """
    embedder = get_embedder()
    hit_count = 0
    precision_sum = 0.0
    retrieved_total = 0
    total_latency = 0.0

    print("=" * 60)
    print("BẮT ĐẦU ĐÁNH GIÁ ĐỊNH LƯỢNG MÔ HÌNH RAG (SMART LMS)")
    print(f"Tham số: Top-K = {top_k} | Số câu hỏi kiểm thử = {len(TEST_BENCHMARK)}")
    print("=" * 60)

    async with AsyncSessionLocal() as db:
        store = PgVectorStore(db)

        for idx, item in enumerate(TEST_BENCHMARK, 1):
            q = item["question"]
            lesson_id = item["lesson_id"]
            keyword = item["ground_truth_keyword"].lower()

            start_t = time.perf_counter()
            query_vector = await embedder.embed_query(q)
            results = await store.similarity_search_by_lesson(
                query_embedding=query_vector,
                lesson_id=lesson_id,
                top_k=top_k,
            )
            elapsed_ms = (time.perf_counter() - start_t) * 1000
            total_latency += elapsed_ms

            # Hit Rate: có ít nhất 1 chunk chứa từ khóa ground truth không
            matched = [r for r in results if keyword in r["content"].lower()]
            is_hit = len(matched) > 0
            if is_hit:
                hit_count += 1

            # Context Precision: tỷ lệ chunk truy xuất thực sự liên quan
            precision = (len(matched) / len(results)) if results else 0.0
            precision_sum += precision
            retrieved_total += len(results)

            status = "HIT ✅" if is_hit else "MISS ❌"
            print(
                f"[{idx}/{len(TEST_BENCHMARK)}] {status} | Lesson {lesson_id} | "
                f"Latency: {elapsed_ms:.1f}ms | Precision: {precision:.2f} "
                f"({len(matched)}/{len(results)} chunk chứa '{keyword}')"
            )
            print(f"        Câu hỏi: {q}")

    total_tests = len(TEST_BENCHMARK)
    hit_rate = (hit_count / total_tests) * 100 if total_tests > 0 else 0
    avg_precision = (precision_sum / total_tests) * 100 if total_tests > 0 else 0
    avg_latency = total_latency / total_tests if total_tests > 0 else 0

    print("-" * 60)
    print("KẾT QUẢ ĐO LƯỜNG:")
    print(f"- Hit Rate @ {top_k}: {hit_rate:.2f}%  ({hit_count}/{total_tests} câu tìm thấy chunk ground-truth)")
    print(f"- Context Precision @ {top_k}: {avg_precision:.2f}%")
    print(f"- Tổng số chunk truy xuất: {retrieved_total}")
    print(f"- Thời gian truy xuất trung bình: {avg_latency:.2f} ms")
    print("=" * 60)

    return {
        "hit_rate": hit_rate,
        "context_precision": avg_precision,
        "avg_latency_ms": avg_latency,
        "total_tests": total_tests,
    }

if __name__ == "__main__":
    asyncio.run(run_evaluation())
