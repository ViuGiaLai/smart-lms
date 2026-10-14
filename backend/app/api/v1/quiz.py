from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course
from app.models.quiz import Quiz, QuizQuestion, QuizSubmission
from app.models.user import User
from app.schemas.quiz import (
    QuizCreate,
    QuizUpdate,
    QuizResponse,
    SubmitQuizRequest,
    QuizSubmissionResponse,
)

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


@router.get("", response_model=list[QuizResponse])
async def list_quizzes(
    course_id: int,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Quiz]:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.course_id == course_id)
    )
    return list(result.scalars().all())


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    course_id: int,
    quiz_id: int,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    return await _get_quiz_or_404(quiz_id, course_id, db)


@router.post("", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    course_id: int,
    payload: QuizCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    await _check_course_ownership(course_id, current_user, db)
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
    for field, value in payload.model_dump(exclude_unset=True).items():
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
) -> QuizSubmission:
    """Submit answers for a quiz and calculate the score."""
    quiz = await _get_quiz_or_404(quiz_id, course_id, db)

    if not quiz.questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has no questions")

    correct = 0
    for idx, q in enumerate(quiz.questions):
        selected = None
        for key in [q.id, str(q.id), q.order_index, str(q.order_index), idx + 1, str(idx + 1)]:
            if key in payload.answers:
                selected = payload.answers[key]
                break
        if selected and str(selected).strip().upper() == str(q.correct_answer).strip().upper():
            correct += 1
    score = correct / len(quiz.questions)
    passed = score >= quiz.pass_score

    submission = QuizSubmission(
        quiz_id=quiz_id,
        user_id=current_user.id,
        answers={str(k): v for k, v in payload.answers.items()},
        score=score,
        passed=passed,
        time_spent=payload.time_spent,
    )
    db.add(submission)
    await db.flush()
    await db.refresh(submission)
    return submission


@router.get("/{quiz_id}/submissions", response_model=list[QuizSubmissionResponse])
async def list_my_submissions(
    course_id: int,
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuizSubmission]:
    result = await db.execute(
        select(QuizSubmission).where(
            QuizSubmission.quiz_id == quiz_id,
            QuizSubmission.user_id == current_user.id,
        )
    )
    return list(result.scalars().all())


@standalone_router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz_standalone(
    quiz_id: int,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Quiz:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    return quiz


@standalone_router.post("/{quiz_id}/submit", response_model=QuizSubmissionResponse)
async def submit_quiz_standalone(
    quiz_id: int,
    payload: SubmitQuizRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> QuizSubmission:
    result = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

    if not quiz.questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has no questions")

    correct = 0
    for idx, q in enumerate(quiz.questions):
        selected = None
        for key in [q.id, str(q.id), q.order_index, str(q.order_index), idx + 1, str(idx + 1)]:
            if key in payload.answers:
                selected = payload.answers[key]
                break
        if selected and str(selected).strip().upper() == str(q.correct_answer).strip().upper():
            correct += 1
    score = correct / len(quiz.questions)
    passed = score >= quiz.pass_score

    submission = QuizSubmission(
        quiz_id=quiz_id,
        user_id=current_user.id,
        answers={str(k): v for k, v in payload.answers.items()},
        score=score,
        passed=passed,
        time_spent=payload.time_spent,
    )
    db.add(submission)
    await db.flush()
    await db.refresh(submission)
    return submission


@standalone_router.get("/{quiz_id}/submissions", response_model=list[QuizSubmissionResponse])
async def list_my_submissions_standalone(
    quiz_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuizSubmission]:
    result = await db.execute(
        select(QuizSubmission).where(
            QuizSubmission.quiz_id == quiz_id,
            QuizSubmission.user_id == current_user.id,
        )
    )
    return list(result.scalars().all())
