"""Đánh giá RAG phiên bản 2: truy xuất, trích dẫn, từ chối và độ bám nguồn.

Khác với ``evaluate_rag.py`` (chỉ đo Hit Rate/Precision), script này đọc bộ câu
hỏi từ CSV và đo thêm:

- ``answer_keyword_coverage``: tỷ lệ từ khóa kỳ vọng xuất hiện trong câu trả lời;
- ``citation_rate``: câu trả lời trong phạm vi có kèm nguồn hay không;
- ``refusal_accuracy``: câu ngoài phạm vi có được từ chối đúng hay không;
- ``faithfulness_proxy``: tỷ lệ token nội dung của câu trả lời xuất hiện trong
  nguồn đã truy xuất (chỉ là chỉ báo gần đúng, không thay thế chấm bằng người).

Chạy:
    python evaluate_rag_v2.py --dataset eval_dataset_template.csv
    python evaluate_rag_v2.py --dataset eval_dataset_template.csv --retrieval-only
    python evaluate_rag_v2.py --dataset eval_dataset_template.csv --out BENCHMARK_RAG_V2.md
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import text

from core.database import AsyncSessionLocal
from document_processor.embedder import get_embedder
from pipelines.rag_pipeline import RAGPipeline
from vector_store.pgvector_store import PgVectorStore

logger = structlog.get_logger(__name__)

REFUSAL_MARKERS = (
    "không tìm thấy",
    "không có trong",
    "không đề cập",
    "ngoài phạm vi",
    "không nằm trong",
    "chưa có thông tin",
    "không thể trả lời",
    "không đủ thông tin",
    "không có thông tin",
    "không được đề cập",
    # Câu từ chối chuẩn của pipeline (build_no_context_answer).
    "chưa có nội dung trả lời",
    "chưa có nội dung",
    "không có nội dung",
    "chưa được đề cập",
    "chưa có trong bài giảng",
    "không có trong bài giảng",
    "chưa đề cập",
)

_WORD_RE = re.compile(r"[0-9a-zA-ZÀ-ỹ]+", re.UNICODE)
_VI_STOPWORDS = {
    "và", "của", "là", "có", "cho", "trong", "một", "những", "các", "được",
    "với", "khi", "này", "đó", "thì", "mà", "để", "như", "từ", "theo", "về",
    "ra", "vào", "lên", "xuống", "rằng", "nếu", "vì", "nên", "cũng", "đã",
    "đang", "sẽ", "bị", "bởi", "hoặc", "hay", "vậy", "thế", "nào", "gì",
    "the", "and", "of", "to", "in", "is", "a", "an", "for", "on", "with",
}


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn").lower()


def tokens(value: str) -> list[str]:
    return [
        token
        for token in _WORD_RE.findall(normalize(value))
        if len(token) >= 3 and token not in _VI_STOPWORDS
    ]


def parse_keywords(raw: str) -> list[str]:
    return [item.strip() for item in re.split(r"[;|]", raw or "") if item.strip()]


def read_dataset(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"lesson_id", "question", "expected_keywords", "scope"}
        fields = {name.strip().lower() for name in (reader.fieldnames or [])}
        if not required.issubset(fields):
            raise SystemExit(
                "CSV cần các cột: lesson_id, question, expected_keywords, scope "
                "(tùy chọn: lesson_title, notes)"
            )
        rows: list[dict[str, str]] = []
        for raw in reader:
            row = {str(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            if not row.get("question"):
                continue
            row.setdefault("lesson_title", "")
            row.setdefault("notes", "")
            rows.append(row)
    return rows


async def lesson_titles(lesson_ids: set[int]) -> dict[int, str]:
    if not lesson_ids:
        return {}
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text("SELECT id, title FROM lessons WHERE id = ANY(:ids)"),
                {"ids": list(lesson_ids)},
            )
        ).all()
    return {int(row.id): row.title for row in rows}


async def evaluate(dataset_path: Path, top_k: int, retrieval_only: bool) -> dict[str, Any]:
    rows = read_dataset(dataset_path)
    if not rows:
        raise SystemExit("Bộ dữ liệu rỗng.")

    titles = await lesson_titles({int(row["lesson_id"]) for row in rows})
    embedder = get_embedder()
    pipeline = RAGPipeline() if not retrieval_only else None
    details: list[dict[str, Any]] = []

    print(f"Bộ dữ liệu: {dataset_path} | {len(rows)} câu | top-k={top_k} | retrieval_only={retrieval_only}")
    print("=" * 78)

    for index, row in enumerate(rows, start=1):
        lesson_id = int(row["lesson_id"])
        question = row["question"]
        keywords = parse_keywords(row["expected_keywords"])
        scope = (row["scope"] or "in_scope").strip().lower()
        if scope not in {"in_scope", "out_of_scope"}:
            scope = "in_scope"

        start = time.perf_counter()
        query_vector = await embedder.embed_query(question)
        async with AsyncSessionLocal() as db:
            store = PgVectorStore(db)
            retrieved = await store.similarity_search_by_lesson(
                query_embedding=query_vector,
                lesson_id=lesson_id,
                top_k=top_k,
            )
        retrieval_ms = (time.perf_counter() - start) * 1000

        keyword_hits = [
            keyword
            for keyword in keywords
            if any(normalize(keyword) in normalize(chunk.get("content") or "") for chunk in retrieved)
        ]
        matched_chunks = [
            chunk
            for chunk in retrieved
            if any(normalize(keyword) in normalize(chunk.get("content") or "") for keyword in keywords)
        ]
        hit = bool(matched_chunks) if scope == "in_scope" else None
        context_precision = (
            len(matched_chunks) / len(retrieved) if retrieved and keywords else 0.0
        )
        keyword_recall = len(keyword_hits) / len(keywords) if keywords else 0.0

        answer = ""
        sources: list[dict[str, Any]] = []
        answer_ms = 0.0
        error = ""
        if pipeline is not None:
            answer_start = time.perf_counter()
            try:
                result = await pipeline.ask(
                    question=question,
                    lesson_id=lesson_id,
                    top_k=top_k,
                    lesson_title=titles.get(lesson_id) or row["lesson_title"] or None,
                )
                answer = result.get("answer") or ""
                sources = result.get("sources") or []
            except Exception as exc:  # một câu lỗi không làm hỏng cả bộ đánh giá
                error = str(exc)[:300]
            answer_ms = (time.perf_counter() - answer_start) * 1000

        normalized_answer = normalize(answer)
        answer_coverage = (
            len([kw for kw in keywords if normalize(kw) in normalized_answer]) / len(keywords)
            if keywords and answer
            else 0.0
        )
        refusal = any(normalize(marker) in normalized_answer for marker in REFUSAL_MARKERS)
        if scope == "out_of_scope":
            refusal_correct = bool(answer) and refusal
            citation_ok = None
        else:
            refusal_correct = None
            citation_ok = bool(sources)

        source_text = " ".join(str(source.get("content") or "") for source in sources)
        answer_tokens = set(tokens(answer))
        source_tokens = set(tokens(source_text))
        faithfulness = (
            len(answer_tokens & source_tokens) / len(answer_tokens)
            if answer_tokens and source_tokens
            else 0.0
        )

        detail = {
            "index": index,
            "lesson_id": lesson_id,
            "question": question,
            "scope": scope,
            "hit": hit,
            "retrieved": len(retrieved),
            "matched_chunks": len(matched_chunks),
            "context_precision": context_precision,
            "keyword_recall": keyword_recall,
            "answer_coverage": answer_coverage,
            "citation_ok": citation_ok,
            "refusal_correct": refusal_correct,
            "faithfulness_proxy": faithfulness,
            "retrieval_ms": retrieval_ms,
            "answer_ms": answer_ms,
            "sources": len(sources),
            "error": error,
            # Lưu câu trả lời để người chấm kiểm tra thủ công khi cần; không
            # đưa toàn văn vào bảng Markdown để báo cáo gọn.
            "answer": answer,
        }
        details.append(detail)

        status = "HIT" if hit else ("MISS" if scope == "in_scope" else "--")
        flags = []
        if citation_ok is not None:
            flags.append("cited" if citation_ok else "no-cite")
        if refusal_correct is not None:
            flags.append("refused" if refusal_correct else "no-refusal")
        print(
            f"[{index}/{len(rows)}] {scope:12s} {status:4s} | lesson {lesson_id} | "
            f"retrieval {retrieval_ms:7.1f} ms | precision {context_precision:.2f} | "
            f"{' '.join(flags)}"
            + (f" | LỖI: {error}" if error else "")
        )

    in_scope = [d for d in details if d["scope"] == "in_scope"]
    out_scope = [d for d in details if d["scope"] == "out_of_scope"]
    total = len(details)

    summary = {
        "total": total,
        "in_scope": len(in_scope),
        "out_of_scope": len(out_scope),
        "hit_rate": round(sum(1 for d in in_scope if d["hit"]) / len(in_scope) * 100, 2) if in_scope else 0.0,
        "context_precision": round(
            sum(d["context_precision"] for d in in_scope) / len(in_scope) * 100, 2
        ) if in_scope else 0.0,
        "keyword_recall": round(
            sum(d["keyword_recall"] for d in in_scope) / len(in_scope) * 100, 2
        ) if in_scope else 0.0,
        "citation_rate": round(
            sum(1 for d in in_scope if d["citation_ok"]) / len(in_scope) * 100, 2
        ) if in_scope else 0.0,
        "answer_coverage": round(
            sum(d["answer_coverage"] for d in in_scope) / len(in_scope) * 100, 2
        ) if in_scope else 0.0,
        "refusal_accuracy": round(
            sum(1 for d in out_scope if d["refusal_correct"]) / len(out_scope) * 100, 2
        ) if out_scope else 0.0,
        "faithfulness_proxy": round(
            sum(d["faithfulness_proxy"] for d in in_scope) / len(in_scope) * 100, 2
        ) if in_scope else 0.0,
        "avg_retrieval_ms": round(sum(d["retrieval_ms"] for d in details) / total, 2) if total else 0.0,
        "avg_answer_ms": round(sum(d["answer_ms"] for d in details) / total, 2) if total else 0.0,
        "errors": sum(1 for d in details if d["error"]),
        "details": details,
    }

    print("-" * 78)
    print(f"Hit Rate@{top_k}: {summary['hit_rate']:.2f}%")
    print(f"Context Precision@{top_k}: {summary['context_precision']:.2f}%")
    print(f"Keyword Recall: {summary['keyword_recall']:.2f}%")
    print(f"Citation Rate: {summary['citation_rate']:.2f}%")
    print(f"Answer Keyword Coverage: {summary['answer_coverage']:.2f}%")
    print(f"Refusal Accuracy: {summary['refusal_accuracy']:.2f}%")
    print(f"Faithfulness proxy: {summary['faithfulness_proxy']:.2f}%")
    print(f"Latency truy xuất TB: {summary['avg_retrieval_ms']:.2f} ms")
    if not retrieval_only:
        print(f"Latency sinh câu trả lời TB: {summary['avg_answer_ms']:.2f} ms")
    print(f"Lỗi: {summary['errors']}")
    return summary


def render_markdown(result: dict[str, Any], top_k: int) -> str:
    lines = [
        "",
        "### Đánh giá RAG v2",
        "",
        f"- **Số câu**: {result['total']} (trong phạm vi: {result['in_scope']}, ngoài phạm vi: {result['out_of_scope']})",
        f"- **Hit Rate @ {top_k}**: {result['hit_rate']:.2f}%",
        f"- **Context Precision @ {top_k}**: {result['context_precision']:.2f}%",
        f"- **Keyword Recall**: {result['keyword_recall']:.2f}%",
        f"- **Citation Rate**: {result['citation_rate']:.2f}%",
        f"- **Answer Keyword Coverage**: {result['answer_coverage']:.2f}%",
        f"- **Refusal Accuracy**: {result['refusal_accuracy']:.2f}%",
        f"- **Faithfulness proxy**: {result['faithfulness_proxy']:.2f}%",
        f"- **Latency truy xuất TB**: {result['avg_retrieval_ms']:.2f} ms",
        f"- **Latency sinh câu trả lời TB**: {result['avg_answer_ms']:.2f} ms",
        f"- **Lỗi**: {result['errors']}",
        "",
        "| # | Bài | Phạm vi | Câu hỏi | Hit | Precision | Citation | Refusal | Faithfulness |",
        "|---|-----|---------|---------|-----|-----------|----------|---------|--------------|",
    ]
    for row in result["details"]:
        lines.append(
            "| {index} | {lesson_id} | {scope} | {question} | {hit} | {precision:.2f} | {citation} | {refusal} | {faith:.2f} |".format(
                index=row["index"],
                lesson_id=row["lesson_id"],
                scope=row["scope"],
                question=str(row["question"]).replace("|", "\\|"),
                hit="" if row["hit"] is None else ("HIT" if row["hit"] else "MISS"),
                precision=row["context_precision"],
                citation="" if row["citation_ok"] is None else ("OK" if row["citation_ok"] else "THIẾU"),
                refusal="" if row["refusal_correct"] is None else ("OK" if row["refusal_correct"] else "SAI"),
                faith=row["faithfulness_proxy"],
            )
        )
    lines.append("")
    lines.append(
        "> Lưu ý: *Faithfulness proxy* chỉ đo mức trùng token với nguồn đã truy xuất, "
        "không thay thế đánh giá của con người. Cần chấm thủ công mẫu câu trả lời "
        "trước khi công bố số liệu khoa học."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Đánh giá RAG v2 của Smart LMS")
    parser.add_argument("--dataset", type=Path, default=Path("eval_dataset_template.csv"))
    parser.add_argument("--top-k", type=int, default=4)
    parser.add_argument("--retrieval-only", action="store_true", help="Chỉ đo truy xuất, không gọi mô hình")
    parser.add_argument("--out", type=Path, default=None, help="Ghi báo cáo Markdown")
    args = parser.parse_args()

    result = asyncio.run(evaluate(args.dataset, args.top_k, args.retrieval_only))
    if args.out:
        with args.out.open("a", encoding="utf-8") as handle:
            handle.write(render_markdown(result, args.top_k))
        print(f"Đã ghi báo cáo vào {args.out}")


if __name__ == "__main__":
    main()
