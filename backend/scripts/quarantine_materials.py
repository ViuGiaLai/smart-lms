"""Cách ly học liệu sai chủ đề mà không xóa tệp gốc.

Tình huống thực tế: một tệp được tải lên nhầm bài học (ví dụ tài liệu ASP.NET
gắn vào bài React.js). Xóa hẳn sẽ mất dấu vết và không thể đối chiếu; cách ly
giữ nguyên tệp trên kho lưu trữ, đặt trạng thái ``failed`` kèm lý do để học
viên không thấy, đồng thời gỡ các đoạn tri thức đã nhúng khỏi AI Tutor.

Mặc định chỉ báo cáo. Thêm ``--apply`` để thực thi.

    python -m scripts.quarantine_materials --material-id 2 --material-id 3 \
        --reason "Tệp không khớp bài học, cần giảng viên tải lại"
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.models.lesson_material import LessonMaterial


async def run(material_ids: list[int], reason: str, apply: bool) -> int:
    async with AsyncSessionLocal() as db:
        materials = (
            await db.execute(
                text(
                    """
                    SELECT lm.id, lm.lesson_id, lm.kind, lm.title, lm.status,
                           l.title AS lesson_title, l.course_id
                    FROM lesson_materials lm
                    JOIN lessons l ON l.id = lm.lesson_id
                    WHERE lm.id = ANY(:ids)
                    ORDER BY lm.id
                    """
                ),
                {"ids": material_ids},
            )
        ).all()

        found = {int(row.id) for row in materials}
        for missing in sorted(set(material_ids) - found):
            print(f"  ! Không tìm thấy học liệu id={missing}")

        print(f"Chế độ: {'GHI DỮ LIỆU' if apply else 'CHẠY THỬ (không ghi)'}")
        for row in materials:
            print(
                f"  • id={row.id} lesson={row.lesson_id} [{row.course_id}] "
                f"{row.lesson_title[:40]!r} | {row.kind} | status={row.status}"
            )
            print(f"    tệp: {row.title!r}")

        if not apply or not materials:
            if not apply:
                print("\nChạy thử: chưa thay đổi dữ liệu. Thêm --apply để thực thi.")
            return 0

        for row in materials:
            material = await db.get(LessonMaterial, int(row.id))
            if material is None:
                continue
            material.status = "failed"
            material.error_message = reason

        # Gỡ đúng các chunk sinh từ học liệu này; chunk của bài giảng/video
        # khác trong cùng bài học được giữ nguyên.
        deleted = 0
        for row in materials:
            document_id = f"material:{int(row.id)}"
            result = await db.execute(
                text("DELETE FROM document_chunks WHERE document_id = :doc"),
                {"doc": document_id},
            )
            deleted += int(result.rowcount or 0)
            print(f"  - Đã gỡ {result.rowcount or 0} chunk của {document_id}")

        await db.commit()
        print(f"\nĐã cách ly {len(materials)} học liệu, gỡ {deleted} chunk tri thức.")
        print("Tệp gốc vẫn nằm trên kho lưu trữ để đối chiếu hoặc tải lại.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Cách ly học liệu sai chủ đề")
    parser.add_argument(
        "--material-id",
        type=int,
        action="append",
        dest="material_ids",
        required=True,
        help="ID học liệu cần cách ly (lặp lại được)",
    )
    parser.add_argument(
        "--reason",
        default="Tệp không khớp bài học. Giảng viên vui lòng tải lại tài liệu đúng.",
        help="Lý do hiển thị cho giảng viên",
    )
    parser.add_argument("--apply", action="store_true", help="Thực sự cập nhật dữ liệu")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.material_ids, args.reason, args.apply)))


if __name__ == "__main__":
    main()
