from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.models.course import Course
from app.models.lesson import Lesson
from app.models.lesson_material import LessonMaterial
from app.services.course_service import CourseService


def _course(**overrides) -> Course:
    values = {
        "title": "Python cơ bản",
        "slug": "python-co-ban",
        "description": "Khóa học nhập môn Python cho người mới bắt đầu.",
        "instructor_id": 1,
        "category_id": 1,
        "education_level_id": 1,
        "lessons": [Lesson(title="Bài 1", description="Biến và kiểu dữ liệu")],
    }
    values.update(overrides)
    return Course(**values)


def test_publication_check_accepts_complete_course() -> None:
    assert CourseService._publication_errors(_course()) == []


def test_publication_check_lists_missing_requirements() -> None:
    course = _course(category_id=None, education_level_id=None, lessons=[])

    assert CourseService._publication_errors(course) == [
        "Hãy chọn danh mục cho khóa học.",
        "Hãy chọn cấp học/trình độ cho khóa học.",
        "Khóa học cần ít nhất một bài học.",
    ]


def test_publication_check_rejects_unfinished_material() -> None:
    course = _course(
        lessons=[
            Lesson(
                title="Bài 1",
                materials=[
                    LessonMaterial(
                        kind="document",
                        title="slide.pdf",
                        file_url="",
                        status="processing",
                    )
                ],
            )
        ]
    )

    with pytest.raises(HTTPException) as raised:
        CourseService._ensure_publishable(course)

    assert raised.value.status_code == 422
    assert raised.value.detail["errors"] == ['"Bài 1" còn học liệu đang xử lý hoặc bị lỗi.']
