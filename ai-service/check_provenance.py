"""Kiểm tra 100% chunk có provenance tối thiểu trước khi nghiệm thu.

Quy ước:
- mọi chunk phải có ``source_type`` và ``filename`` (hoặc ``document_title``);
- chunk ``youtube_subtitle`` phải có ``start_seconds``;
- chunk ``document`` nên có ``page`` nếu tài liệu là PDF/PPTX (DOCX không có trang).

Mặc định kiểm tra toàn bộ. Ví dụ khóa pilot:

    python check_provenance.py --lesson-id 186 --lesson-id 187 --lesson-id 234

Mã thoát 1 nếu còn chunk thiếu provenance.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter

from sqlalchemy import text

from core.database import AsyncSessionLocal


async def run(lesson_ids: list[int] | None) -> int:
    filters = ""
    params: dict = {}
    if lesson_ids:
        filters = "WHERE lesson_id = ANY(:lesson_ids)"
        params["lesson_ids"] = lesson_ids

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    f"""
                    SELECT id, lesson_id, document_id, chunk_metadata
                    FROM document_chunks
                    {filters}
                    """
                ),
                params,
            )
        ).all()

    total = len(rows)
    by_type: Counter[str] = Counter()
    problems: list[str] = []

    for row in rows:
        metadata = row.chunk_metadata or {}
        if not isinstance(metadata, dict):
            metadata = {}
        source_type = metadata.get("source_type")
        by_type[str(source_type or "<thiếu>")] += 1

        filename = metadata.get("filename") or metadata.get("document_title")
        if not source_type:
            problems.append(f"chunk {row.id} (lesson {row.lesson_id}): thiếu source_type")
            continue
        if not filename:
            problems.append(f"chunk {row.id} (lesson {row.lesson_id}): thiếu filename")
        if source_type == "youtube_subtitle" and metadata.get("start_seconds") is None:
            problems.append(f"chunk {row.id} (lesson {row.lesson_id}): subtitle thiếu start_seconds")

    print(f"Tổng chunk: {total}")
    for source_type, count in by_type.most_common():
        print(f"  - {source_type}: {count}")
    if problems:
        print(f"\nCòn {len(problems)} vấn đề:")
        for problem in problems[:50]:
            print(f"  ! {problem}")
        if len(problems) > 50:
            print(f"  ... và {len(problems) - 50} vấn đề khác")
        return 1

    print("\nOK: 100% chunk trong phạm vi có provenance tối thiểu.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Kiểm tra provenance của document_chunks")
    parser.add_argument(
        "--lesson-id",
        type=int,
        action="append",
        dest="lesson_ids",
        help="Chỉ kiểm tra bài học này (lặp lại được)",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.lesson_ids)))


if __name__ == "__main__":
    main()
