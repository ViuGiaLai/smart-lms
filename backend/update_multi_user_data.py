import asyncio
import sys
from decimal import Decimal

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.core.security import hash_password

MASTER_PWD = hash_password("password123")

USERS_CONFIG = [
    {
        "email": "admin@donga.edu.vn",
        "name": "Ban Quản trị Hệ thống",
        "role": UserRole.admin,
    },
    {
        "email": "giangvien@donga.edu.vn",
        "name": "TS. Nguyễn Văn Minh",
        "role": UserRole.instructor,
    },
    {
        "email": "giangvien2@donga.edu.vn",
        "name": "TS. Lê Hoàng Long",
        "role": UserRole.instructor,
    },
    {
        "email": "giangvien3@donga.edu.vn",
        "name": "ThS. Trần Thị Mai Lan",
        "role": UserRole.instructor,
    },
    {
        "email": "giangvien4@donga.edu.vn",
        "name": "ThS. Đỗ Quốc Tuấn",
        "role": UserRole.instructor,
    },
    {
        "email": "sinhvien@donga.edu.vn",
        "name": "Nguyễn Văn An (Sinh viên)",
        "role": UserRole.student,
    },
    {
        "email": "sinhvien2@donga.edu.vn",
        "name": "Lê Thị Thảo My (K23-AI)",
        "role": UserRole.student,
    },
    {
        "email": "hocvien@smartlms.edu.vn",
        "name": "Nguyễn Thanh Phước (ST23D)",
        "role": UserRole.student,
    },
]

async def update_database():
    print("[1/3] Cập nhật danh sách người dùng chuẩn đa tài khoản...")
    user_map = {}
    async with AsyncSessionLocal() as session:
        for u in USERS_CONFIG:
            res = await session.execute(select(User).where(User.email == u["email"]))
            user_obj = res.scalar_one_or_none()
            if not user_obj:
                user_obj = User(
                    email=u["email"],
                    name=u["name"],
                    role=u["role"],
                    hashed_password=MASTER_PWD,
                    is_active=True,
                )
                session.add(user_obj)
                await session.flush()
                print(f" -> Tạo mới: {u['email']} | {u['name']} | {u['role'].value}")
            else:
                user_obj.name = u["name"]
                user_obj.role = u["role"]
                user_obj.is_active = True
                print(f" -> Cập nhật: {u['email']} | {u['name']} | {u['role'].value}")
            user_map[u["email"]] = user_obj.id

        # Cũng chuẩn hóa tài khoản cũ giangvien@smartlms.edu.vn nếu có
        res_old = await session.execute(select(User).where(User.email == "giangvien@smartlms.edu.vn"))
        old_inst = res_old.scalar_one_or_none()
        if old_inst:
            old_inst.name = "TS. Nguyễn Văn Minh"

        await session.commit()

        print("\n[2/3] Phân quyền sở hữu khóa học theo từng Giảng viên độc lập...")
        inst1_id = user_map["giangvien@donga.edu.vn"]
        inst2_id = user_map["giangvien2@donga.edu.vn"]
        inst3_id = user_map["giangvien3@donga.edu.vn"]
        inst4_id = user_map["giangvien4@donga.edu.vn"]

        courses_data = [
            (1, "Lập trình Python Nâng cao & Ứng dụng Trí tuệ Nhân tạo", inst1_id, "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&fit=crop", "Trí tuệ Nhân tạo & Python"),
            (2, "Thiết kế RESTful API Chuẩn Quốc tế với FastAPI & PostgreSQL", inst2_id, "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&fit=crop", "Lập trình Backend"),
            (3, "Xây dựng Ứng dụng Web Hiện đại với Next.js 14 & Tailwind CSS", inst3_id, "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&fit=crop", "Lập trình Frontend"),
            (4, "Kiến trúc Hệ thống Cloud & Triển khai DevOps Thực chiến", inst4_id, "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&fit=crop", "Điện toán Đám mây & DevOps"),
        ]

        for cid, title, iid, thumb, cat in courses_data:
            c_res = await session.execute(select(Course).where(Course.id == cid))
            course = c_res.scalar_one_or_none()
            if course:
                course.title = title
                course.instructor_id = iid
                course.thumbnail = thumb
                course.category = cat
                course.status = CourseStatus.published
                print(f" -> Khóa #{cid}: '{title}' -> Thuộc về Giảng viên ID={iid}")
            else:
                new_c = Course(
                    id=cid,
                    title=title,
                    description=f"Khóa học chuyên sâu {title} theo tiêu chuẩn đại học.",
                    price=Decimal("299000.00") if cid > 1 else Decimal("0.00"),
                    thumbnail=thumb,
                    category=cat,
                    level="intermediate",
                    status=CourseStatus.published,
                    instructor_id=iid,
                )
                session.add(new_c)
                print(f" -> Tạo Khóa #{cid}: '{title}' -> Thuộc về Giảng viên ID={iid}")

        await session.commit()
        print("\n[3/3] Hoàn tất cập nhật đa người dùng & sở hữu khóa học thành công!")

if __name__ == "__main__":
    asyncio.run(update_database())
