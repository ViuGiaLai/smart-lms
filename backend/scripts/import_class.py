"""Nhập danh sách lớp từ CSV, tạo tài khoản học viên và ghi danh vào khóa học.

Ví dụ (chạy trong thư mục backend, dùng venv của backend):

    python -m scripts.import_class --csv lop.csv --course-id 62 --dry-run
    python -m scripts.import_class --csv lop.csv --course-id 62 --apply

CSV bắt buộc có cột ``email`` và ``full_name``; có thể thêm ``password``.
Mặc định là chạy thử (dry-run), chỉ ghi dữ liệu khi có ``--apply``.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import secrets
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole

PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_password(length: int = 10) -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(length))


def read_rows(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    errors: list[str] = []
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = {name.strip().lower() for name in (reader.fieldnames or [])}
        if not {"email", "full_name"}.issubset(fields):
            raise SystemExit("CSV cần có cột 'email' và 'full_name' (không phân biệt hoa thường).")
        for index, raw in enumerate(reader, start=2):
            normalized = {
                str(key or "").strip().lower(): (value or "").strip()
                for key, value in raw.items()
            }
            email = normalized.get("email", "").lower()
            full_name = normalized.get("full_name", "")
            if not email or "@" not in email:
                errors.append(f"Dòng {index}: email không hợp lệ ({email!r})")
                continue
            if not full_name:
                errors.append(f"Dòng {index}: thiếu họ tên")
                continue
            rows.append(
                {
                    "email": email,
                    "full_name": full_name,
                    "password": normalized.get("password", ""),
                }
            )
    return rows, errors


async def run(csv_path: Path, course_id: int, apply: bool, password_length: int, out_path: Path | None) -> int:
    rows, errors = read_rows(csv_path)
    for error in errors:
        print(f"  ! {error}")

    async with AsyncSessionLocal() as db:
        course = await db.get(Course, course_id)
        if course is None:
            raise SystemExit(f"Không tìm thấy khóa học id={course_id}")
        print(f"Khóa học: {course.title} (id={course.id}, trạng thái={getattr(course.status, 'value', course.status)})")
        print(f"Chế độ: {'GHI DỮ LIỆU' if apply else 'CHẠY THỬ (không ghi)'} | Số dòng hợp lệ: {len(rows)}")

        created = 0
        enrolled = 0
        already = 0
        skipped = 0
        credentials: list[dict[str, str]] = []

        for row in rows:
            user = (
                await db.execute(select(User).where(User.email == row["email"]))
            ).scalar_one_or_none()

            if user is not None:
                role = getattr(user.role, "value", str(user.role))
                if role != UserRole.student.value:
                    print(f"  - bỏ qua {row['email']}: đã tồn tại với vai trò {role}")
                    skipped += 1
                    continue
                exists = (
                    await db.execute(
                        select(Enrollment.id).where(
                            Enrollment.user_id == user.id,
                            Enrollment.course_id == course_id,
                        )
                    )
                ).scalar_one_or_none()
                if exists:
                    already += 1
                    continue
                if apply:
                    db.add(Enrollment(user_id=user.id, course_id=course_id))
                    enrolled += 1
                else:
                    print(f"  + sẽ ghi danh học viên có sẵn: {row['email']}")
                    enrolled += 1
                continue

            password = row["password"] or generate_password(password_length)
            if apply:
                user = User(
                    email=row["email"],
                    name=row["full_name"],
                    hashed_password=hash_password(password),
                    role=UserRole.student,
                    is_active=True,
                )
                db.add(user)
                await db.flush()
                db.add(Enrollment(user_id=user.id, course_id=course_id))
            created += 1
            enrolled += 1
            credentials.append(
                {
                    "email": row["email"],
                    "full_name": row["full_name"],
                    "password": password,
                    "course_id": str(course_id),
                }
            )
            print(f"  + {'tạo' if apply else 'sẽ tạo'}: {row['email']} — {row['full_name']}")

        if apply:
            await db.commit()

    print("-" * 60)
    print(f"Tạo mới: {created} | Ghi danh: {enrolled} | Đã có sẵn: {already} | Bỏ qua: {skipped} | Lỗi CSV: {len(errors)}")

    if credentials:
        target = out_path or Path(f"class_credentials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
        # File chứa mật khẩu tạm: chỉ ghi khi thực sự tạo tài khoản.
        if apply:
            with target.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["email", "full_name", "password", "course_id"])
                writer.writeheader()
                writer.writerows(credentials)
            print(f"Đã ghi thông tin đăng nhập vào: {target.resolve()}")
            print("Hãy gửi riêng cho từng học viên và xóa tệp sau khi hoàn tất.")
        else:
            print("Chạy thử: không tạo tệp mật khẩu. Thêm --apply để thực thi.")
    return 0 if not errors else 1


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(description="Nhập lớp học từ CSV vào Smart LMS")
    parser.add_argument("--csv", required=True, type=Path, help="Tệp CSV (email, full_name[, password])")
    parser.add_argument("--course-id", required=True, type=int, help="ID khóa học cần ghi danh")
    parser.add_argument("--apply", action="store_true", help="Thực sự ghi vào cơ sở dữ liệu")
    parser.add_argument("--password-length", type=int, default=10, help="Độ dài mật khẩu tạm (mặc định 10)")
    parser.add_argument("--out", type=Path, default=None, help="Tệp CSV chứa thông tin đăng nhập")
    args = parser.parse_args()

    raise SystemExit(
        asyncio.run(
            run(args.csv, args.course_id, args.apply, args.password_length, args.out)
        )
    )


if __name__ == "__main__":
    main()
