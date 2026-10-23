from __future__ import annotations

from typing import Any, Iterable


def _normalize_answers(answers: dict[Any, Any] | None) -> dict[str, str]:
    if not answers:
        return {}
    return {str(k).strip(): str(v).strip().upper() for k, v in answers.items() if v is not None}


def selected_answer_for_question(
    question: Any,
    answers: dict[str, str],
    index: int,
) -> str | None:
    """Khớp đáp án theo id câu hỏi (ưu tiên), hoặc số thứ tự 1-based."""
    # Ưu tiên khớp theo id câu hỏi (đền nhất), sau đó mới thử order_index hoặc số thứ tự
    candidates = [
        str(getattr(question, "id", "")),
        str(index + 1),
        str(getattr(question, "order_index", "")),
    ]
    for key in candidates:
        if key and key in answers:
            return answers[key]
    return None


def grade_quiz(
    questions: Iterable[Any],
    answers: dict[Any, Any] | None,
    pass_score: float = 0.6,
) -> dict[str, Any]:
    """Chấm bài trắc nghiệm trên máy chủ. Không phụ thuộc cách client đánh số câu."""
    question_list = list(questions)
    normalized = _normalize_answers(answers)
    results: list[dict[str, Any]] = []
    correct = 0

    for idx, question in enumerate(question_list):
        expected = str(getattr(question, "correct_answer", "") or "").strip().upper()
        selected = selected_answer_for_question(question, normalized, idx)
        is_correct = bool(selected) and selected == expected
        if is_correct:
            correct += 1
        results.append(
            {
                "question_id": getattr(question, "id", idx + 1),
                "selected": selected,
                "correct_answer": expected,
                "is_correct": is_correct,
                "explanation": getattr(question, "explanation", None) or "",
                "question_text": getattr(question, "question_text", ""),
            }
        )

    total = len(question_list)
    score = (correct / total) if total else 0.0
    passed = score >= float(pass_score or 0.0)
    return {
        "correct_count": correct,
        "total_questions": total,
        "score": score,
        "passed": passed,
        "results": results,
    }


def serialize_question(question: Any, include_answers: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": getattr(question, "id", None),
        "question_text": getattr(question, "question_text", ""),
        "options": getattr(question, "options", []) or [],
        "order_index": getattr(question, "order_index", 0),
    }
    if include_answers:
        payload["correct_answer"] = getattr(question, "correct_answer", None)
        payload["explanation"] = getattr(question, "explanation", None)
    return payload


def serialize_quiz(quiz: Any, include_answers: bool) -> dict[str, Any]:
    created = getattr(quiz, "created_at", None)
    return {
        "id": quiz.id,
        "course_id": quiz.course_id,
        "lesson_id": quiz.lesson_id,
        "title": quiz.title,
        "description": quiz.description,
        "time_limit": quiz.time_limit,
        "pass_score": quiz.pass_score,
        "is_ai_generated": quiz.is_ai_generated,
        "created_at": created.isoformat() if created else None,
        "questions": [
            serialize_question(q, include_answers) for q in (quiz.questions or [])
        ],
    }
