import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv("backend/.env")
url = os.getenv("DATABASE_URL")
if url and url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

EDUCATION_LEVELS = [
    {
        "name": "Đại cương (Năm 1 - 2)",
        "code": "GENERAL",
        "description": "Toán giải tích, Xác suất thống kê, Triết học Mác-Lênin, Tiếng Anh tổng quát, Pháp luật đại cương",
        "order_index": 1,
    },
    {
        "name": "Cơ sở ngành (Năm 2 - 3)",
        "code": "FOUNDATION",
        "description": "Lập trình cơ sở, Cấu trúc dữ liệu & Giải thuật, Cơ sở dữ liệu, Kiến trúc máy tính, Nguyên lý kinh tế",
        "order_index": 2,
    },
    {
        "name": "Chuyên ngành (Năm 3 - 4)",
        "code": "MAJOR",
        "description": "Kỹ thuật phần mềm, Trí tuệ nhân tạo, An toàn thông tin, Tài chính doanh nghiệp, Ngôn ngữ chuyên ngành",
        "order_index": 3,
    },
    {
        "name": "Đồ án & Khóa luận tốt nghiệp",
        "code": "CAPSTONE",
        "description": "Đồ án chuyên ngành, Khóa luận tốt nghiệp, Thực tập doanh nghiệp và Seminar nghiên cứu",
        "order_index": 4,
    },
    {
        "name": "Chuẩn đầu ra & Chứng chỉ nghề",
        "code": "CERTIFICATION",
        "description": "Chuẩn đầu ra Ngoại ngữ (TOEIC/IELTS/JLPT/TOPIK), Chuẩn Tin học, Chứng chỉ nghề nghiệp Quốc tế (AWS, Cisco)",
        "order_index": 5,
    },
    {
        "name": "Sau đại học & Nghiên cứu",
        "code": "POSTGRADUATE",
        "description": "Đào tạo Thạc sĩ, Nghiên cứu khoa học sinh viên và Chuyên đề học thuật nâng cao",
        "order_index": 6,
    },
]

# Root groups and child subjects for Dong A University (UDA)
CATEGORY_GROUPS = [
    {
        "name": "Khoa Công nghệ Thông tin",
        "slug": "khoa-cntt",
        "icon": "Cpu",
        "description": "Kỹ thuật phần mềm, Trí tuệ nhân tạo, Khoa học dữ liệu, An toàn thông tin & Mạng máy tính",
        "order_index": 1,
        "children": [
            {"name": "Kỹ thuật Phần mềm", "slug": "ky-thuat-phan-mem", "icon": "Code2", "description": "Lập trình Python, Web Fullstack Next.js/FastAPI, Mobile, DevOps", "order_index": 1},
            {"name": "Trí tuệ Nhân tạo & Data", "slug": "ai-data-science", "icon": "BrainCircuit", "description": "Machine Learning, Deep Learning, NLP, Big Data & pgvector", "order_index": 2},
            {"name": "An toàn Thông tin & Mạng", "slug": "an-toan-thong-tin", "icon": "ShieldCheck", "description": "Bảo mật hệ thống, An ninh mạng, Quản trị mạng máy tính", "order_index": 3},
            {"name": "Cơ sở Dữ liệu & Hệ thống", "slug": "he-thong-thong-tin", "icon": "Database", "description": "PostgreSQL, SQL, Thiết kế hệ thống thông tin, Cloud Computing", "order_index": 4},
        ],
    },
    {
        "name": "Khoa Ngoại ngữ",
        "slug": "khoa-ngoai-ngu",
        "icon": "Languages",
        "description": "Tiếng Anh chuyên ngành, Tiếng Nhật, Tiếng Hàn, Tiếng Trung & Chuẩn đầu ra quốc tế",
        "order_index": 2,
        "children": [
            {"name": "Tiếng Anh Chuyên ngành & TOEIC", "slug": "tieng-anh-chuyen-nganh", "icon": "Languages", "description": "Tiếng Anh CNTT, Kinh tế, Chuẩn đầu ra B1, B2, TOEIC, IELTS", "order_index": 1},
            {"name": "Ngôn ngữ Nhật (IT Japanese)", "slug": "ngon-ngu-nhat", "icon": "Languages", "description": "Tiếng Nhật chuyên ngành CNTT, JLPT N5 - N2, Văn hóa doanh nghiệp Nhật", "order_index": 2},
            {"name": "Ngôn ngữ Hàn Quốc", "slug": "ngon-ngu-han", "icon": "Languages", "description": "Tiếng Hàn giao tiếp, TOPIK 1 - 4, Biên phiên dịch", "order_index": 3},
            {"name": "Ngôn ngữ Trung Quốc", "slug": "ngon-ngu-trung", "icon": "Languages", "description": "Tiếng Trung thương mại, HSK 1 - 5", "order_index": 4},
        ],
    },
    {
        "name": "Khoa Quản trị - Kinh tế",
        "slug": "khoa-kinh-te",
        "icon": "TrendingUp",
        "description": "Quản trị kinh doanh, Tài chính - Kế toán, Thương mại điện tử & Logistics",
        "order_index": 3,
        "children": [
            {"name": "Quản trị Kinh doanh & Marketing", "slug": "quan-tri-kinh-doanh", "icon": "TrendingUp", "description": "Marketing số, Quản trị doanh nghiệp, Quản trị dự án Agile/Scrum", "order_index": 1},
            {"name": "Tài chính - Kế toán", "slug": "tai-chinh-ke-toan", "icon": "DollarSign", "description": "Kế toán tài chính, Báo cáo tài chính, Phân tích đầu tư", "order_index": 2},
            {"name": "Thương mại Điện tử & Logistics", "slug": "e-commerce-logistics", "icon": "Truck", "description": "Chuỗi cung ứng, Vận hành sàn TMĐT, Quản lý kho bãi", "order_index": 3},
        ],
    },
    {
        "name": "Khoa Khoa học Cơ bản & Đại cương",
        "slug": "khoa-dai-cuong",
        "icon": "GraduationCap",
        "description": "Toán cao cấp, Xác suất thống kê, Lý luận chính trị & Pháp luật đại cương",
        "order_index": 4,
        "children": [
            {"name": "Toán cao cấp & Giải tích", "slug": "toan-cao-cap", "icon": "Calculator", "description": "Giải tích 1, Giải tích 2, Đại số tuyến tính", "order_index": 1},
            {"name": "Xác suất Thống kê & Dữ liệu", "slug": "xac-suat-thong-ke", "icon": "Activity", "description": "Lý thuyết xác suất, Thống kê ứng dụng, Phương pháp tính", "order_index": 2},
            {"name": "Pháp luật & Triết học Đại cương", "slug": "phap-luat-triet-hoc", "icon": "BookOpen", "description": "Triết học Mác-Lênin, Pháp luật đại cương, Tư tưởng Hồ Chí Minh", "order_index": 3},
        ],
    },
    {
        "name": "Khoa Kỹ thuật - Tự động hóa",
        "slug": "khoa-ky-thuat",
        "icon": "Atom",
        "description": "Kỹ thuật điện, Tự động hóa, Vi điều khiển & Hệ thống IoT",
        "order_index": 5,
        "children": [
            {"name": "Tự động hóa & IoT", "slug": "tu-dong-hoa-iot", "icon": "Cpu", "description": "Vi điều khiển, Lập trình nhúng, IoT, Cảm biến công nghiệp", "order_index": 1},
            {"name": "Kỹ thuật Điện - Điện tử", "slug": "dien-dien-tu", "icon": "Zap", "description": "Mạch điện tử, Điện tử công suất, Hệ thống truyền động", "order_index": 2},
        ],
    },
    {
        "name": "Kỹ năng Bổ trợ & Hướng nghiệp ĐH Đông Á",
        "slug": "ky-nang-nghe-nghiep-uda",
        "icon": "Briefcase",
        "description": "Kỹ năng mềm sinh viên, Phương pháp nghiên cứu khoa học & Khởi nghiệp",
        "order_index": 6,
        "children": [
            {"name": "Nghiên cứu Khoa học Sinh viên", "slug": "nghien-cuu-khoa-hoc", "icon": "FileText", "description": "Phương pháp NCKH, Viết báo cáo học thuật, Trình bày luận văn", "order_index": 1},
            {"name": "Kỹ năng Mềm & Thuyết trình", "slug": "ky-nang-mem", "icon": "HeartHandshake", "description": "Kỹ năng giao tiếp, Làm việc nhóm, Thuyết trình chuyên nghiệp", "order_index": 2},
            {"name": "Hướng nghiệp & Khởi nghiệp ĐH Đông Á", "slug": "huong-nghiep-khoi-nghiep", "icon": "Sparkles", "description": "Kỹ năng phỏng vấn, Viết CV chuẩn quốc tế, Khởi nghiệp đổi mới sáng tạo", "order_index": 3},
        ],
    },
]

async def seed():
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        print("[SEED] Bắt đầu seed Bậc đào tạo & Khoa chuyên ngành ĐH Đông Á...")

        # 1. Seed Education Levels
        for lvl in EDUCATION_LEVELS:
            await conn.execute(
                text("""
                    INSERT INTO education_levels (name, code, description, order_index, is_active)
                    VALUES (:name, :code, :description, :order_index, true)
                    ON CONFLICT (code) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        order_index = EXCLUDED.order_index,
                        is_active = true
                """),
                lvl
            )
        print(f" -> Đã seed {len(EDUCATION_LEVELS)} bậc đào tạo.")

        # 2. Seed Categories
        for group in CATEGORY_GROUPS:
            res = await conn.execute(
                text("""
                    INSERT INTO learning_categories (name, slug, description, icon, parent_id, order_index, is_active)
                    VALUES (:name, :slug, :description, :icon, NULL, :order_index, true)
                    ON CONFLICT (slug) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        icon = EXCLUDED.icon,
                        order_index = EXCLUDED.order_index,
                        is_active = true
                    RETURNING id
                """),
                {
                    "name": group["name"],
                    "slug": group["slug"],
                    "description": group["description"],
                    "icon": group["icon"],
                    "order_index": group["order_index"],
                }
            )
            root_id = res.fetchone()[0]

            for child in group.get("children", []):
                await conn.execute(
                    text("""
                        INSERT INTO learning_categories (name, slug, description, icon, parent_id, order_index, is_active)
                        VALUES (:name, :slug, :description, :icon, :parent_id, :order_index, true)
                        ON CONFLICT (slug) DO UPDATE
                        SET name = EXCLUDED.name,
                            description = EXCLUDED.description,
                            icon = EXCLUDED.icon,
                            parent_id = EXCLUDED.parent_id,
                            order_index = EXCLUDED.order_index,
                            is_active = true
                    """),
                    {
                        "name": child["name"],
                        "slug": child["slug"],
                        "description": child["description"],
                        "icon": child["icon"],
                        "parent_id": root_id,
                        "order_index": child["order_index"],
                    }
                )
        print(f" -> Đã seed {len(CATEGORY_GROUPS)} khoa và các ngành trực thuộc.")
        print("[SEED] Hoàn tất thành công!")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed())
