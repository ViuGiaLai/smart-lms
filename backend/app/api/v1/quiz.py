from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.quiz import Quiz, QuizQuestion, QuizSession, QuizSubmission
from app.models.user import User, UserRole
from app.schemas.quiz import (
    QuizCreate,
    QuizUpdate,
    QuizResponse,
    QuizStudentResponse,
    SubmitQuizRequest,
    QuizSubmissionResponse,
)
from app.services.enrollment_service import require_course_access
from app.services.quiz_service import grade_quiz

router = APIRouter(prefix="/courses/{course_id}/quizzes")
standalone_router = APIRouter(prefix="/quizzes")


async def _check_course_ownership(course_id: int, current_user: User, db: AsyncSession) -> Course:
    res = await db.execute(select(Course).where(Course.id == course_id))
    course = res.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_str != "admin" and course.instructor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giảng viên phụ trách khóa học hoặc Admin mới có quyền thao tác trên bài kiểm tra.",
        )
    return course


async def _validate_lesson_belongs_to_course(
    lesson_id: int | None,
    course_id: int,
    db: AsyncSession,
) -> None:
    if lesson_id is None:
        return
    res = await db.execute(
        select(Lesson.id).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
    )
    if res.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bài học không thuộc khóa học này",
        )


async def _get_quiz_or_404(quiz_id: int, course_id: int, db: AsyncSession) -> Quiz:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id, Quiz.course_id == course_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    return quiz


def _student_quiz_response(quiz: Quiz) -> QuizStudentResponse:
    """Return quiz content without the answer key before submission."""
    return QuizStudentResponse.model_validate(quiz)


def _submission_payload(
    submission: QuizSubmission,
    quiz: Quiz,
    answers: dict[str, str],
) -> dict:
    results = []
    for question in quiz.questions:
        selected = answers.get(str(question.id))
        results.append(
            {
                "question_id": question.id,
                "selected": selected,
                "correct_answer": question.correct_answer,
                "is_correct": bool(
                    selected
                    and selected.strip().upper() == question.correct_answer.strip().upper()
                ),
                "explanation": question.explanation or "",
                "question_text": question.question_text,
            }
        )
    return {
        "id": submission.id,
        "quiz_id": submission.quiz_id,
        "user_id": submission.user_id,
        "score": submission.score,
        "passed": submission.passed,
        "answers": submission.answers,
        "submitted_at": submission.submitted_at,
        "correct_count": sum(item["is_correct"] for item in results),
        "total_questions": len(results),
        "results": results,
    }


@router.get("", response_model=list[QuizStudentResponse])
async def list_quizzes(
    course_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuizStudentResponse]:
    await require_course_access(db, current_user, course_id)
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.course_id == course_id)
    )
    return [_student_quiz_response(quiz) for quiz in result.scalars().all()]


@router.get("/{quiz_id}", response_model=QuizStudentResponse)
async def get_quiz(
    course_id: int,
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> QuizStudentResponse:
    await require_course_access(db, current_user, course_id)
    return _student_quiz_response(await _get_quiz_or_404(quiz_id, course_id, db))


@router.post("", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    course_id: int,
    payload: QuizCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    await _check_course_ownership(course_id, current_user, db)
    await _validate_lesson_belongs_to_course(payload.lesson_id, course_id, db)
    quiz_data = payload.model_dump(exclude={"questions"})
    quiz = Quiz(course_id=course_id, **quiz_data)
    db.add(quiz)
    await db.flush()

    for q in payload.questions:
        question = QuizQuestion(
            quiz_id=quiz.id,
            **q.model_dump(),
        )
        db.add(question)

    await db.flush()
    await db.refresh(quiz)
    # reload with questions
    return await _get_quiz_or_404(quiz.id, course_id, db)


@router.put("/{quiz_id}", response_model=QuizResponse)
async def update_quiz(
    course_id: int,
    quiz_id: int,
    payload: QuizUpdate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    await _check_course_ownership(course_id, current_user, db)
    quiz = await _get_quiz_or_404(quiz_id, course_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "lesson_id" in updates:
        await _validate_lesson_belongs_to_course(updates["lesson_id"], course_id, db)
    for field, value in updates.items():
        setattr(quiz, field, value)
    await db.flush()
    await db.refresh(quiz)
    return quiz


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_quiz(
    course_id: int,
    quiz_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _check_course_ownership(course_id, current_user, db)
    quiz = await _get_quiz_or_404(quiz_id, course_id, db)
    await db.delete(quiz)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{quiz_id}/submit", response_model=QuizSubmissionResponse)
async def submit_quiz(
    course_id: int,
    quiz_id: int,
    payload: SubmitQuizRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit answers for a quiz and calculate the score."""
    await require_course_access(db, current_user, course_id)
    quiz = await _get_quiz_or_404(quiz_id, course_id, db)

    return await _submit_attempt(db, current_user, quiz, payload)


@router.get("/{quiz_id}/submissions", response_model=list[QuizSubmissionResponse])
async def list_my_submissions(
    course_id: int,
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await require_course_access(db, current_user, course_id)
    quiz = await _get_quiz_or_404(quiz_id, course_id, db)
    result = await db.execute(
        select(QuizSubmission).where(
            QuizSubmission.quiz_id == quiz_id,
            QuizSubmission.user_id == current_user.id,
        )
    )
    return [
        _submission_payload(submission, quiz, submission.answers or {})
        for submission in result.scalars().all()
    ]


@standalone_router.get("/{quiz_id}", response_model=QuizStudentResponse)
async def get_quiz_standalone(
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> QuizStudentResponse:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    await require_course_access(db, current_user, quiz.course_id)
    return _student_quiz_response(quiz)


@standalone_router.post("/{quiz_id}/submit", response_model=QuizSubmissionResponse)
async def submit_quiz_standalone(
    quiz_id: int,
    payload: SubmitQuizRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    await require_course_access(db, current_user, quiz.course_id)
    return await _submit_attempt(db, current_user, quiz, payload)


@standalone_router.post("/{quiz_id}/attempt")
async def start_quiz_attempt(
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    _require_student(current_user)
    quiz = await db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài kiểm tra.")
    await require_course_access(db, current_user, quiz.course_id)

    now = datetime.now(timezone.utc)
    deadline = now + timedelta(seconds=quiz.time_limit) if quiz.time_limit and quiz.time_limit > 0 else None
    await db.execute(
        insert(QuizSession)
        .values(quiz_id=quiz.id, user_id=current_user.id, token=uuid4().hex, started_at=now, deadline=deadline)
        .on_conflict_do_nothing(index_elements=[QuizSession.quiz_id, QuizSession.user_id])
    )
    attempt = await db.get(QuizSession, (quiz.id, current_user.id), with_for_update=True)
    if attempt.submission_id is not None or (attempt.deadline is not None and attempt.deadline <= now):
        attempt.token = uuid4().hex
        attempt.started_at = now
        attempt.deadline = deadline
        attempt.submission_id = None
    return {"attempt_token": attempt.token, "deadline": attempt.deadline}


def _require_student(user: User) -> None:
    if user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Chỉ học viên có thể làm bài kiểm tra.")


async def _submit_attempt(db: AsyncSession, user: User, quiz: Quiz, payload: SubmitQuizRequest) -> dict:
    _require_student(user)

    if not quiz.questions:
        raise HTTPException(status_code=400, detail="Bài kiểm tra chưa có câu hỏi.")

    attempt = await db.get(QuizSession, (quiz.id, user.id), with_for_update=True)
    if attempt is None or attempt.token != payload.attempt_token:
        raise HTTPException(status_code=409, detail="Lượt làm bài không còn hiệu lực. Hãy mở lại bài kiểm tra.")
    if attempt.submission_id is not None:
        existing = await db.get(QuizSubmission, attempt.submission_id)
        return _submission_payload(existing, quiz, existing.answers)
    now = datetime.now(timezone.utc)
    if attempt.deadline is not None and now >= attempt.deadline:
        raise HTTPException(status_code=409, detail="Đã hết thời gian làm bài.")

    valid_answers = {str(question.id) for question in quiz.questions}
    if not payload.answers.keys() <= valid_answers:
        raise HTTPException(status_code=422, detail="Bài nộp chứa câu hỏi không thuộc đề kiểm tra.")
    score_data = grade_quiz(quiz.questions, payload.answers, quiz.pass_score, strict_question_ids=True)

    submission = QuizSubmission(
        quiz_id=quiz.id,
        user_id=user.id,
        answers=payload.answers,
        score=score_data["score"],
        passed=score_data["passed"],
        time_spent=max(0, int((now - attempt.started_at).total_seconds())),
    )
    db.add(submission)
    await db.flush()
    attempt.submission_id = submission.id
    await db.refresh(submission)
    return _submission_payload(submission, quiz, payload.answers)


@standalone_router.get("/{quiz_id}/submissions", response_model=list[QuizSubmissionResponse])
async def list_my_submissions_standalone(
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result_quiz = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )
    quiz = result_quiz.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    await require_course_access(db, current_user, quiz.course_id)
    result = await db.execute(
        select(QuizSubmission).where(
            QuizSubmission.quiz_id == quiz_id,
            QuizSubmission.user_id == current_user.id,
        )
    )
    return [
        _submission_payload(submission, quiz, submission.answers or {})
        for submission in result.scalars().all()
    ]
