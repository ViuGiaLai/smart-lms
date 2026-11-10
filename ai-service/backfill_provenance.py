"""Bổ sung provenance cho các chunk cũ chưa có ``source_type``.

Chunk mới được AI Service ghi metadata đầy đủ khi ingest. Các chunk tạo trước
khi chuẩn hóa (đặc biệt transcript YouTube) có thể thiếu khóa này, khiến trích
dẫn trên giao diện và bộ đánh giá không phân loại được nguồn.

Mặc định chỉ báo cáo; thêm ``--apply`` để ghi.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from collections import Counter

from sqlalchemy import text

from core.database import AsyncSessionLocal

# Dạng mốc thời gian cũ do bộ chia transcript sinh ra: "[05:01 - 15:00]".
_RANGE_RE = re.compile(
    r"\[\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\]"
)


def _to_seconds(first: str, second: str, third: str | None = None) -> int:
    """Đổi mm:ss (third=None) hoặc hh:mm:ss thành giây."""
    if third is None:
        return int(first) * 60 + int(second)
    return int(first) * 3600 + int(second) * 60 + int(third)


def parse_timestamp_range(value: object) -> tuple[int, int] | None:
    """Đọc "[mm:ss - mm:ss]" hoặc "[hh:mm:ss - hh:mm:ss]" thành giây."""
    if not isinstance(value, str):
        return None
    match = _RANGE_RE.search(value)
    if not match:
        return None
    return _to_seconds(match.group(1), match.group(2), match.group(3)), _to_seconds(
        match.group(4), match.group(5), match.group(6)
    )


def infer_source(metadata: dict, document_id: str | None) -> str:
    if metadata.get("source_type"):
        return str(metadata["source_type"])
    # Chunk transcript cũ có thể chỉ lưu khoảng thời gian dạng chuỗi, hoặc
    # không có mốc thời gian nào nhưng nội dung bắt đầu bằng "Bài học: ...".
    if metadata.get("start_seconds") is not None or metadata.get("timestamp_range"):
        return "youtube_subtitle"
    if metadata.get("source") == "lesson_transcript":
        return "transcript"
    if metadata.get("page") is not None:
        return "document"
    if (document_id or "").startswith("youtube"):
        return "youtube_subtitle"
    return "document" if metadata.get("filename") else "transcript"


def fallback_filename(metadata: dict, document_id: str | None, lesson_title: str | None) -> str:
    """Tên nguồn dễ hiểu khi chunk cũ chỉ có mã tài liệu nội bộ."""
    existing = metadata.get("filename") or metadata.get("document_title")
    if existing:
        return str(existing)
    doc = document_id or ""
    if doc.startswith("doc_lesson_") and lesson_title:
        return f"{lesson_title} (bản ghi bài giảng)"
    if doc.startswith("material:") and lesson_title:
        return f"Học liệu bài: {lesson_title}"
    return doc or f"lesson-{metadata.get('lesson_id') or 'khong-ro'}"


async def run(apply: bool, lesson_ids: list[int] | None) -> int:
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

        title_rows = (
            await db.execute(text("SELECT id, title FROM lessons"))
        ).all()
        lesson_titles = {int(row.id): row.title for row in title_rows}

        missing = []
        for row in rows:
            metadata = row.chunk_metadata or {}
            if not isinstance(metadata, dict):
                metadata = {}
            if metadata.get("source_type") and metadata.get("filename"):
                continue
            missing.append((row, metadata))

        print(f"Tổng chunk trong phạm vi: {len(rows)} | Thiếu provenance: {len(missing)}")
        counts = Counter(
            infer_source(metadata, row.document_id) for row, metadata in missing
        )
        for source_type, count in counts.most_common():
            print(f"  - {source_type}: {count}")

        if apply and missing:
            for row, metadata in missing:
                updated = dict(metadata)
                updated["source_type"] = infer_source(metadata, row.document_id)
                updated["filename"] = fallback_filename(
                    metadata,
                    row.document_id,
                    lesson_titles.get(int(row.lesson_id)),
                )
                # Chuyển mốc thời gian dạng chuỗi thành giây để giao diện tua
                # được video và bộ kiểm tra provenance xác nhận đủ dữ liệu.
                if updated["source_type"] == "youtube_subtitle" and (
                    updated.get("start_seconds") is None
                ):
                    span = parse_timestamp_range(updated.get("timestamp_range"))
                    if span:
                        updated.setdefault("start_seconds", span[0])
                        updated.setdefault("end_seconds", span[1])
                await db.execute(
                    text(
                        "UPDATE document_chunks SET chunk_metadata = CAST(:meta AS JSON) WHERE id = :id"
                    ),
                    {"meta": json.dumps(updated, ensure_ascii=False), "id": row.id},
                )
            await db.commit()
            print(f"Đã cập nhật {len(missing)} chunk.")

    if not apply:
        print("Chạy thử: chưa thay đổi dữ liệu. Thêm --apply để thực thi.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Bổ sung provenance cho document_chunks")
    parser.add_argument("--apply", action="store_true", help="Thực sự cập nhật dữ liệu")
    parser.add_argument(
        "--lesson-id",
        type=int,
        action="append",
        dest="lesson_ids",
        help="Chỉ xử lý bài học này (lặp lại được)",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.apply, args.lesson_ids)))


if __name__ == "__main__":
    main()
