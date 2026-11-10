"""Đưa các khóa học demo/chưa có học liệu thật về trạng thái nháp.

Mặc định chỉ liệt kê (dry-run). Dùng ``--apply`` để chuyển ``published`` → ``draft``.
Thao tác này có thể đảo ngược bằng cách xuất bản lại, và không xóa dữ liệu.

Tiêu chí "chưa có học liệu thật":
- không có ``lesson_materials`` ở trạng thái ``ready``;
- không có bài học nào có transcript >= ngưỡng ký tự;
- (mặc định) không có học viên nào đã ghi danh — bảo vệ lớp đang học thật.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path

from sqlalchemy import exists, func, select

from app.core.database import AsyncSessionLocal
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment
from app.models.lesson import Lesson
from app.models.lesson_material import LessonMaterial


async def run(apply: bool, min_chars: int, include_enrolled: bool, out: Path | None) -> int:
    async with AsyncSessionLocal() as db:
        has_material = exists(
            select(LessonMaterial.id)
            .join(Lesson, Lesson.id == LessonMaterial.lesson_id)
            .where(
                Lesson.course_id == Course.id,
                LessonMaterial.status == "ready",
            )
        )
        has_transcript = exists(
            select(Lesson.id).where(
                Lesson.course_id == Course.id,
                func.length(func.coalesce(Lesson.transcript, "")) >= min_chars,
            )
        )
        has_enrollment = exists(
            select(Enrollment.id).where(Enrollment.course_id == Course.id)
        )

        rows = (
            await db.execute(
                select(
                    Course.id,
                    Course.title,
                    has_material.label("has_material"),
                    has_transcript.label("has_transcript"),
                    has_enrollment.label("has_enrollment"),
                )
                .where(Course.status == CourseStatus.published)
                .order_by(Course.id)
            )
        ).all()

        candidates: list[dict[str, object]] = []
        kept: list[dict[str, object]] = []
        for course_id, title, material, transcript, enrollment in rows:
            record = {
                "id": course_id,
                "title": title,
                "has_material": bool(material),
                "has_transcript": bool(transcript),
                "has_enrollment": bool(enrollment),
            }
            is_candidate = not material and not transcript
            if is_candidate and enrollment and not include_enrolled:
                record["reason"] = "có học viên đã ghi danh — giữ nguyên"
                kept.append(record)
            elif is_candidate:
                record["reason"] = "không có học liệu/bài giảng thật"
                candidates.append(record)
            else:
                kept.append(record)

        print(f"Tổng khóa published: {len(rows)}")
        print(f"Ứng viên chuyển draft: {len(candidates)}")
        print(f"Giữ nguyên: {len(kept)}")
        print("-" * 60)
        for record in candidates:
            print(f"  → draft  #{record['id']}  {record['title']}")
        if kept:
            print("-" * 60)
            print("Giữ nguyên (có học liệu hoặc đang có học viên):")
            for record in kept:
                if record["has_material"] or record["has_transcript"] or record["has_enrollment"]:
                    print(
                        f"  • #{record['id']}  {record['title']} "
                        f"(học liệu={record['has_material']}, transcript={record['has_transcript']}, "
                        f"ghi danh={record['has_enrollment']})"
                    )

        if apply and candidates:
            course_ids = [int(record["id"]) for record in candidates]
            courses = (
                await db.execute(select(Course).where(Course.id.in_(course_ids)))
            ).scalars().all()
            for course in courses:
                course.status = CourseStatus.draft
            await db.commit()
            print(f"\nĐã chuyển {len(courses)} khóa học sang draft.")

        if out:
            with out.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["id", "title", "has_material", "has_transcript", "has_enrollment", "reason"],
                )
                writer.writeheader()
                writer.writerows(candidates + [row for row in kept if row not in candidates])

    if not apply:
        print("\nChạy thử: chưa thay đổi dữ liệu. Thêm --apply để thực thi.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Chuyển khóa học demo sang draft")
    parser.add_argument("--apply", action="store_true", help="Thực sự cập nhật trạng thái")
    parser.add_argument("--min-transcript-chars", type=int, default=500, help="Ngưỡng transcript thật (mặc định 500)")
    parser.add_argument(
        "--include-enrolled",
        action="store_true",
        help="Cũng chuyển draft cả khóa đã có học viên ghi danh (mặc định không)",
    )
    parser.add_argument("--out", type=Path, default=None, help="Ghi báo cáo CSV")
    args = parser.parse_args()
    raise SystemExit(
        asyncio.run(
            run(args.apply, args.min_transcript_chars, args.include_enrolled, args.out)
        )
    )


if __name__ == "__main__":
    main()
