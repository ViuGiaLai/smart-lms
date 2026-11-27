from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from app.core.database import get_db
from app.core.security import require_instructor
from app.models.course import Course, CourseStatus
from app.models.course_section import CourseSection
from app.models.lesson import Lesson
from app.models.user import User, UserRole
from app.services.audit_service import record_change
from app.services.enrollment_service import ensure_enrollment

router = APIRouter(prefix="/courses/{course_id}/curriculum", tags=["Curriculum"])
SectionTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]


class SectionInput(BaseModel):
    title: SectionTitle


class SectionPlacement(BaseModel):
    sectionId: int | None
    lessonIds: list[int] = Field(max_length=10000)


class CurriculumOrder(BaseModel):
    sections: list[SectionPlacement] = Field(max_length=1000)


class InviteStudent(BaseModel):
    email: EmailStr


async def curriculum_sections(db: AsyncSession, course_id: int) -> list[CourseSection]:
    rows = await db.scalars(select(CourseSection).where(CourseSection.course_id == course_id)
                            .order_by(CourseSection.order_index, CourseSection.id))
    return list(rows)


async def require_editor(db: AsyncSession, user: User, course_id: int) -> Course:
    course = await db.get(Course, course_id, with_for_update=True)
    if not course:
        raise HTTPException(404, "Không tìm thấy khóa học.")
    if user.role != UserRole.admin and course.instructor_id != user.id:
        raise HTTPException(403, "Bạn không có quyền sửa giáo trình này.")
    if course.status == CourseStatus.in_review:
        raise HTTPException(409, "Hãy rút yêu cầu duyệt trước khi chỉnh sửa giáo trình.")
    return course


@router.post("/enrollments")
async def enroll_internal_student(course_id: int, payload: InviteStudent,
                                  user: User = Depends(require_instructor), db: AsyncSession = Depends(get_db)):
    course = await require_editor(db, user, course_id)
    if not course.is_internal or course.status != CourseStatus.published:
        raise HTTPException(409, "Chỉ có thể ghi danh vào khóa nội bộ đã xuất bản.")
    student = await db.scalar(select(User).where(
        func.lower(User.email) == payload.email.lower(), User.role == UserRole.student, User.is_active.is_(True),
    ).order_by(User.id).limit(1))
    if not student:
        raise HTTPException(404, "Không tìm thấy tài khoản học viên đang hoạt động.")
    enrollment = await ensure_enrollment(db, student.id, course_id)
    record_change(db, user.id, "course.enroll", "course", course_id, studentId=student.id)
    return {"enrollmentId": enrollment.id}


@router.post("/sections", status_code=201)
async def add_section(course_id: int, payload: SectionInput, user: User = Depends(require_instructor),
                      db: AsyncSession = Depends(get_db)):
    await require_editor(db, user, course_id)
    sections = await curriculum_sections(db, course_id)
    section = CourseSection(course_id=course_id, title=payload.title,
                            order_index=sections[-1].order_index + 1 if sections else 1)
    db.add(section)
    await db.flush()
    return {"id": section.id, "title": section.title}


@router.put("/sections/{section_id}")
async def rename_section(course_id: int, section_id: int, payload: SectionInput,
                         user: User = Depends(require_instructor), db: AsyncSession = Depends(get_db)):
    await require_editor(db, user, course_id)
    section = await db.get(CourseSection, section_id)
    if not section or section.course_id != course_id:
        raise HTTPException(404, "Không tìm thấy chương.")
    section.title = payload.title
    return {"id": section.id, "title": section.title}


@router.delete("/sections/{section_id}")
async def remove_section(course_id: int, section_id: int, user: User = Depends(require_instructor),
                         db: AsyncSession = Depends(get_db)):
    await require_editor(db, user, course_id)
    section = await db.get(CourseSection, section_id)
    if not section or section.course_id != course_id:
        raise HTTPException(404, "Không tìm thấy chương.")
    lessons = list(await db.scalars(select(Lesson).where(Lesson.course_id == course_id)
                                    .order_by(Lesson.order_index, Lesson.id)))
    for position, lesson in enumerate(sorted(lessons, key=lambda item: item.section_id == section.id), start=1):
        lesson.order_index = position
        if lesson.section_id == section.id:
            lesson.section_id = None
    await db.delete(section)
    return {"id": section_id}


@router.put("/order")
async def save_order(course_id: int, payload: CurriculumOrder, user: User = Depends(require_instructor),
                     db: AsyncSession = Depends(get_db)):
    await require_editor(db, user, course_id)
    sections = {section.id: section for section in await curriculum_sections(db, course_id)}
    lessons = {lesson.id: lesson for lesson in await db.scalars(select(Lesson).where(Lesson.course_id == course_id))}
    section_ids = [entry.sectionId for entry in payload.sections]
    lesson_ids = [lesson_id for entry in payload.sections for lesson_id in entry.lessonIds]
    if len(section_ids) != len(set(section_ids)) or set(section_ids) != {*sections, None}:
        raise HTTPException(409, "Danh sách chương đã thay đổi. Hãy tải lại giáo trình.")
    if len(lesson_ids) != len(set(lesson_ids)) or set(lesson_ids) != set(lessons):
        raise HTTPException(409, "Danh sách bài học đã thay đổi. Hãy tải lại giáo trình.")
    lesson_index = 1
    for index, entry in enumerate(sorted(payload.sections, key=lambda entry: entry.sectionId is None), start=1):
        if entry.sectionId is not None:
            sections[entry.sectionId].order_index = index
        for lesson_id in entry.lessonIds:
            lesson = lessons[lesson_id]
            lesson.section_id = entry.sectionId
            lesson.order_index = lesson_index
            lesson_index += 1
    return {"saved": True}
