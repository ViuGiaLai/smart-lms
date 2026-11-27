import pytest
from starlette.requests import Request
from app.services.ai_quota import FEATURE_LIMITS, FEATURE_LABELS
from app.api.v1.student import generate_certificate_code
from app.api.v1.courses import _can_view_answer_key
from app.api.v1.documents import _material_dict
from app.core.rate_limit import _extract_client_ip
from app.models.course import Course
from app.models.lesson_material import LessonMaterial
from app.models.user import User, UserRole


@pytest.mark.anyio
async def test_summarize_quota_configured():
    assert "summarizer" in FEATURE_LIMITS
    assert "summarizer" in FEATURE_LABELS
    assert FEATURE_LIMITS["summarizer"] > 0


def test_certificate_code_deterministic_and_verifiable():
    code1 = generate_certificate_code(80, 3)
    code2 = generate_certificate_code(80, 3)
    code_diff = generate_certificate_code(80, 4)
    assert code1 == code2
    assert code1 != code_diff
    assert code1.startswith("SLMS-0080-00003-")
    assert len(code1.split("-")[-1]) == 8


@pytest.mark.anyio
async def test_answer_key_hidden_from_students():
    course = Course(id=10, title="Khóa thương mại", instructor_id=2)
    student = User(id=3, email="sv@example.com", name="SV", role=UserRole.student)
    instructor_owner = User(id=2, email="gv@example.com", name="GV", role=UserRole.instructor, is_active=True)
    other_instructor = User(id=9, email="gv2@example.com", name="GV2", role=UserRole.instructor)
    admin = User(id=1, email="admin@example.com", name="Admin", role=UserRole.admin, is_active=True)

    assert await _can_view_answer_key(None, course, None) is False  # type: ignore[arg-type]
    assert await _can_view_answer_key(None, course, student) is False  # type: ignore[arg-type]
    assert await _can_view_answer_key(None, course, other_instructor) is False  # type: ignore[arg-type]
    assert await _can_view_answer_key(None, course, instructor_owner) is True  # type: ignore[arg-type]
    assert await _can_view_answer_key(None, course, admin) is True  # type: ignore[arg-type]
    instructor_owner.is_active = False
    assert await _can_view_answer_key(None, course, instructor_owner) is False  # type: ignore[arg-type]


def test_material_dict_hides_storage_key():
    mat = LessonMaterial(
        id=1,
        lesson_id=10,
        kind="video",
        title="bai-giang.mp4",
        file_url="https://cdn.example.com/bai-giang.mp4",
        storage_key="courses/react/bai-1/videos/secret-key.mp4",
        mime_type="video/mp4",
        size_bytes=1024,
        status="ready",
    )
    serialized = _material_dict(mat)
    assert "storage_key" not in serialized
    assert serialized["file_url"] == "https://cdn.example.com/bai-giang.mp4"


def test_rate_limit_extracts_proxy_ip():
    scope = {
        "type": "http",
        "headers": [
            (b"x-forwarded-for", b"203.0.113.50, 70.41.3.18"),
        ],
        "client": ("127.0.0.1", 50000),
    }
    req = Request(scope)
    assert _extract_client_ip(req) == "203.0.113.50"

    cf_scope = {
        "type": "http",
        "headers": [
            (b"cf-connecting-ip", b"198.51.100.99"),
            (b"x-forwarded-for", b"203.0.113.50"),
        ],
        "client": ("127.0.0.1", 50000),
    }
    assert _extract_client_ip(Request(cf_scope)) == "198.51.100.99"
