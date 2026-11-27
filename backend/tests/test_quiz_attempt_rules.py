from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.quiz import _submit_attempt
from app.models.user import UserRole
from app.schemas.quiz import SubmitQuizRequest
from app.services.quiz_service import grade_quiz


def test_answer_does_not_also_apply_to_question_with_matching_position() -> None:
    questions = [
        SimpleNamespace(id=7, order_index=1, correct_answer="A"),
        SimpleNamespace(id=1, order_index=2, correct_answer="A"),
    ]
    result = grade_quiz(questions, {"1": "A"}, strict_question_ids=True)
    assert result["correct_count"] == 1


@pytest.mark.parametrize("token,expected", [
    ("unknown", "Lượt làm bài không còn hiệu lực"),
    ("current", "Đã hết thời gian làm bài"),
])
def test_quiz_submission_rejects_invalid_or_expired_attempts(token: str, expected: str) -> None:
    import asyncio

    student = SimpleNamespace(id=2, role=UserRole.student)
    quiz = SimpleNamespace(id=9, questions=[SimpleNamespace(id=100)])
    attempt = SimpleNamespace(
        token="current",
        submission_id=None,
        deadline=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    db = SimpleNamespace(get=AsyncMock(return_value=attempt))
    with pytest.raises(HTTPException) as error:
        asyncio.run(_submit_attempt(db, student, quiz, SubmitQuizRequest(attempt_token=token)))
    assert error.value.status_code == 409
    assert expected in error.value.detail
