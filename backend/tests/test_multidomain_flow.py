"""Kiểm thử tích hợp cho Đa lĩnh vực, AI Discovery và Topic Mastery.

Bộ test này chạy trên một backend ĐANG HOẠT ĐỘNG (mặc định http://127.0.0.1:8000)
vì cần stream SSE và kiểm tra đúng hành vi HTTP thật:

    cd backend
    ./venv/Scripts/activate
    pytest tests/ -v

- Nếu backend chưa chạy: toàn bộ module được SKIP (không báo fail giả).
- Mọi dữ liệu test (người dùng, danh mục, cấp học, khóa học, phiên discovery)
  đều được TỰ ĐỘNG XÓA sau khi chạy, kể cả khi test thất bại.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.models.course import CourseStatus  # noqa: F401  (import để chắc chắn app load được)

BASE_URL = os.environ.get("SMART_LMS_API_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api/v1"
PASSWORD = "VerifyPass123!"
SUFFIX = uuid.uuid4().hex[:8]


def _api_available() -> bool:
    try:
        with httpx.Client(timeout=5.0) as client:
            return client.get(f"{BASE_URL}/health").status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _api_available(),
    reason=f"Backend chưa chạy tại {BASE_URL}. Hãy khởi động uvicorn trước khi chạy test tích hợp.",
)


async def _sql(stmt: str, **params):
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(stmt), params)
            # INSERT/UPDATE/DELETE không trả row: đọc .all() sẽ ném ResourceClosedError.
            if not result.returns_rows:
                return []
            return result.all()
    finally:
        await engine.dispose()


def sql(stmt: str, **params):
    return asyncio.run(_sql(stmt, **params))


def _create_user(tag: str, role: str) -> str:
    email = f"pytest_{tag}_{SUFFIX}@example.com"
    sql(
        "INSERT INTO users (email, name, role, hashed_password, is_active) "
        "VALUES (:e, :n, CAST(:r AS userrole), :p, true)",
        e=email,
        n=f"Pytest {tag}",
        r=role,
        p=hash_password(PASSWORD),
    )
    return email


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=180.0) as c:
        yield c


@pytest.fixture(scope="module")
def ctx(client):
    """Tạo tài khoản theo vai trò + dọn dẹp toàn bộ dữ liệu test sau khi chạy xong."""
    created = {"users": [], "categories": [], "levels": [], "course": None, "job": None}
    for tag, role in (("student", "student"), ("instructor", "instructor"), ("other", "instructor"), ("admin", "admin")):
        created["users"].append(_create_user(tag, role))

    def login(email: str) -> str:
        for attempt in range(3):
            resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
            if resp.status_code == 200:
                return resp.json()["data"]["accessToken"]
            if resp.status_code == 429 and attempt < 2:  # rate limit đăng nhập
                time.sleep(20)
                continue
            raise AssertionError(f"Không đăng nhập được {email}: {resp.status_code} {resp.text[:200]}")
        raise AssertionError("login failed")

    data = {
        "student": login(created["users"][0]),
        "instructor": login(created["users"][1]),
        "other": login(created["users"][2]),
        "admin": login(created["users"][3]),
        # Sổ ghi id cần dọn dẹp (không phải token) để các test đánh dấu dữ liệu đã tạo.
        "_created": created,
    }
    yield data

    # ── Dọn dẹp ──
    if created["course"]:
        sql("DELETE FROM courses WHERE id = :c", c=created["course"])
    if created["job"]:
        sql("DELETE FROM discovery_jobs WHERE id = :j", j=created["job"])
    if created["categories"]:
        sql("DELETE FROM learning_categories WHERE id = ANY(:ids)", ids=created["categories"])
    if created["levels"]:
        sql("DELETE FROM education_levels WHERE code = ANY(:codes)", codes=created["levels"])
    sql("DELETE FROM users WHERE email = ANY(:emails)", emails=created["users"])


@pytest.fixture(scope="module")
def auth(ctx):
    return {
        role: {"Authorization": f"Bearer {token}"}
        for role, token in ctx.items()
        if role in ("student", "instructor", "other", "admin")
    }


@pytest.fixture(scope="module")
def tracked(ctx):
    """Sổ ghi id dữ liệu test để fixture `ctx` dọn dẹp sau khi chạy."""
    return ctx["_created"]


# ══════════════════ Danh mục & Cấp học ══════════════════

def test_public_categories_tree(client):
    resp = client.get(f"{API}/categories")
    assert resp.status_code == 200, resp.text
    tree = resp.json()["data"]["tree"]
    flat = resp.json()["data"]["flat"]
    assert tree, "Cây danh mục rỗng"
    assert len(flat) >= len(tree)
    assert any(node["children"] for node in tree), "Không có quan hệ cha-con"


def test_public_education_levels_seeded(client):
    resp = client.get(f"{API}/education-levels")
    assert resp.status_code == 200
    codes = {level["code"] for level in resp.json()["data"]}
    assert {
        "GENERAL", "FOUNDATION", "MAJOR",
        "CAPSTONE", "CERTIFICATION", "POSTGRADUATE",
    } <= codes


@pytest.mark.parametrize("role", ["student", "instructor"])
def test_non_admin_cannot_manage_categories(client, auth, role):
    resp = client.post(f"{API}/admin/categories", json={"name": f"Pytest Forbidden {SUFFIX}"}, headers=auth[role])
    assert resp.status_code == 403, resp.text


def test_admin_category_crud_and_slug_dedupe(client, auth, tracked):
    ids = []
    for _ in range(2):
        resp = client.post(
            f"{API}/admin/categories",
            json={"name": f"Pytest Math {SUFFIX}", "description": "test"},
            headers=auth["admin"],
        )
        assert resp.status_code == 201, resp.text
        ids.append(resp.json()["data"]["id"])
    tracked["categories"].extend(ids)
    slugs = [row[0] for row in sql("SELECT slug FROM learning_categories WHERE id = ANY(:ids) ORDER BY id", ids=ids)]
    assert len(set(slugs)) == 2, f"Slug bị trùng: {slugs}"

    child = client.post(
        f"{API}/admin/categories",
        json={"name": f"Pytest Algebra {SUFFIX}", "parent_id": ids[0]},
        headers=auth["admin"],
    )
    assert child.status_code == 201, child.text
    tracked["categories"].append(child.json()["data"]["id"])

    off = client.put(f"{API}/admin/categories/{ids[0]}", json={"is_active": False}, headers=auth["admin"])
    assert off.status_code == 200 and off.json()["data"]["isActive"] is False
    on = client.put(f"{API}/admin/categories/{ids[0]}", json={"is_active": True}, headers=auth["admin"])
    assert on.status_code == 200 and on.json()["data"]["isActive"] is True

    self_parent = client.put(f"{API}/admin/categories/{ids[0]}", json={"parent_id": ids[0]}, headers=auth["admin"])
    assert self_parent.status_code == 400, "Phải chặn danh mục tự làm cha của chính nó"


def test_admin_education_level_duplicate_code(client, auth, tracked):
    code = f"PYTEST_{SUFFIX}".upper()
    first = client.post(f"{API}/admin/education-levels", json={"name": "Pytest Level", "code": code}, headers=auth["admin"])
    assert first.status_code == 201, first.text
    tracked["levels"].append(code)

    # Cùng mã nhưng khác hoa/thường phải bị chặn ở tầng API (400), không phải lỗi 500 của DB.
    dup = client.post(f"{API}/admin/education-levels", json={"name": "Pytest Level 2", "code": code.lower()}, headers=auth["admin"])
    assert dup.status_code == 400, dup.text


# ══════════════════ Lọc khóa học đa chiều ══════════════════

def test_course_filters_respected(client):
    resp = client.get(f"{API}/courses", params={"education_level_id": 4, "limit": 50})
    assert resp.status_code == 200, resp.text
    for course in resp.json()["data"]:
        assert course["educationLevelId"] == 4

    resp = client.get(f"{API}/courses", params={"target_audience": "Sinh viên", "limit": 50})
    assert resp.status_code == 200
    for course in resp.json()["data"]:
        assert "sinh viên" in (course.get("targetAudience") or "").lower()


# ══════════════════ AI Discovery → Khóa học thật ══════════════════

@pytest.fixture(scope="module")
def discovery(client, auth, tracked):
    """Chạy 1 phiên discovery dùng chung cho các test phía sau."""
    resp = client.post(
        f"{API}/ai-discovery/discover",
        json={
            "topic": f"Toán cao cấp & Giải tích ({SUFFIX})",
            "target_level": "Đại cương",
            "domain_category": "Khoa Khoa học Cơ bản & Đại cương",
            "target_audience": "Sinh viên năm nhất Trường Đại học Đông Á",
        },
        headers=auth["instructor"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()["data"]
    tracked["job"] = payload["jobId"]
    return payload


def test_discovery_blueprint_quality(discovery):
    blueprint = discovery["blueprint"]
    assert len(blueprint["lessons"]) >= 3, "Khung chương trình phải có tối thiểu 3 bài học"
    assert blueprint.get("outcomes"), "Thiếu mục tiêu đầu ra"
    assert any(lesson.get("video_url") for lesson in blueprint["lessons"]), "Thiếu học liệu/video"
    # Danh mục & cấp học phải trỏ tới dữ liệu CÓ THẬT trong DB.
    resolved = sql(
        "SELECT c.slug, e.code FROM learning_categories c, education_levels e "
        "WHERE c.slug = :slug AND e.code = :code",
        slug=blueprint.get("category_slug"),
        code=blueprint.get("level_code"),
    )
    assert resolved, f"Danh mục/cấp học không tồn tại trong DB: {blueprint.get('category_slug')}/{blueprint.get('level_code')}"


def test_discovery_is_private_to_owner(client, auth, discovery):
    job_id = discovery["jobId"]
    assert client.get(f"{API}/ai-discovery/jobs/{job_id}", headers=auth["other"]).status_code == 403
    assert client.get(f"{API}/ai-discovery/jobs/{job_id}", headers=auth["instructor"]).status_code == 200


def test_convert_discovery_to_course(client, auth, discovery, tracked):
    job_id = discovery["jobId"]
    assert client.post(f"{API}/ai-discovery/jobs/{job_id}/approve", headers=auth["instructor"]).status_code == 200

    resp = client.post(
        f"{API}/ai-discovery/jobs/{job_id}/convert-to-course",
        json={"auto_publish": True},
        headers=auth["instructor"],
    )
    assert resp.status_code == 200, resp.text
    course_id = int(resp.json()["data"]["courseId"])
    tracked["course"] = course_id

    assert resp.json()["data"]["lessonsCount"] == len(discovery["blueprint"]["lessons"])

    detail = client.get(f"{API}/courses/id/{course_id}")
    assert detail.status_code == 200, detail.text
    course = detail.json()["data"]
    assert course["isPublished"] is True
    assert len(course["lessons"]) == len(discovery["blueprint"]["lessons"])
    # Lỗi cũ: khóa Toán bị xếp vào danh mục Lập trình và mất category_id.
    assert course["categoryId"] is not None, "Khóa học tạo từ AI bị mất category_id"
    assert course["educationLevelId"] is not None, "Khóa học tạo từ AI bị mất education_level_id"
    assert any(lesson.get("youtubeVideoId") for lesson in course["lessons"])


# ══════════════════ Học viên: ghi danh, tiến độ, mastery ══════════════════

def test_student_mastery_reflects_enrollment(client, auth, tracked):
    course_id = tracked["course"]
    assert course_id, "Cần chạy test convert trước"

    assert client.post(f"{API}/courses/{course_id}/enroll", headers=auth["student"]).status_code == 200
    lessons = client.get(f"{API}/courses/id/{course_id}").json()["data"]["lessons"]
    first = lessons[0]["id"]
    done = client.post(
        f"{API}/courses/{course_id}/lessons/{first}/complete",
        json={"watchedSeconds": 300},
        headers=auth["student"],
    )
    assert done.status_code == 200, done.text

    resp = client.get(f"{API}/student/mastery", headers=auth["student"])
    assert resp.status_code == 200, resp.text
    courses = resp.json()["data"]["courses"]
    mine = next((c for c in courses if int(c["courseId"]) == course_id), None)
    assert mine is not None and mine["topics"], "Mastery không có dữ liệu chủ đề"
    assert {"strongAreas", "needsReviewAreas", "overallMastery"} <= set(mine)

    other = client.get(f"{API}/student/mastery", headers=auth["other"]).json()["data"]["courses"]
    assert all(int(c["courseId"]) != course_id for c in other), "Rò dữ liệu mastery của người khác"


# ══════════════════ Gia sư AI 3 chế độ ══════════════════

@pytest.mark.parametrize("mode", ["socratic", "direct", "practice"])
def test_ai_tutor_stream_per_mode(client, auth, tracked, mode):
    course_id = tracked["course"]
    lessons = client.get(f"{API}/courses/id/{course_id}").json()["data"]["lessons"]
    payload = {
        "question": "Em chưa hiểu điều kiện xác định của phân thức, giải thích giúp em.",
        "lesson_id": int(lessons[0]["id"]),
        "course_id": course_id,
        "tutor_mode": mode,
    }
    tokens = 0
    with client.stream("POST", f"{API}/ai-tutor/chat", json=payload, headers=auth["student"]) as resp:
        assert resp.status_code == 200, resp.read()[:300]
        for line in resp.iter_lines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw:
                continue
            event = json.loads(raw)
            if event.get("error"):
                pytest.skip(f"AI Service không phản hồi: {event['error']}")
            if event.get("token"):
                tokens += 1
            if event.get("done"):
                break
    assert tokens > 0, f"Chế độ '{mode}' không trả về nội dung"
