"""Phục hồi học liệu bị kẹt ở trạng thái queued/processing.

Backend đã tự chạy bước này khi khởi động; script dùng khi cần xử lý ngay mà
không muốn restart. Mặc định chỉ liệt kê, thêm ``--apply`` để chuyển sang failed.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.lesson_material import LessonMaterial


async def run(minutes: int, apply: bool) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(LessonMaterial)
                .where(
                    LessonMaterial.status.in_(["queued", "processing"]),
                    LessonMaterial.created_at < threshold,
                )
                .order_by(LessonMaterial.created_at)
            )
        ).scalars().all()

        print(f"Ngưỡng: tạo trước {threshold.isoformat()} | Số bản ghi kẹt: {len(rows)}")
        for row in rows:
            print(
                f"  • id={row.id} lesson={row.lesson_id} kind={row.kind} "
                f"status={row.status} created={row.created_at.isoformat()} title={row.title}"
            )

        if apply and rows:
            for row in rows:
                row.status = "failed"
                row.error_message = (
                    "Tác vụ xử lý bị gián đoạn hoặc vượt quá thời gian cho phép. "
                    "Vui lòng tải lại tệp."
                )
            await db.commit()
            print(f"Đã chuyển {len(rows)} bản ghi sang failed.")

    if not apply:
        print("Chạy thử: chưa thay đổi dữ liệu. Thêm --apply để thực thi.")
    return 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Phục hồi học liệu kẹt")
    parser.add_argument("--minutes", type=int, default=45, help="Tuổi tối thiểu của bản ghi (mặc định 45)")
    parser.add_argument("--apply", action="store_true", help="Thực sự cập nhật trạng thái")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.minutes, args.apply)))


if __name__ == "__main__":
    main()
