"""Nạp nội dung/transcript có sẵn của bài giảng vào kho tri thức AI.

Một số bài học có ``lessons.transcript`` (nội dung bài giảng soạn sẵn hoặc phụ
đề đã tải) nhưng chưa từng được nhúng vào ``document_chunks``. Khi đó giao diện
vẫn hiển thị nội dung, còn Gia sư AI lại trả lời "chưa có nội dung" vì kho tri
thức rỗng.

Script này bổ sung đúng phần còn thiếu, không xóa nguồn khác của bài:

    # Xem trước
    python ingest_lesson_transcript.py --lesson-id 232

    # Ghi dữ liệu
    python ingest_lesson_transcript.py --lesson-id 232 --apply

    # Quét các bài đang published có transcript mà chưa có chunk
    python ingest_lesson_transcript.py --missing-only
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import text

from core.database import AsyncSessionLocal
from document_processor.chunker import TextChunker
from document_processor.embedder import get_embedder
from vector_store.pgvector_store import PgVectorStore


async def _load_lessons(
    lesson_ids: list[int] | None, missing_only: bool
) -> list[dict]:
    filters = []
    params: dict = {}
    if lesson_ids:
        filters.append("l.id = ANY(:lesson_ids)")
        params["lesson_ids"] = lesson_ids
    if missing_only:
        filters.append(
            "c.status = 'published' AND coalesce(trim(l.transcript), '') <> '' "
            "AND NOT EXISTS (SELECT 1 FROM document_chunks dc WHERE dc.lesson_id = l.id)"
        )
    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    f"""
                    SELECT l.id, l.course_id, l.title, l.transcript,
                           c.title AS course_title, c.status AS course_status,
                           (SELECT count(*) FROM document_chunks dc
                             WHERE dc.lesson_id = l.id) AS chunk_count
                    FROM lessons l
                    JOIN courses c ON c.id = l.course_id
                    {where}
                    ORDER BY l.course_id, l.id
                    """
                ),
                params,
            )
        ).mappings().all()
        return [dict(row) for row in rows]


async def run(
    lesson_ids: list[int] | None,
    missing_only: bool,
    apply: bool,
    document_prefix: str,
    chunk_size: int,
    chunk_overlap: int,
) -> int:
    lessons = await _load_lessons(lesson_ids, missing_only)
    print(f"Chế độ: {'GHI DỮ LIỆU' if apply else 'CHẠY THỬ (không ghi)'}")
    print(f"Bài học trong phạm vi: {len(lessons)}")

    chunker = TextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    embedder = get_embedder()
    total_written = 0
    total_removed = 0

    for lesson in lessons:
        transcript = (lesson.get("transcript") or "").strip()
        if not transcript:
            print(f"  - Bỏ qua bài {lesson['id']} ({lesson['title'][:50]}): không có transcript")
            continue

        chunks = chunker.split_text(
            transcript,
            metadata={
                "lesson_id": lesson["id"],
                "filename": f"{lesson['title']} (nội dung bài giảng)",
                "document_title": lesson["title"],
                "source_type": "transcript",
            },
        )
        document_id = f"{document_prefix}-{lesson['id']}"
        print(
            f"  • Bài {lesson['id']} [{lesson['course_id']}] "
            f"{lesson['title'][:55]!r} | {len(transcript)} ký tự → {len(chunks)} chunk "
            f"| hiện có {lesson['chunk_count']} chunk"
        )

        if not apply or not chunks:
            continue

        embeddings = await embedder.embed_documents([chunk.content for chunk in chunks])
        metadata_list = []
        for chunk in chunks:
            metadata = dict(chunk.metadata)
            metadata.setdefault("chunk_index", chunk.chunk_index)
            metadata_list.append(metadata)

        async with AsyncSessionLocal() as db:
            store = PgVectorStore(db)
            removed = await store.delete_by_document(document_id)
            await store.add_chunks(
                lesson_id=lesson["id"],
                contents=[chunk.content for chunk in chunks],
                embeddings=embeddings,
                document_id=document_id,
                metadata_list=metadata_list,
            )
        total_removed += removed
        total_written += len(chunks)
        print(f"    → đã ghi {len(chunks)} chunk (thay {removed} chunk cũ của {document_id})")

    if apply:
        print(f"\nĐã ghi {total_written} chunk, thay thế {total_removed} chunk cũ.")
    else:
        print("\nChạy thử: chưa thay đổi dữ liệu. Thêm --apply để thực thi.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

    parser = argparse.ArgumentParser(
        description="Nạp transcript bài giảng vào kho tri thức AI"
    )
    parser.add_argument(
        "--lesson-id",
        type=int,
        action="append",
        dest="lesson_ids",
        help="ID bài học cần nạp (lặp lại được)",
    )
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Chỉ quét bài published có transcript nhưng chưa có chunk nào",
    )
    parser.add_argument(
        "--document-prefix",
        default="lesson-transcript",
        help="Tiền tố document_id cho chunk transcript",
    )
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--chunk-overlap", type=int, default=200)
    parser.add_argument("--apply", action="store_true", help="Thực sự ghi dữ liệu")
    args = parser.parse_args()

    if not args.lesson_ids and not args.missing_only:
        parser.error("Cần --lesson-id hoặc --missing-only")

    raise SystemExit(
        asyncio.run(
            run(
                args.lesson_ids,
                args.missing_only,
                args.apply,
                args.document_prefix,
                args.chunk_size,
                args.chunk_overlap,
            )
        )
    )


if __name__ == "__main__":
    main()
