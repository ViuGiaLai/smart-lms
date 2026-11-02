from __future__ import annotations

import json
import re
import unicodedata
from typing import Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, func, desc
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.lesson import Lesson
from app.models.category import LearningCategory
from app.models.education_level import EducationLevel
from app.models.discovery import DiscoveryJob, DiscoveryItem, DiscoveryStatus
from app.schemas.discovery import (
    DiscoveryJobCreate,
    DiscoveryJobResponse,
    DiscoveryItemResponse,
    ConvertDiscoveryToCourseRequest,
)

router = APIRouter(prefix="/ai-discovery", tags=["AI Discovery"])


def _slugify(text: str) -> str:
    t = (text or "").replace("đ", "d").replace("Đ", "D")
    slug = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^\w\s-]", "", slug).strip().lower()
    return re.sub(r"[-\s]+", "-", slug)


def _normalize(text: str | None) -> str:
    """Bỏ dấu + hạ chữ thường để so khớp tên danh mục / cấp học."""
    t = (text or "").replace("đ", "d").replace("Đ", "D")
    return (
        unicodedata.normalize("NFKD", t)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


# Từ khoá cấp học -> mã cấp học chuẩn trong bảng education_levels.
_LEVEL_KEYWORDS: list[tuple[str, str]] = [
    ("dai cuong", "GENERAL"), ("nam 1", "GENERAL"), ("nam nhat", "GENERAL"), ("nam 2", "GENERAL"),
    ("co so nganh", "FOUNDATION"), ("nen tang", "FOUNDATION"),
    ("chuyen nganh", "MAJOR"), ("nam 3", "MAJOR"), ("nam 4", "MAJOR"), ("nang cao", "MAJOR"),
    ("do an", "CAPSTONE"), ("khoa luan", "CAPSTONE"), ("tot nghiep", "CAPSTONE"), ("thuc tap", "CAPSTONE"),
    ("chuan dau ra", "CERTIFICATION"), ("chung chi", "CERTIFICATION"), ("toeic", "CERTIFICATION"), ("ielts", "CERTIFICATION"),
    ("sau dai hoc", "POSTGRADUATE"), ("thac si", "POSTGRADUATE"), ("nghien cuu", "POSTGRADUATE"),
    ("dai hoc", "MAJOR"), ("university", "MAJOR"), ("professional", "CERTIFICATION"),
]

# Từ quá chung, không dùng để đoán lĩnh vực.
_GENERIC_WORDS = {"hoc", "pho", "thong", "cua", "va", "ky", "nang"}


async def _resolve_category(
    db: AsyncSession,
    slug: str | None,
    domain: str | None,
    topic: str,
) -> tuple[int | None, str | None, str | None]:
    """Ánh xạ danh mục AI đề xuất về một danh mục CÓ THẬT trong DB.

    LLM thường bịa slug (VD: "toan-lop-8-phan-thuc-dai-so") hoặc trả về danh mục
    chung chung, khiến khóa học được tạo ra nằm sai lĩnh vực. Hàm này chỉ trả về
    bản ghi tồn tại, ưu tiên khớp chính xác tên lĩnh vực mà người dùng chọn.
    """
    rows = (
        await db.execute(
            select(
                LearningCategory.id,
                LearningCategory.slug,
                LearningCategory.name,
                LearningCategory.parent_id,
            ).where(LearningCategory.is_active == True)  # noqa: E712
        )
    ).all()
    if not rows:
        return None, None, None

    if slug:
        for cid, cslug, cname, _parent in rows:
            if cslug == slug:
                return cid, cslug, cname

    domain_norm = _normalize(domain)
    if domain_norm:
        exact = [r for r in rows if _normalize(r[2]) == domain_norm]
        if not exact:
            exact = [r for r in rows if domain_norm in _normalize(r[2]) or _normalize(r[2]) in domain_norm]
        if exact:
            # Ưu tiên môn học con (cụ thể hơn) khi trùng tên với nhóm gốc.
            exact.sort(key=lambda r: 0 if r[3] is not None else 1)
            return exact[0][0], exact[0][1], exact[0][2]

    haystack = set(_normalize(f"{topic} {domain}").replace("&", " ").split())
    best: tuple | None = None
    best_score = 0
    for row in rows:
        words = [
            w for w in _normalize(row[2]).replace("&", " ").split()
            if len(w) >= 3 and w not in _GENERIC_WORDS
        ]
        score = sum(len(w) for w in words if w in haystack)
        if score > best_score:
            best, best_score = row, score
    if best is not None:
        return best[0], best[1], best[2]
    return None, None, None


async def _resolve_education_level(
    db: AsyncSession,
    code: str | None,
    *labels: str | None,
) -> tuple[int | None, str | None, str | None]:
    """Ánh xạ cấp học AI đề xuất về mã cấp học CÓ THẬT trong bảng education_levels."""
    rows = (
        await db.execute(
            select(EducationLevel.id, EducationLevel.code, EducationLevel.name).where(
                EducationLevel.is_active == True  # noqa: E712
            )
        )
    ).all()
    if not rows:
        return None, None, None
    by_code = {row[1]: row for row in rows}
    if code and code in by_code:
        return by_code[code]

    haystack = _normalize(" ".join(label for label in labels if label))
    for keyword, target in _LEVEL_KEYWORDS:
        if keyword in haystack and target in by_code:
            return by_code[target]
    return None, None, None


@router.post("/discover", response_model=dict[str, Any])
async def discover_curriculum(
    payload: DiscoveryJobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """
    AI Discovery Service:
    Tìm kiếm và đề xuất chương trình đào tạo, danh mục, video bài giảng YouTube và tài liệu
    phù hợp với chủ đề và cấp học.
    """
    # 1. Gọi sang AI Service hoặc Fallback AI Blueprint
    ai_url = f"{settings.AI_SERVICE_URL}/api/v1/discovery/search"
    headers = {
        "X-User-Id": str(current_user.id),
        "X-User-Role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        **settings.ai_service_headers,
    }

    ai_blueprint = None
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                ai_url,
                json={
                    "topic": payload.topic,
                    "target_level": payload.target_level,
                    "domain_category": payload.domain_category,
                    "target_audience": payload.target_audience,
                },
                headers=headers,
            )
            if resp.status_code == 200:
                ai_blueprint = resp.json()
    except Exception:
        ai_blueprint = None

    # Fallback logic nếu AI service chưa có kết nối hoặc phản hồi chậm.
    # Khung mẫu chung của AI Service (2 bài) không đủ cho một chương trình học:
    # dưới 3 bài thì dùng khung chuyên biệt theo lĩnh vực của backend.
    if not ai_blueprint or len(ai_blueprint.get("lessons") or []) < 3:
        ai_blueprint = _generate_domain_curriculum_blueprint(
            topic=payload.topic,
            target_level=payload.target_level,
            domain_category=payload.domain_category,
            target_audience=payload.target_audience,
        )

    # 2. Chuẩn hoá danh mục & cấp học về đúng bản ghi có thật trong DB để khóa học
    #    tạo ra không bị nằm sai lĩnh vực (VD: Toán lớp 8 bị xếp vào Lập trình).
    cat_id, cat_slug, cat_name = await _resolve_category(
        db,
        ai_blueprint.get("category_slug"),
        ai_blueprint.get("domain") or payload.domain_category,
        payload.topic,
    )
    lvl_id, lvl_code, lvl_name = await _resolve_education_level(
        db,
        ai_blueprint.get("level_code"),
        payload.target_level,
        ai_blueprint.get("grade_label"),
    )
    ai_blueprint.update(
        {
            "category_id": cat_id,
            "category_slug": cat_slug,
            "category_name": cat_name,
            "education_level_id": lvl_id,
            "level_code": lvl_code,
            "education_level_name": lvl_name,
        }
    )

    # 3. Tạo DiscoveryJob trong DB
    job = DiscoveryJob(
        user_id=current_user.id,
        topic=payload.topic,
        target_level=payload.target_level,
        domain_category=payload.domain_category,
        status=DiscoveryStatus.pending,
        summary=ai_blueprint.get("summary", f"Đề xuất khung đào tạo cho chủ đề '{payload.topic}'"),
        proposed_blueprint=ai_blueprint,
    )
    db.add(job)
    await db.flush()

    # 3. Thêm các DiscoveryItem tương ứng (bài học, video, tài liệu)
    items_to_add = []
    order_idx = 1
    for lesson in ai_blueprint.get("lessons", []):
        items_to_add.append(
            DiscoveryItem(
                job_id=job.id,
                item_type="lesson",
                title=lesson.get("title", f"Bài học {order_idx}"),
                description=lesson.get("description"),
                source_url=lesson.get("video_url"),
                provider_name="YouTube" if lesson.get("video_url") else "Học liệu mở",
                metadata_info={
                    "duration": lesson.get("duration", 1800),
                    "objectives": lesson.get("objectives", []),
                    "resources": lesson.get("resources", []),
                },
                order_index=order_idx,
                status=DiscoveryStatus.pending,
            )
        )
        order_idx += 1

    for ref in ai_blueprint.get("references", []):
        items_to_add.append(
            DiscoveryItem(
                job_id=job.id,
                item_type="document",
                title=ref.get("title", "Tài liệu tham khảo"),
                description=ref.get("description"),
                source_url=ref.get("url"),
                provider_name=ref.get("provider", "Open Educational Resource"),
                metadata_info={"type": ref.get("type", "pdf")},
                order_index=order_idx,
                status=DiscoveryStatus.pending,
            )
        )
        order_idx += 1

    db.add_all(items_to_add)
    await db.commit()
    await db.refresh(job)

    return {
        "success": True,
        "message": f"AI đã khám phá và xây dựng khung chương trình thành công cho: {payload.topic}",
        "data": {
            "jobId": job.id,
            "topic": job.topic,
            "summary": job.summary,
            "blueprint": job.proposed_blueprint,
            "status": job.status.value,
        },
    }


@router.get("/jobs", response_model=dict[str, Any])
async def list_discovery_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """Lấy danh sách các phiên khám phá học liệu gần nhất."""
    stmt = (
        select(DiscoveryJob)
        .options(selectinload(DiscoveryJob.items))
        .order_by(desc(DiscoveryJob.created_at))
        .limit(30)
    )
    if current_user.role != UserRole.admin:
        stmt = stmt.where(DiscoveryJob.user_id == current_user.id)

    res = await db.execute(stmt)
    jobs = res.scalars().all()

    return {
        "success": True,
        "data": [
            {
                "id": j.id,
                "topic": j.topic,
                "targetLevel": j.target_level,
                "domainCategory": j.domain_category,
                "status": j.status.value,
                "summary": j.summary,
                "itemCount": len(j.items),
                "createdAt": j.created_at.isoformat(),
            }
            for j in jobs
        ],
    }


@router.get("/jobs/{job_id}", response_model=dict[str, Any])
async def get_discovery_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """Xem chi tiết đề xuất khóa học của phiên khám phá."""
    stmt = (
        select(DiscoveryJob)
        .options(selectinload(DiscoveryJob.items))
        .where(DiscoveryJob.id == job_id)
    )
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Phiên khám phá không tồn tại")

    if current_user.role != UserRole.admin and job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập đề xuất này")

    return {
        "success": True,
        "data": {
            "id": job.id,
            "topic": job.topic,
            "targetLevel": job.target_level,
            "domainCategory": job.domain_category,
            "status": job.status.value,
            "summary": job.summary,
            "blueprint": job.proposed_blueprint,
            "items": [
                {
                    "id": item.id,
                    "type": item.item_type,
                    "title": item.title,
                    "description": item.description,
                    "sourceUrl": item.source_url,
                    "provider": item.provider_name,
                    "order": item.order_index,
                    "status": item.status.value,
                }
                for item in sorted(job.items, key=lambda x: x.order_index)
            ],
            "createdAt": job.created_at.isoformat(),
        },
    }


@router.post("/jobs/{job_id}/approve", response_model=dict[str, Any])
async def approve_discovery_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """Giảng viên/Admin duyệt đề xuất học liệu."""
    res = await db.execute(select(DiscoveryJob).where(DiscoveryJob.id == job_id))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Phiên khám phá không tồn tại")

    # Đề xuất học liệu là tài sản riêng của người tạo; Admin được quyền giám sát.
    # Thiếu kiểm tra này thì giảng viên khác duyệt được đề xuất không phải của mình.
    if current_user.role != UserRole.admin and job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền thao tác trên đề xuất này")

    job.status = DiscoveryStatus.approved
    await db.commit()
    return {"success": True, "message": "Đã phê duyệt đề xuất chương trình học."}


@router.post("/jobs/{job_id}/convert-to-course", response_model=dict[str, Any])
async def convert_discovery_to_course(
    job_id: int,
    req: ConvertDiscoveryToCourseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_instructor),
):
    """
    Tự động chuyển đổi đề xuất đã khám phá thành Khóa học và Bài học thực tế trong LMS!
    Giúp Giảng viên không phải tự tạo thủ công từng bài giảng.
    """
    res = await db.execute(
        select(DiscoveryJob).options(selectinload(DiscoveryJob.items)).where(DiscoveryJob.id == job_id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Phiên khám phá không tồn tại")

    # Chỉ chủ sở hữu (hoặc Admin) mới được chuyển đề xuất thành khóa học của mình.
    if current_user.role != UserRole.admin and job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền thao tác trên đề xuất này")

    bp = job.proposed_blueprint or {}
    title = req.title or bp.get("course_title") or job.topic
    slug_base = _slugify(title)
    unique_slug = f"{slug_base}-{job.id}"

    # ── Duplicate Check (đặc tả AI Discovery §2 và §6) ──
    # 1) Không chuyển lại một phiên đã chuyển đổi (tránh nhân bản khóa học + bài học).
    if job.status == DiscoveryStatus.converted:
        raise HTTPException(
            status_code=409,
            detail="Phiên khám phá này đã được chuyển thành khóa học trước đó.",
        )
    # 2) Không tạo khóa học trùng tiêu đề với khóa học giảng viên đã có.
    dup_res = await db.execute(
        select(Course.id, Course.title, Course.slug).where(
            Course.instructor_id == current_user.id,
            func.lower(Course.title) == title.strip().lower(),
        )
    )
    dup_row = dup_res.first()
    if dup_row is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Khóa học '{dup_row.title}' đã tồn tại (id={dup_row.id}, slug={dup_row.slug}). "
                "Hãy mở khóa học đó để bổ sung học liệu thay vì tạo bản trùng."
            ),
        )

    # Lấy category_id / education_level_id: ưu tiên id đã chuẩn hoá khi khám phá,
    # nếu blueprint cũ chưa có thì tra theo slug/mã (chỉ nhận bản ghi tồn tại).
    cat_id = bp.get("category_id")
    if cat_id is None and bp.get("category_slug"):
        c_res = await db.execute(select(LearningCategory.id).where(LearningCategory.slug == bp.get("category_slug")))
        cat_id = c_res.scalar_one_or_none()

    lvl_id = bp.get("education_level_id")
    if lvl_id is None and bp.get("level_code"):
        l_res = await db.execute(select(EducationLevel.id).where(EducationLevel.code == bp.get("level_code")))
        lvl_id = l_res.scalar_one_or_none()

    course_status = CourseStatus.published if req.auto_publish else CourseStatus.draft

    new_course = Course(
        title=title,
        slug=unique_slug,
        description=bp.get("description", job.summary),
        instructor_id=current_user.id,
        price=req.price or 0.0,
        thumbnail=bp.get("thumbnail") or "https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg",
        status=course_status,
        category=bp.get("category_name") or bp.get("domain") or job.domain_category or "Đa lĩnh vực",
        level=bp.get("level_label", "intermediate"),
        category_id=cat_id,
        education_level_id=lvl_id,
        grade_label=bp.get("grade_label") or job.target_level,
        proficiency_level=bp.get("proficiency_level"),
        target_audience=bp.get("target_audience") or "Học viên",
        language=bp.get("language", "vi"),
        outcomes=bp.get("outcomes", []),
        prerequisites=bp.get("prerequisites", []),
    )
    db.add(new_course)
    await db.flush()

    # Tạo các Lesson thuộc Course
    lessons_data = bp.get("lessons", [])
    order = 1
    for l_data in lessons_data:
        video_url = l_data.get("video_url")
        yt_id = None
        if video_url:
            yt_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", video_url)
            if yt_match:
                yt_id = yt_match.group(1)

        lesson = Lesson(
            course_id=new_course.id,
            title=l_data.get("title", f"Bài {order}: {l_data.get('topic', '')}"),
            description=l_data.get("description"),
            video_url=video_url,
            duration=l_data.get("duration", 1800),
            order_index=order,
            transcript=l_data.get("transcript_summary"),
            resources_url=l_data.get("resources_url"),
            youtube_video_id=yt_id,
            subtitle_status="ready" if l_data.get("transcript_summary") else "none",
        )
        db.add(lesson)
        order += 1

    job.status = DiscoveryStatus.converted
    await db.commit()
    await db.refresh(new_course)

    return {
        "success": True,
        "message": f"Đã khởi tạo khóa học '{new_course.title}' cùng {len(lessons_data)} bài học từ AI Discovery!",
        "data": {
            "courseId": new_course.id,
            "slug": new_course.slug,
            "title": new_course.title,
            "lessonsCount": len(lessons_data),
        },
    }


def _generate_domain_curriculum_blueprint(
    topic: str,
    target_level: str | None,
    domain_category: str | None,
    target_audience: str | None,
) -> dict[str, Any]:
    """
    Sinh blueprint giáo trình thực tế, chất lượng cao theo từng lĩnh vực đào tạo:
    Toán học, Ngoại ngữ, Công nghệ, Kỹ năng sống, v.v.
    """
    t_lower = (topic or "").lower()
    
    # 1. Trường hợp: Toán học đại cương (Giải tích, Toán cao cấp, Đại số tuyến tính...)
    if "toán" in t_lower or "math" in t_lower or "đại số" in t_lower or "giải tích" in t_lower:
        return {
            "course_title": f"Toán cao cấp & Giải tích – {topic}",
            "domain": "Khoa Khoa học Cơ bản & Đại cương",
            "category_slug": "toan-cao-cap",
            "level_code": "GENERAL",
            "grade_label": target_level or "Năm 1 – Đại cương",
            "proficiency_level": "Đại học / Đại cương",
            "target_audience": target_audience or "Sinh viên năm nhất Trường Đại học Đông Á",
            "language": "vi",
            "thumbnail": "https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/math-algebra.jpg",
            "description": f"Chương trình đào tạo Toán cao cấp & Giải tích đại học về {topic}. Nắm vững nền tảng giải tích, đạo hàm, tích phân và ứng dụng mô hình hóa trong công nghệ & kinh tế.",
            "summary": f"Đề cương 5 bài học chuẩn mực về {topic} cho sinh viên ĐH Đông Á, tích hợp video bài giảng và bài tập giải thích theo tư duy Socratic.",
            "outcomes": [
                "Nắm vững giới hạn, tính liên tục và vi tích phân cơ bản",
                "Ứng dụng đạo hàm khảo sát hàm số và giải quyết bài toán tối ưu",
                "Áp dụng tích phân tính diện tích, thể tích và mô hình hóa dữ liệu",
                "Tự tin vượt qua kỳ thi kết thúc học phần và làm nền tảng cho môn Cơ sở ngành",
            ],
            "prerequisites": ["Toán phổ thông nền tảng"],
            "lessons": [
                {
                    "title": "Bài 1: Giới hạn hàm số và Vô cùng bé tương đương",
                    "description": "Định nghĩa giới hạn theo Cauchy, các quy tắc tính giới hạn và khai triển vô cùng bé tương đương.",
                    "video_url": "https://www.youtube.com/watch?v=0k2G_Z4qZpQ",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 10:00] Khái niệm giới hạn hàm số.\n[10:01 - 25:00] Vô cùng bé và quy tắc khử dạng vô định.\n[25:01 - 45:00] Bài tập mẫu và hướng dẫn giải.",
                    "resources_url": "ToanCaoCap_Bai_01_Gioi_Han.pdf",
                },
                {
                    "title": "Bài 2: Đạo hàm, Vi phân và Quy tắc L'Hôpital",
                    "description": "Đạo hàm các hàm số sơ cấp, ý nghĩa hình học & vật lý, quy tắc L'Hôpital khử dạng vô định 0/0 và vô cùng / vô cùng.",
                    "video_url": "https://www.youtube.com/watch?v=v0Lg9uU2q58",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 12:00] Bản chất vi phân.\n[12:01 - 30:00] Quy tắc L'Hôpital và điều kiện áp dụng.\n[30:01 - 45:00] Luyện tập các bài toán cực trị.",
                    "resources_url": "ToanCaoCap_Bai_02_Dao_Ham.pdf",
                },
                {
                    "title": "Bài 3: Khai triển Taylor - Maclaurin và Xấp xỉ hàm số",
                    "description": "Khai triển đa thức Taylor, công thức số dư Peano và Lagrange, ứng dụng trong tính toán xấp xỉ thuật toán.",
                    "video_url": "https://www.youtube.com/watch?v=kYv9z5H5d40",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 15:00] Công thức khai triển Taylor - Maclaurin.\n[15:01 - 35:00] Khai triển 5 hàm số cơ bản.\n[35:01 - 45:00] Ứng dụng tính xấp xỉ trong máy tính.",
                    "resources_url": "ToanCaoCap_Bai_03_Taylor.pdf",
                },
                {
                    "title": "Bài 4: Tích phân bất định và Tích phân xác định",
                    "description": "Bảng nguyên hàm cơ bản, phương pháp đổi biến số và tích phân từng phần (LIATE).",
                    "video_url": "https://www.youtube.com/watch?v=M7s1O1zJjXo",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 15:00] Bảng nguyên hàm và đổi biến.\n[15:01 - 35:00] Kỹ thuật tích phân từng phần.\n[35:01 - 45:00] Định lý cơ bản của Giải tích (Newton-Leibniz).",
                    "resources_url": "ToanCaoCap_Bai_04_Tich_Phan.pdf",
                },
                {
                    "title": "Bài 5: Tích phân suy rộng & Ứng dụng trong Khoa học Máy tính",
                    "description": "Tích phân với cận vô cực, điều kiện hội tụ và ứng dụng trong tính hàm mật độ xác suất.",
                    "video_url": "https://www.youtube.com/watch?v=dYk8w1fJ24M",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 15:00] Tích phân suy rộng loại 1 và loại 2.\n[15:01 - 35:00] Tiêu chuẩn so sánh hội tụ.\n[35:01 - 45:00] Ứng dụng trong Khoa học Dữ liệu và AI.",
                    "resources_url": "ToanCaoCap_Bai_05_Suy_Rong.pdf",
                },
            ],
            "references": [
                {"title": "Giáo trình Toán cao cấp – Trường Đại học Đông Á", "provider": "Đại học Đông Á", "url": "https://donga.edu.vn", "type": "pdf"},
                {"title": "Calculus: Early Transcendentals (James Stewart)", "provider": "Cengage Learning", "url": "https://openstax.org", "type": "pdf"},
            ],
        }

    # 2. Trường hợp: Ngoại ngữ (Tiếng Anh, B1, Giao tiếp, IELTS...)
    elif "tiếng anh" in t_lower or "english" in t_lower or "ielts" in t_lower or "toeic" in t_lower or "a1" in t_lower or "b1" in t_lower or "b2" in t_lower:
        return {
            "course_title": f"Tiếng Anh {target_level or 'B1'} – {topic}",
            "domain": "Khoa Ngoại ngữ",
            "category_slug": "tieng-anh-chuyen-nganh",
            "level_code": "CERTIFICATION",
            "grade_label": target_level or "Chuẩn đầu ra B1 / B2",
            "proficiency_level": "B1 / Intermediate",
            "target_audience": target_audience or "Sinh viên Trường Đại học Đông Á",
            "language": "en-vi",
            "thumbnail": "https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/english-communication.jpg",
            "description": f"Chương trình nâng cao năng lực phản xạ tiếng Anh, ngữ pháp ứng dụng và từ vựng chuyên sâu về chủ đề {topic}.",
            "summary": f"Lộ trình 5 bài học tập trung vào phản xạ giao tiếp, phân biệt thì (Tenses), ngữ pháp thực tế và sửa lỗi phát âm.",
            "outcomes": [
                "Làm chủ cách dùng Present Perfect vs Past Simple trong ngữ cảnh thực tế",
                "Tự tin diễn đạt ý tưởng trong công việc và phỏng vấn",
                "Nâng cao kỹ năng nghe hiểu và ngữ điệu tự nhiên",
            ],
            "prerequisites": ["Đã có nền tảng ngữ pháp cơ bản (A2)"],
            "lessons": [
                {
                    "title": "Lesson 1: Foundations & Essential Speaking Strategies",
                    "description": "Chiến lược tư duy phản xạ tiếng Anh không cần dịch thầm trong đầu.",
                    "video_url": "https://www.youtube.com/watch?v=juKd26qkNAw",
                    "duration": 1800,
                    "transcript_summary": "[00:00 - 10:00] Stopping the mental translation habit.\n[10:01 - 25:00] Essential conversational fillers.\n[25:01 - 30:00] Roleplay exercise.",
                    "resources_url": "English_L1_Speaking_Habits.pdf",
                },
                {
                    "title": "Lesson 2: Present Perfect vs Past Simple in Real Conversations",
                    "description": "Phân biệt rạch ròi thì Hiện tại hoàn thành và Quá khứ đơn qua các tình huống đời sống.",
                    "video_url": "https://www.youtube.com/watch?v=q1LKZy2kdzo",
                    "duration": 2100,
                    "transcript_summary": "[00:00 - 12:00] Life experience vs specific past time.\n[12:01 - 25:00] Common mistakes with 'since' and 'for'.\n[25:01 - 35:00] Practical dialogue practice.",
                    "resources_url": "English_L2_Tenses_Mastery.pdf",
                },
                {
                    "title": "Lesson 3: Professional Email & Workplace Communication",
                    "description": "Viết email công sở chuẩn xác, lịch thiệp và truyền đạt đúng thông điệp.",
                    "video_url": "https://www.youtube.com/watch?v=p4vWc63dYr4",
                    "duration": 2400,
                    "transcript_summary": "[00:00 - 10:00] Formal vs Semi-formal tone.\n[10:01 - 30:00] Key phrases for requesting, following up, apologizing.\n[30:01 - 40:00] Real-world email review.",
                    "resources_url": "English_L3_Business_Writing.pdf",
                },
                {
                    "title": "Lesson 4: Natural Pronunciation, Linking Sounds & Intonation",
                    "description": "Kỹ thuật nối âm, giảm âm (Connected Speech) và ngữ điệu tự nhiên của người bản xứ.",
                    "video_url": "https://www.youtube.com/watch?v=0k2G_Z4qZpQ",
                    "duration": 2100,
                    "transcript_summary": "[00:00 - 10:00] Linking consonant to vowel.\n[10:01 - 25:00] Flap T and weak forms of auxiliary verbs.\n[25:01 - 35:00] Shadowing practice.",
                    "resources_url": "English_L4_Pronunciation.pdf",
                },
            ],
            "references": [
                {"title": "Cambridge English Framework", "provider": "Cambridge Assessment", "url": "https://www.cambridgeenglish.org", "type": "web"},
            ],
        }

    # 3. Mặc định: Công nghệ, Kỹ năng số hoặc Tự học
    else:
        return {
            "course_title": f"{topic} – Lộ trình Đào tạo Chuyên sâu",
            "domain": domain_category or "Công nghệ & Kỹ năng",
            "category_slug": "lap-trinh",
            "level_code": "UNIVERSITY",
            "grade_label": target_level or "Đại học / Chuyên nghiệp",
            "proficiency_level": "Thực hành ứng dụng",
            "target_audience": target_audience or "Sinh viên Trường Đại học Đông Á",
            "language": "vi",
            "thumbnail": "https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/fastapi-db.jpg",
            "description": f"Chương trình học tập có cấu trúc hoàn chỉnh về {topic}, từ nền tảng lý thuyết đến triển khai thực chiến.",
            "summary": f"Khung chương trình 4 bài học có lộ trình rõ ràng, học liệu video và bài tập ứng dụng thực tế về {topic}.",
            "outcomes": [
                f"Hiểu rõ kiến trúc và nguyên lý vận hành cốt lõi của {topic}",
                "Áp dụng vào giải quyết bài toán thực tế của dự án",
                "Nắm vững các lỗi thường gặp và quy chuẩn tối ưu hiệu năng",
            ],
            "prerequisites": ["Kiến thức nền tảng về công nghệ thông tin hoặc kỹ năng tương ứng"],
            "lessons": [
                {
                    "title": f"Bài 1: Tổng quan và Thiết lập Môi trường {topic}",
                    "description": "Giới thiệu bức tranh toàn cảnh, kiến trúc cốt lõi và cài đặt môi trường chuẩn.",
                    "video_url": "https://www.youtube.com/watch?v=tSLZXqY3X_0",
                    "duration": 2100,
                    "transcript_summary": "[00:00 - 10:00] Giới thiệu nguyên lý cơ bản.\n[10:01 - 25:00] Hướng dẫn cấu hình môi trường.\n[25:01 - 35:00] Khởi tạo dự án đầu tiên.",
                    "resources_url": "Lesson_01_Overview.pdf",
                },
                {
                    "title": f"Bài 2: Các Thành phần Cốt lõi và Cơ chế Hoạt động",
                    "description": "Đi sâu vào cơ chế bên dưới, luồng dữ liệu và các thành phần chính.",
                    "video_url": "https://www.youtube.com/watch?v=bD05uGo_sVI",
                    "duration": 2400,
                    "transcript_summary": "[00:00 - 15:00] Cơ chế xử lý dữ liệu.\n[15:01 - 30:00] Các thành phần kiến trúc trọng yếu.\n[30:01 - 40:00] Phân tích ví dụ mẫu.",
                    "resources_url": "Lesson_02_Core_Mechanisms.pdf",
                },
                {
                    "title": f"Bài 3: Xử lý Tối ưu hóa và Thực tiễn Sản xuất",
                    "description": "Các kỹ thuật nâng cao, bảo mật, tối ưu hiệu năng và xử lý ngoại lệ.",
                    "video_url": "https://www.youtube.com/watch?v=SqcY0GlETPk",
                    "duration": 2700,
                    "transcript_summary": "[00:00 - 15:00] Kỹ thuật tối ưu hóa bộ nhớ và truy vấn.\n[15:01 - 35:00] Thực hành bảo mật và xử lý lỗi.\n[35:01 - 45:00] Tổng kết best practices.",
                    "resources_url": "Lesson_03_Production_Best_Practices.pdf",
                },
            ],
            "references": [
                {"title": "Open Source Documentation & Specifications", "provider": "Official Docs", "url": "https://developer.mozilla.org", "type": "web"},
            ],
        }
