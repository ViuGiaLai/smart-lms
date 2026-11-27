from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, Field, HttpUrl, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.curriculum import require_editor
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.assignment import Assignment, AssignmentSubmission
from app.api.v1.notifications import notify
from app.models.enrollment import Enrollment
from app.models.course import CourseStatus
from app.models.user import User, UserRole
from app.services.audit_service import record_change
from app.services.enrollment_service import require_course_access

router = APIRouter(prefix="/courses/{course_id}/assignments", tags=["Assignments"])


class AssignmentInput(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12000)]
    due_at: AwareDatetime | None = None
    max_attempts: int = Field(1, ge=1, le=10)
    max_score: int = Field(100, ge=1, le=1000)


class SubmissionInput(BaseModel):
    content: str | None = Field(None, max_length=12000)
    repository_url: HttpUrl | None = None


class GradeInput(BaseModel):
    score: int = Field(ge=0, le=1000)
    feedback: str = Field(max_length=12000)


def assignment_data(item: Assignment) -> dict:
    return {key: getattr(item, key) for key in ("id", "title", "instructions", "due_at", "max_attempts", "max_score")}


def submission_data(item: AssignmentSubmission) -> dict:
    return {key: getattr(item, key) for key in (
        "id", "attempt", "content", "repository_url", "submitted_at", "score", "feedback", "graded_at",
    )}


async def load_assignment(db: AsyncSession, course_id: int, assignment_id: int, *, lock=False) -> Assignment:
    query = select(Assignment).where(Assignment.id == assignment_id, Assignment.course_id == course_id)
    item = await db.scalar(query.with_for_update() if lock else query)
    if not item:
        raise HTTPException(404, "Không tìm thấy bài tập trong khóa học.")
    return item


@router.get("")
async def list_assignments(course_id: int, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await require_course_access(db, user, course_id)
    rows = await db.scalars(select(Assignment).where(Assignment.course_id == course_id).order_by(Assignment.id))
    return {"data": [assignment_data(item) for item in rows]}


@router.post("", status_code=201)
async def create_assignment(course_id: int, payload: AssignmentInput, user: User = Depends(require_instructor),
                            db: AsyncSession = Depends(get_db)):
    course = await require_editor(db, user, course_id)
    item = Assignment(course_id=course_id, **payload.model_dump())
    db.add(item)
    await db.flush()
    if course.status == CourseStatus.published:
        recipients = await db.scalars(select(Enrollment.user_id).where(Enrollment.course_id == course_id))
        for recipient in recipients:
            notify(db, recipient, f"Bài tập mới: {item.title}", f"/courses/{course_id}#assignments")
    return assignment_data(item)


@router.get("/{assignment_id}/submissions")
async def list_submissions(course_id: int, assignment_id: int, before: int | None = Query(None, gt=0),
                           user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await require_course_access(db, user, course_id)
    await load_assignment(db, course_id, assignment_id)
    query = (select(AssignmentSubmission, User.name)
             .join(User, User.id == AssignmentSubmission.student_id)
             .where(AssignmentSubmission.assignment_id == assignment_id)
             .order_by(AssignmentSubmission.id.desc()).limit(31))
    if before is not None:
        query = query.where(AssignmentSubmission.id < before)
    if user.role == UserRole.student:
        query = query.where(AssignmentSubmission.student_id == user.id)
    rows = (await db.execute(query)).all()
    return {"data": [
        {**submission_data(item), "student_name": name} for item, name in rows[:30]
    ], "nextBefore": rows[29][0].id if len(rows) > 30 else None}


@router.post("/{assignment_id}/submissions", status_code=201)
async def submit_assignment(course_id: int, assignment_id: int, payload: SubmissionInput,
                            user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    course = await require_course_access(db, user, course_id)
    if user.role != UserRole.student or course.status != CourseStatus.published:
        raise HTTPException(403, "Chỉ sinh viên có quyền học mới được nộp bài.")
    item = await load_assignment(db, course_id, assignment_id, lock=True)
    content = (payload.content or "").strip()
    url = str(payload.repository_url) if payload.repository_url else None
    if url and (payload.repository_url.scheme != "https" or payload.repository_url.username or payload.repository_url.password or len(url) > 1024):
        raise HTTPException(422, "Liên kết mã nguồn phải dùng HTTPS và không chứa thông tin đăng nhập.")
    if not content and not url:
        raise HTTPException(422, "Hãy nhập nội dung hoặc liên kết mã nguồn.")
    if item.due_at is not None and datetime.now(timezone.utc) >= item.due_at:
        raise HTTPException(409, "Bài tập đã hết hạn nộp.")
    attempts = await db.scalar(select(func.count(AssignmentSubmission.id)).where(
        AssignmentSubmission.assignment_id == item.id, AssignmentSubmission.student_id == user.id,
    ))
    if attempts >= item.max_attempts:
        raise HTTPException(409, "Bạn đã dùng hết số lần nộp bài.")
    submission = AssignmentSubmission(assignment_id=item.id, student_id=user.id,
                                      attempt=attempts + 1, content=content or None, repository_url=url)
    db.add(submission)
    await db.flush()
    return submission_data(submission)


@router.put("/{assignment_id}/submissions/{submission_id}/grade")
async def grade_submission(course_id: int, assignment_id: int, submission_id: int, payload: GradeInput,
                           user: User = Depends(require_instructor), db: AsyncSession = Depends(get_db)):
    await require_editor(db, user, course_id)
    item = await load_assignment(db, course_id, assignment_id)
    submission = await db.scalar(select(AssignmentSubmission).where(
        AssignmentSubmission.id == submission_id, AssignmentSubmission.assignment_id == item.id,
    ).with_for_update())
    if not submission:
        raise HTTPException(404, "Không tìm thấy bài nộp.")
    if payload.score > item.max_score:
        raise HTTPException(422, "Điểm vượt quá thang điểm bài tập.")
    record_change(db, user.id, "assignment.grade", "submission", submission.id,
                  previous=submission.score, current=payload.score)
    submission.score = payload.score
    submission.feedback = payload.feedback.strip() or None
    submission.graded_by = user.id
    submission.graded_at = datetime.now(timezone.utc)
    notify(db, submission.student_id, f"Đã có điểm bài tập: {item.title}", f"/courses/{course_id}#assignments")
    return submission_data(submission)
