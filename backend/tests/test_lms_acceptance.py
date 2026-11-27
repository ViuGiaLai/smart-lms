"""Run against a migrated, isolated PostgreSQL database with LMS_QA_DATABASE=1."""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token
from app.main import app
from app.media_worker import process_next
from app.models.category import LearningCategory
from app.models.education_level import EducationLevel
from app.models.user import User, UserRole

pytestmark = pytest.mark.skipif(os.getenv("LMS_QA_DATABASE") != "1", reason="Requires an isolated PostgreSQL database")


def test_review_checkout_learning_and_quiz(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ENVIRONMENT", "demo")
    monkeypatch.setattr(settings, "ALLOW_DEMO_CHECKOUT", True)
    monkeypatch.setattr(settings, "REQUIRE_COURSE_REVIEW", True)
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "")
    api = "/api/v1"
    key = uuid4().hex

    async def seed():
        async with AsyncSessionLocal.begin() as db:
            teachers = [
                User(name=role.value, email=f"{key}-{index}@example.org", hashed_password="unused", role=role)
                for index, role in enumerate((UserRole.instructor, UserRole.admin, UserRole.student))
            ]
            category = LearningCategory(name="Danh mục QA", slug=key, is_active=True)
            level = EducationLevel(name="Cấp học QA", code=key, is_active=True)
            db.add_all([*teachers, category, level])
            await db.flush()
            headers = [
                {"Authorization": "Bearer " + create_access_token({"sub": str(user.id), "role": user.role.value})}
                for user in teachers
            ]
            return *headers, category.id, level.id

    with TestClient(app) as client:
        instructor, admin, stranger, category_id, level_id = client.portal.call(seed)

        def parse(response, expected=200):
            assert response.status_code == expected, response.text
            return response.json()

        login_data = {"email": f"{key}-learner@example.org", "password": "AcceptanceOnly2026"}
        parse(client.post(f"{api}/auth/register", json={**login_data, "fullName": "Học viên QA"}), 201)
        credentials = parse(client.post(f"{api}/auth/login", json=login_data))["data"]
        student = {"Authorization": "Bearer " + credentials["accessToken"]}

        course = parse(client.post(f"{api}/courses", headers=instructor, json={
            "title": f"Khóa QA {key}", "description": "Nội dung khóa học QA", "price": 299000,
            "category_id": category_id, "education_level_id": level_id,
        }), 201)
        path = f"{api}/courses/{course['id']}"
        assert client.patch(f"{path}/publish", headers=instructor).status_code == 422
        lesson = parse(client.post(f"{path}/lessons", headers=instructor, json={
            "title": "Bài đọc QA", "description": "Nội dung bài đọc", "transcript": "Nội dung riêng",
        }), 201)
        parse(client.post(f"{path}/lessons", headers=instructor, json={
            "title": "Bài học thử", "order_index": 1, "video_url": "https://youtu.be/0k2G_Z4qZpQ",
            "transcript": "Phụ đề riêng",
        }), 201)
        document_path = f"{path}/lessons/{lesson['id']}/documents"
        upload = parse(client.post(f"{document_path}/upload", headers=instructor, data={"run_in_background": "true"},
                                   files={"file": ("lesson.pdf", b"%PDF-1.7\nQA payload", "application/pdf")}))
        assert upload["material"]["status"] == "queued"
        assert upload["material"]["file_url"] == ""
        assert client.patch(f"{path}/publish", headers=instructor).status_code == 422

        async def run_worker():
            async def ingest(request):
                assert "/documents/upload" in request.url.path
                assert b"QA payload" in await request.aread()
                return httpx.Response(200, json={"total_chunks": 1})

            async with httpx.AsyncClient(transport=httpx.MockTransport(ingest)) as ai:
                assert await process_next(ai)

        client.portal.call(run_worker)
        assert parse(client.get(document_path, headers=instructor))[0]["status"] == "ready"
        quiz = parse(client.post(f"{path}/quizzes", headers=instructor, json={
            "title": "Bài kiểm tra QA", "lesson_id": lesson["id"], "time_limit": 300,
            "questions": [{
                "question_text": "Đáp án nào đúng?",
                "options": [{"key": letter, "text": letter} for letter in "ABCD"],
                "correct_answer": "A", "explanation": "A là đáp án đúng.",
            }],
        }), 201)

        assert parse(client.patch(f"{path}/publish", headers=instructor))["status"] == "in_review"
        assert client.get(path).status_code == 404
        assert client.post(f"{path}/lessons", headers=instructor, json={"title": "Sửa khi duyệt"}).status_code == 409
        moderation = f"{api}/admin/courses/{course['id']}/status"
        assert client.patch(moderation, headers=admin, params={"new_status": "draft"}).status_code == 422
        parse(client.patch(moderation, headers=admin, params={"new_status": "draft", "review_note": "Kiểm tra lại."}))
        assert parse(client.get(path, headers=instructor))["data"]["reviewNote"] == "Kiểm tra lại."
        parse(client.patch(f"{path}/publish", headers=instructor))
        parse(client.patch(moderation, headers=admin, params={"new_status": "published"}))

        lesson_path = f"{path}/lessons/{lesson['id']}"
        public_lessons = parse(client.get(path))["data"]["lessons"]
        assert all(item["transcript"] == "" for item in public_lessons)
        assert public_lessons[1]["isFree"] and public_lessons[1]["youtubeVideoId"] == "0k2G_Z4qZpQ"
        assert client.get(lesson_path, headers=student).status_code == 403
        assert client.get(document_path, headers=student).status_code == 403
        assert client.post(f"{api}/ai-tutor/chat", headers=student, json={
            "question": "Nội dung bài học là gì?", "lesson_id": lesson["id"], "course_id": course["id"],
        }).status_code == 403
        assert client.post(f"{path}/enroll", headers=student).status_code == 402

        order = parse(client.post(f"{api}/checkout/courses/{course['id']}", headers=student))
        assert order["amount"] == "299000.00"
        confirmation = f"{api}/checkout/orders/{order['orderId']}/confirm"
        payment = {"method": "momo_demo", "outcome": "success", "expected_amount": order["amount"]}
        assert client.post(confirmation, headers=stranger, json=payment).status_code == 404
        assert client.post(confirmation, headers=student, json={**payment, "expected_amount": 1}).status_code == 409
        for outcome in ("failed", "cancelled"):
            assert parse(client.post(confirmation, headers=student, json={**payment, "outcome": outcome}))["status"] == outcome
            assert client.get(lesson_path, headers=student).status_code == 403
        for _ in range(2):
            assert parse(client.post(confirmation, headers=student, json=payment))["status"] == "paid"
        assert len(parse(client.get(f"{api}/checkout/history", headers=student))["data"]) == 3
        assert parse(client.get(f"{api}/admin/stats", headers=admin))["data"]["demoAmount"] >= 299000
        assert parse(client.get(lesson_path, headers=student))["transcript"] == "Nội dung riêng"
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        assert client.post(confirmation, headers=student, json=payment).status_code == 404
        assert "demoAmount" not in parse(client.get(f"{api}/admin/stats", headers=admin))["data"]
        parse(client.post(f"{lesson_path}/complete", headers=student, json={}))
        assert parse(client.get(f"{path}/progress", headers=student))["data"]["percentage"] == 50

        quiz_path = f"{api}/quizzes/{quiz['id']}"
        assert client.post(f"{quiz_path}/attempt", headers=admin).status_code == 403
        question = parse(client.get(quiz_path, headers=student))["questions"][0]
        assert "correct_answer" not in question
        attempt = parse(client.post(f"{quiz_path}/attempt", headers=student))
        answers = {"attempt_token": attempt["attempt_token"], "answers": {str(question["id"]): "A"}}
        first = parse(client.post(f"{quiz_path}/submit", headers=student, json=answers))
        second = parse(client.post(f"{quiz_path}/submit", headers=student, json=answers))
        assert first["score"] == 1 and first["id"] == second["id"]
        assert client.get(f"{path}/progress", headers=stranger).status_code == 403

        internal = parse(client.post(f"{api}/courses", headers=instructor, json={
            "title": f"Nội bộ {key}", "description": "Nội dung đào tạo nội bộ", "is_internal": True,
            "category_id": category_id, "education_level_id": level_id,
        }), 201)
        internal_path = f"{api}/courses/{internal['id']}"
        lesson_a = parse(client.post(f"{internal_path}/lessons", headers=instructor, json={
            "title": "A", "description": "Bài học A", "order_index": 1,
        }), 201)
        lesson_b = parse(client.post(f"{internal_path}/lessons", headers=instructor, json={
            "title": "B", "description": "Bài học B", "order_index": 2,
        }), 201)
        curriculum = f"{internal_path}/curriculum"
        assert client.post(f"{curriculum}/sections", headers=student, json={"title": "Sai quyền"}).status_code == 403
        section = parse(client.post(f"{curriculum}/sections", headers=instructor, json={"title": " Chương nền tảng "}), 201)
        assert section["title"] == "Chương nền tảng"
        layout = {"sections": [
            {"sectionId": section["id"], "lessonIds": [lesson_b["id"]]},
            {"sectionId": None, "lessonIds": [lesson_a["id"]]},
        ]}
        crossed = {"sections": [
            {"sectionId": section["id"], "lessonIds": [lesson["id"]]},
            {"sectionId": None, "lessonIds": [lesson_a["id"]]},
        ]}
        assert client.put(f"{curriculum}/order", headers=instructor, json=crossed).status_code == 409
        parse(client.put(f"{curriculum}/order", headers=instructor, json=layout))
        view = parse(client.get(internal_path, headers=instructor))["data"]
        assert view["sections"] == [section]
        assert [int(row["id"]) for row in view["lessons"]] == [lesson_b["id"], lesson_a["id"]]
        assert view["lessons"][0]["section_id"] == section["id"]
        parse(client.delete(f"{curriculum}/sections/{section['id']}", headers=instructor))
        assert len(parse(client.get(internal_path, headers=instructor))["data"]["lessons"]) == 2

        parse(client.patch(f"{internal_path}/publish", headers=instructor))
        parse(client.patch(f"{api}/admin/courses/{internal['id']}/status", headers=admin, params={"new_status": "published"}))
        assert client.get(internal_path, headers=student).status_code == 404
        public_list = parse(client.get(f"{api}/courses", params={"search": internal["title"]}))
        assert all(row["id"] != str(internal["id"]) for row in public_list["data"])
        assert client.get(f"{internal_path}/reviews").status_code == 404
        assert client.post(f"{internal_path}/enroll", headers=student).status_code == 404
        invite_path = f"{curriculum}/enrollments"
        enrollment = parse(client.post(invite_path, headers=instructor, json={"email": login_data["email"]}))
        assert parse(client.post(invite_path, headers=instructor, json={"email": login_data["email"]})) == enrollment
        assert parse(client.get(internal_path, headers=student))["data"]["canAccessLessons"]
        assert client.get(internal_path, headers=stranger).status_code == 404
        assert client.get(f"{api}/admin/audit-logs", headers=student).status_code == 403
        log_data = parse(client.get(f"{api}/admin/audit-logs?limit=1", headers=admin))
        assert log_data["data"][0]["action"] == "course.enroll" and log_data["nextBefore"] is not None

        assignments_path = f"{internal_path}/assignments"
        exercise = {"title": "Viết API", "instructions": "Nộp README và đường dẫn mã nguồn.", "max_score": 20}
        assignment = parse(client.post(assignments_path, headers=instructor, json=exercise), 201)
        submissions_path = f"{assignments_path}/{assignment['id']}/submissions"
        assert client.get(submissions_path, headers=stranger).status_code == 403
        assert client.post(submissions_path, headers=student, json={"repository_url": "http://example.org"}).status_code == 422
        submission = parse(client.post(submissions_path, headers=student, json={"repository_url": "https://github.com/example/work"}), 201)
        parse(client.post(invite_path, headers=instructor, json={"email": f"{key}-2@example.org"}))
        assert parse(client.get(submissions_path, headers=stranger))["data"] == []
        assert client.post(submissions_path, headers=student, json={"content": "Gửi lần hai"}).status_code == 409
        grade_path = f"{submissions_path}/{submission['id']}/grade"
        assert client.put(grade_path, headers=student, json={"score": 20, "feedback": ""}).status_code == 403
        assert client.put(grade_path, headers=instructor, json={"score": 21, "feedback": ""}).status_code == 422
        parse(client.put(grade_path, headers=instructor, json={"score": 18, "feedback": "Bổ sung kiểm thử."}))
        result = parse(client.get(submissions_path, headers=student))["data"][0]
        assert result["score"] == 18 and result["feedback"] == "Bổ sung kiểm thử."
        expired = parse(client.post(assignments_path, headers=instructor, json={
            **exercise, "due_at": "2000-01-01T00:00:00Z",
        }), 201)
        assert client.post(f"{assignments_path}/{expired['id']}/submissions", headers=student,
                           json={"content": "Nộp muộn"}).status_code == 409

        profile_path = f"{api}/auth/profile"
        assert client.patch(profile_path, headers=student, json={"name": "Học viên QA", "role": "admin"}).status_code == 422
        profile = parse(client.patch(profile_path, headers=student, json={
            "name": "Sinh viên cập nhật", "field": "CNTT", "avatarUrl": "https://example.org/avatar.png",
        }))["data"]
        assert profile["role"] == "student" and profile["profile"]["field"] == "CNTT"
        assert parse(client.get(profile_path, headers=student))["data"]["avatarUrl"] == "https://example.org/avatar.png"
        inbox = f"{api}/notifications"
        entries = parse(client.get(inbox, headers=student))["data"]
        assert any("Đã có điểm" in row["title"] for row in entries)
        count = parse(client.get(f"{inbox}/unread-count", headers=student))["count"]
        read_path = f"{inbox}/{entries[0]['id']}/read"
        assert client.patch(read_path, headers=stranger).status_code == 404
        parse(client.patch(read_path, headers=student))
        assert parse(client.get(f"{inbox}/unread-count", headers=student))["count"] == count - 1
        parse(client.post(f"{inbox}/read-all", headers=student))
        assert parse(client.get(f"{inbox}/unread-count", headers=student))["count"] == 0
        dashboard = parse(client.get(f"{api}/student/dashboard", headers=student))["data"]
        assert dashboard["totalEnrolled"] == 2 and dashboard["totalInProgress"] == 1 and dashboard["totalNotStarted"] == 1
        upcoming = f"{api}/student/upcoming-assignments"
        next_assignment = parse(client.post(assignments_path, headers=instructor, json={
            **exercise, "due_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        }), 201)
        assert [row["id"] for row in parse(client.get(upcoming, headers=student))["data"]] == [next_assignment["id"]]
        parse(client.post(f"{assignments_path}/{next_assignment['id']}/submissions", headers=student,
                          json={"content": "Đã làm."}), 201)
        assert parse(client.get(upcoming, headers=student))["data"] == []
        security = f"{api}/auth/change-password"
        assert client.post(security, headers=student, json={
            "currentPassword": "sai", "newPassword": "UpdatedPassword2026",
        }).status_code == 400
        parse(client.post(security, headers=student, json={
            "currentPassword": login_data["password"], "newPassword": "UpdatedPassword2026",
        }))
        assert client.get(profile_path, headers=student).status_code == 401
