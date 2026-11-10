"""
Smart LMS - Module Đánh giá và Thực nghiệm RAG (RAG Evaluation & Benchmarking)
Phục vụ đo lường định lượng các chỉ số khoa học theo Thuyết minh đề tài:
1. Hit Rate @ K (Tỷ lệ tìm thấy đoạn thông tin gốc trong Top-K kết quả)
2. Context Precision (Tỷ lệ chunk truy xuất thực sự liên quan trong Top-K)
3. Thời gian truy xuất trung bình (Retrieval Latency ms) của lesson-bounded search

Lưu ý phương pháp: Ground-truth được xác định bằng từ khóa đặc trưng xuất hiện
trong học liệu đã nạp (bảng `document_chunks`). Mỗi bài học có số chunk khác
nhau (bài có transcript YouTube thường nhiều chunk hơn), nên nên chạy cả K = 2
và K = 4 để thấy rõ ảnh hưởng của độ rộng ngữ cảnh tới Hit Rate/Precision.

Cách chạy:
    python evaluate_rag.py --top-k 4
    python evaluate_rag.py --top-k 2 --out BENCHMARK_RAG.md
"""

import argparse
import asyncio
import sys
import time
from typing import Dict, List

import structlog

# Console Windows mặc định dùng cp1252 nên cần ép UTF-8 để in được tiếng Việt
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

from core.database import AsyncSessionLocal
from vector_store.pgvector_store import PgVectorStore
from document_processor.embedder import get_embedder

logger = structlog.get_logger(__name__)

# Bộ dữ liệu kiểm thử thực nghiệm mẫu (Test Benchmark Set).
# `lesson_id` và `ground_truth_keyword` được đối chiếu trực tiếp với nội dung
# các chunk đã nạp vào pgvector để bảo đảm ground-truth tồn tại trong học liệu.
# Các bài 1-4 là học liệu biên soạn; bài 186 là bài có transcript YouTube đã
# nạp qua pipeline phụ đề, dùng để kiểm tra khả năng truy xuất trên dữ liệu thật.
TEST_BENCHMARK: List[Dict[str, object]] = [
    {
        "lesson_id": 1,
        "question": "Cơ chế nào giúp Python xử lý tác vụ bất đồng bộ mà không chặn luồng chính?",
        "ground_truth_keyword": "event loop",
    },
    {
        "lesson_id": 1,
        "question": "Hàm nào dùng để chạy song song nhiều tác vụ I/O-bound trong AsyncIO?",
        "ground_truth_keyword": "asyncio.gather",
    },
    {
        "lesson_id": 2,
        "question": "RAG khắc phục hiện tượng gì của mô hình ngôn ngữ lớn?",
        "ground_truth_keyword": "hallucination",
    },
    {
        "lesson_id": 3,
        "question": "FastAPI xác thực dữ liệu đầu vào bằng thư viện nào?",
        "ground_truth_keyword": "pydantic",
    },
    {
        "lesson_id": 3,
        "question": "Cơ chế nào quản lý phiên làm việc cơ sở dữ liệu an toàn trong FastAPI?",
        "ground_truth_keyword": "dependency injection",
    },
    {
        "lesson_id": 4,
        "question": "PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào?",
        "ground_truth_keyword": "hnsw",
    },
    {
        "lesson_id": 4,
        "question": "Kỹ thuật phân đoạn văn bản trong RAG có tên tiếng Anh là gì?",
        "ground_truth_keyword": "chunking",
    },
    {
        "lesson_id": 186,
        "question": "Vì sao cùng một lực nhưng ứng suất lại khác nhau?",
        "ground_truth_keyword": "diện tích",
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
    details: List[Dict[str, object]] = []

    print("=" * 60)
    print("BẮT ĐẦU ĐÁNH GIÁ ĐỊNH LƯỢNG MÔ HÌNH RAG (SMART LMS)")
    print(f"Tham số: Top-K = {top_k} | Số câu hỏi kiểm thử = {len(TEST_BENCHMARK)}")
    print("=" * 60)

    async with AsyncSessionLocal() as db:
        store = PgVectorStore(db)

        for idx, item in enumerate(TEST_BENCHMARK, 1):
            q = str(item["question"])
            lesson_id = int(item["lesson_id"])  # type: ignore[arg-type]
            keyword = str(item["ground_truth_keyword"]).lower()

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

            details.append(
                {
                    "index": idx,
                    "lesson_id": lesson_id,
                    "question": q,
                    "keyword": keyword,
                    "hit": is_hit,
                    "precision": precision,
                    "matched": len(matched),
                    "retrieved": len(results),
                    "latency_ms": elapsed_ms,
                }
            )

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
        "top_k": top_k,
        "hit_rate": hit_rate,
        "context_precision": avg_precision,
        "avg_latency_ms": avg_latency,
        "total_tests": total_tests,
        "retrieved_total": retrieved_total,
        "details": details,
    }


def render_markdown(result: Dict[str, object]) -> str:
    """Sinh báo cáo Markdown từ kết quả một lần chạy benchmark."""
    top_k = result["top_k"]
    details = result.get("details") or []
    lines = [
        "",
        f"### Lần chạy Top-K = {top_k}",
        "",
        "| # | Bài | Câu hỏi | Từ khóa | Kết quả | Precision | Latency (ms) |",
        "|---|-----|---------|---------|---------|-----------|--------------|",
    ]
    for row in details:  # type: ignore[union-attr]
        lines.append(
            "| {index} | {lesson_id} | {question} | `{keyword}` | {status} | {precision:.2f} | {latency:.1f} |".format(
                index=row["index"],
                lesson_id=row["lesson_id"],
                question=str(row["question"]).replace("|", "\\|"),
                keyword=row["keyword"],
                status="HIT" if row["hit"] else "MISS",
                precision=float(row["precision"]),
                latency=float(row["latency_ms"]),
            )
        )
    lines += [
        "",
        f"- **Hit Rate @ {top_k}**: {float(result['hit_rate']):.2f}%",
        f"- **Context Precision @ {top_k}**: {float(result['context_precision']):.2f}%",
        f"- **Latency trung bình**: {float(result['avg_latency_ms']):.2f} ms",
        f"- **Số chunk truy xuất**: {result['retrieved_total']} / {result['total_tests']} câu hỏi",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Đánh giá định lượng RAG của Smart LMS")
    parser.add_argument("--top-k", type=int, default=4, help="Số chunk truy xuất cho mỗi câu hỏi (mặc định 4)")
    parser.add_argument("--out", type=str, default=None, help="Ghi báo cáo Markdown vào file")
    args = parser.parse_args()

    result = asyncio.run(run_evaluation(top_k=args.top_k))

    if args.out:
        report = render_markdown(result)  # type: ignore[arg-type]
        with open(args.out, "a", encoding="utf-8") as handle:
            handle.write(report)
        print(f"Đã ghi kết quả vào {args.out}")


if __name__ == "__main__":
    main()
