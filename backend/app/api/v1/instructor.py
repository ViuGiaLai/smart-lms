from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_course_caches
from app.core.database import get_db
from app.core.security import get_current_active_user, require_instructor
from app.models.course import Course, CourseStatus
from app.models.user import User
from app.api.v1.courses import _format_course_dict
from app.schemas.course import CourseCreate, CourseUpdate
from app.services.course_service import CourseService

router = APIRouter(prefix="/instructor", tags=["Instructor"])


async def _owned_course_ids(db: AsyncSession, current_user: User) -> list[int]:
    """IDs của các khóa học mà giảng viên hiện tại được phép quản lý.

    Admin quản lý toàn bộ hệ thống; giảng viên chỉ thấy khóa học do mình phụ trách.
    Mọi truy vấn dữ liệu học viên/bài làm đều lọc theo tập ID này để bảo đảm
    quyền sở hữu (ownership) được kiểm tra ở backend, không dựa vào phía client.
    """
    from app.models.user import UserRole

    is_admin = (
        current_user.role == UserRole.admin
        or str(getattr(current_user.role, "value", current_user.role)) == "admin"
    )
    stmt = select(Course.id)
    if not is_admin:
        stmt = stmt.where(Course.instructor_id == current_user.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/dashboard")
async def get_instructor_dashboard(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Return live dashboard analytics for instructor directly from PostgreSQL."""
    from app.models.lesson import Lesson
    from app.models.quiz import Quiz, QuizSubmission
    from app.models.enrollment import Enrollment
    from app.models.user import UserRole

    is_admin = (
        current_user.role == UserRole.admin
        or str(getattr(current_user.role, "value", current_user.role)) == "admin"
    )
    inst_filter = True if is_admin else (Course.instructor_id == current_user.id)

    # 1. Khóa học của giảng viên
    c_res = await db.execute(select(Course).where(inst_filter))
    courses = c_res.scalars().all()
    course_count = len(courses)
    course_ids = [c.id for c in courses]
    published_count = sum(1 for course in courses if course.status == CourseStatus.published)

    # 2. Số lượng học viên đã ghi danh vào các khóa của giảng viên.
    # Dùng chung định nghĩa với trang /instructor/students (enrollment ∪ progress)
    # để hai nơi không hiển thị hai con số khác nhau.
    from app.services.enrollment_service import unique_students_for_courses

    if course_ids:
        student_count = await unique_students_for_courses(db, course_ids)
    else:
        student_count = 0

    if course_ids:
        submission_res = await db.execute(
            select(func.count(QuizSubmission.id))
            .join(Quiz, Quiz.id == QuizSubmission.quiz_id)
            .where(Quiz.course_id.in_(course_ids))
        )
        submission_count = submission_res.scalar() or 0
    else:
        submission_count = 0

    # 3. Đếm bài học và câu hỏi trắc nghiệm của các khóa học này
    if is_admin:
        les_res = await db.execute(select(func.count(Lesson.id)))
        quiz_res = await db.execute(select(func.count(Quiz.id)))
    elif course_ids:
        les_res = await db.execute(select(func.count(Lesson.id)).where(Lesson.course_id.in_(course_ids)))
        quiz_res = await db.execute(select(func.count(Quiz.id)).where(Quiz.course_id.in_(course_ids)))
    else:
        les_res = None
        quiz_res = None

    total_lessons = les_res.scalar() or 0 if les_res else 0
    total_quizzes = quiz_res.scalar() or 0 if quiz_res else 0

    # 4. Doanh thu chỉ tính từ các lượt ghi danh thực tế theo từng khóa
    revenue_res = await db.execute(
        select(func.coalesce(func.sum(Course.price), 0))
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Course.id.in_(course_ids))
        .where(Course.status == CourseStatus.published)
    ) if course_ids else None
    total_rev = float(revenue_res.scalar() or 0) if revenue_res else 0.0

    from datetime import datetime
    current_month = datetime.utcnow().strftime("T%m")

    return {
        "success": True,
        "data": {
            "totalCourses": course_count,
            "publishedCourses": published_count,
            "totalStudents": student_count,
            "totalSubmissions": submission_count,
            "totalRevenue": total_rev,
            "totalLessons": total_lessons,
            "totalQuizzes": total_quizzes,
            "averageRating": None,
            "totalReviews": 0,
            "monthlyRevenue": [
                {"month": current_month, "revenue": round(total_rev), "students": student_count},
            ],
        },
    }


@router.get("/courses")
async def get_instructor_courses(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Return courses taught by current instructor."""
    from app.models.user import UserRole
    stmt = (
        select(Course)
        .options(selectinload(Course.lessons), selectinload(Course.instructor))
        .order_by(Course.created_at.desc())
    )
    if current_user.role != UserRole.admin and str(current_user.role) != "admin":
        stmt = stmt.where(Course.instructor_id == current_user.id)

    result = await db.execute(stmt)
    courses = result.scalars().all()

    from app.models.enrollment import Enrollment
    course_ids = [course.id for course in courses]
    student_counts: dict[int, int] = {}
    if course_ids:
        count_res = await db.execute(
            select(Enrollment.course_id, func.count(func.distinct(Enrollment.user_id)))
            .where(Enrollment.course_id.in_(course_ids))
            .group_by(Enrollment.course_id)
        )
        student_counts = {course_id: count for course_id, count in count_res.all()}

    return {
        "success": True,
        "data": [
            _format_course_dict(c, total_students=student_counts.get(c.id, 0))
            for c in courses
        ],
    }


@router.get("/students")
async def get_instructor_students(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách học viên thực tế đã ghi danh vào các khóa học của giảng viên.

    Kèm tiến độ học tập và mốc hoạt động gần nhất, tính trực tiếp từ PostgreSQL.
    Quyền sở hữu được xác thực ở backend: chỉ trả dữ liệu thuộc khóa học do
    giảng viên phụ trách (Admin xem được toàn bộ hệ thống).
    """
    from app.models.enrollment import Enrollment
    from app.models.lesson import Lesson
    from app.models.progress import Progress

    owned_ids = await _owned_course_ids(db, current_user)
    if not owned_ids:
        return {
            "success": True,
            "data": {
                "students": [],
                "courses": [],
                "summary": {"totalEnrollments": 0, "uniqueStudents": 0, "totalCourses": 0},
            },
        }

    c_res = await db.execute(
        select(Course).where(Course.id.in_(owned_ids)).order_by(Course.title)
    )
    courses = c_res.scalars().all()
    course_titles = {c.id: c.title for c in courses}

    # Ghi danh thực tế (nguồn sự thật cho "đã đăng ký khóa học").
    e_res = await db.execute(
        select(Enrollment.course_id, Enrollment.user_id, Enrollment.enrolled_at).where(
            Enrollment.course_id.in_(owned_ids)
        )
    )
    enrolled_at_map: dict[tuple[int, int], Any] = {}
    for cid, uid, enrolled_at in e_res.all():
        enrolled_at_map[(cid, uid)] = enrolled_at

    # Vài tài khoản học viên cũ chỉ có Progress mà chưa có Enrollment, vẫn tính là đang học
    # (đồng nhất với cách đếm "Tổng sinh viên" trên bảng điều khiển).
    p_pair_res = await db.execute(
        select(Lesson.course_id, Progress.user_id)
        .join(Progress, Progress.lesson_id == Lesson.id)
        .where(Lesson.course_id.in_(owned_ids))
        .distinct()
    )
    pairs = set(enrolled_at_map.keys()) | {(cid, uid) for cid, uid in p_pair_res.all()}

    if not pairs:
        return {
            "success": True,
            "data": {
                "students": [],
                "courses": [{"id": str(c.id), "title": c.title} for c in courses],
                "summary": {"totalEnrollments": 0, "uniqueStudents": 0, "totalCourses": len(courses)},
            },
        }

    user_ids = {uid for _, uid in pairs}
    u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in u_res.scalars().all()}

    lesson_res = await db.execute(
        select(Lesson.id, Lesson.course_id).where(Lesson.course_id.in_(owned_ids))
    )
    lesson_course: dict[int, int] = {}
    total_lessons: dict[int, int] = {cid: 0 for cid in owned_ids}
    for lesson_id, cid in lesson_res.all():
        lesson_course[lesson_id] = cid
        total_lessons[cid] = total_lessons.get(cid, 0) + 1

    prog_res = await db.execute(
        select(
            Progress.lesson_id,
            Progress.user_id,
            Progress.is_completed,
            Progress.updated_at,
            Progress.started_at,
        )
        .join(Lesson, Lesson.id == Progress.lesson_id)
        .where(Lesson.course_id.in_(owned_ids))
    )
    completed_map: dict[tuple[int, int], int] = {}
    last_activity_map: dict[tuple[int, int], Any] = {}
    first_start_map: dict[tuple[int, int], Any] = {}
    for lesson_id, uid, is_completed, updated_at, started_at in prog_res.all():
        cid = lesson_course.get(lesson_id)
        if cid is None or uid not in user_ids:
            continue
        key = (cid, uid)
        if is_completed:
            completed_map[key] = completed_map.get(key, 0) + 1
        if updated_at is not None and (key not in last_activity_map or updated_at > last_activity_map[key]):
            last_activity_map[key] = updated_at
        if started_at is not None and (key not in first_start_map or started_at < first_start_map[key]):
            first_start_map[key] = started_at

    rows = []
    for cid, uid in pairs:
        student = users.get(uid)
        if student is None or cid not in course_titles:
            continue
        total = total_lessons.get(cid, 0)
        done = completed_map.get((cid, uid), 0)
        enrolled_at = enrolled_at_map.get((cid, uid))
        started_at = first_start_map.get((cid, uid))
        last_seen = last_activity_map.get((cid, uid))
        rows.append(
            {
                "studentId": str(uid),
                "name": student.name,
                "email": student.email,
                "avatarUrl": student.avatar_url,
                "courseId": str(cid),
                "courseTitle": course_titles[cid],
                "progress": round((done / total) * 100, 1) if total else 0.0,
                "completedLessons": done,
                "totalLessons": total,
                # enrolledAt đến từ bảng enrollments; nếu học viên cũ chưa có bản ghi
                # ghi danh thì dùng mốc bắt đầu học đầu tiên từ Progress để không hiển thị sai.
                "enrolledAt": enrolled_at.isoformat() if enrolled_at else None,
                "startedAt": started_at.isoformat() if started_at else None,
                "lastActivityAt": last_seen.isoformat() if last_seen else None,
            }
        )

    rows.sort(key=lambda r: (r["courseTitle"].lower(), r["name"].lower()))

    return {
        "success": True,
        "data": {
            "students": rows,
            "courses": [{"id": str(c.id), "title": c.title} for c in courses],
            "summary": {
                "totalEnrollments": len(rows),
                "uniqueStudents": len({r["studentId"] for r in rows}),
                "totalCourses": len(courses),
            },
        },
    }


@router.get("/submissions")
async def get_instructor_submissions(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Bài nộp & kết quả trắc nghiệm thuộc các khóa học giảng viên được phép quản lý.

    Quyền sở hữu được kiểm tra ở backend: chỉ gom bài nộp của quiz thuộc khóa học
    do giảng viên phụ trách (Admin xem được toàn bộ hệ thống).
    """
    from app.models.quiz import Quiz, QuizSubmission

    owned_ids = await _owned_course_ids(db, current_user)
    if not owned_ids:
        return {
            "success": True,
            "data": {
                "submissions": [],
                "quizzes": [],
                "summary": {"totalSubmissions": 0, "uniqueStudents": 0, "passedSubmissions": 0, "averageScore": 0},
            },
        }

    c_res = await db.execute(select(Course).where(Course.id.in_(owned_ids)))
    courses = c_res.scalars().all()
    course_titles = {c.id: c.title for c in courses}

    q_res = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.course_id.in_(owned_ids))
        .order_by(Quiz.title)
    )
    quizzes = q_res.scalars().all()
    quiz_map = {q.id: q for q in quizzes}
    quiz_options = [
        {
            "id": str(q.id),
            "title": q.title,
            "courseId": str(q.course_id),
            "courseTitle": course_titles.get(q.course_id, f"Khóa học #{q.course_id}"),
        }
        for q in quizzes
    ]

    if not quiz_map:
        return {
            "success": True,
            "data": {
                "submissions": [],
                "quizzes": [],
                "summary": {"totalSubmissions": 0, "uniqueStudents": 0, "passedSubmissions": 0, "averageScore": 0},
            },
        }

    s_res = await db.execute(
        select(QuizSubmission)
        .where(QuizSubmission.quiz_id.in_(list(quiz_map.keys())))
        .order_by(QuizSubmission.submitted_at.desc())
    )
    submissions = s_res.scalars().all()

    user_ids = {s.user_id for s in submissions}
    users: dict[int, User] = {}
    if user_ids:
        u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in u_res.scalars().all()}

    rows = []
    for submission in submissions:
        quiz = quiz_map.get(submission.quiz_id)
        if quiz is None:
            continue
        student = users.get(submission.user_id)
        total_q = len(quiz.questions or [])
        score = float(submission.score or 0)
        rows.append(
            {
                "id": str(submission.id),
                "studentId": str(submission.user_id),
                "studentName": student.name if student else "Học viên",
                "studentEmail": student.email if student else "",
                "quizId": str(submission.quiz_id),
                "quizTitle": quiz.title,
                "courseId": str(quiz.course_id),
                "courseTitle": course_titles.get(quiz.course_id, f"Khóa học #{quiz.course_id}"),
                "score": round(score * 100, 1),
                "passed": bool(submission.passed),
                "correctCount": round(score * total_q) if total_q else 0,
                "totalQuestions": total_q,
                "timeSpent": submission.time_spent,
                "submittedAt": submission.submitted_at.isoformat() if submission.submitted_at else None,
            }
        )

    return {
        "success": True,
        "data": {
            "submissions": rows,
            "quizzes": quiz_options,
            "summary": {
                "totalSubmissions": len(rows),
                "uniqueStudents": len({r["studentId"] for r in rows}),
                "passedSubmissions": sum(1 for r in rows if r["passed"]),
                "averageScore": round(sum(r["score"] for r in rows) / len(rows), 1) if rows else 0,
            },
        },
    }


@router.get("/materials")
async def get_instructor_materials(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Chương/bài học kèm trạng thái học liệu đã số hóa cho RAG (pgvector).

    Chỉ trả các khóa học do giảng viên phụ trách. Số chunk được đọc từ bảng
    `document_chunks` do AI Service quản lý; nếu bảng chưa tồn tại thì coi như
    chưa có học liệu thay vì bịa trạng thái.
    """
    owned_ids = await _owned_course_ids(db, current_user)
    if not owned_ids:
        return {
            "success": True,
            "data": {"courses": [], "summary": {"totalCourses": 0, "totalLessons": 0, "indexedLessons": 0}},
        }

    c_res = await db.execute(
        select(Course)
        .options(selectinload(Course.lessons))
        .where(Course.id.in_(owned_ids))
        .order_by(Course.created_at.desc())
    )
    courses = c_res.scalars().all()

    chunk_counts: dict[int, int] = {}
    try:
        chunk_res = await db.execute(
            text("SELECT lesson_id, count(*) FROM document_chunks GROUP BY lesson_id")
        )
        for lesson_id, count in chunk_res.all():
            if lesson_id is not None:
                chunk_counts[int(lesson_id)] = int(count)
    except Exception:
        # Bảng vector do AI Service tạo; nếu chưa có thì học liệu RAG chưa được lập chỉ mục.
        chunk_counts = {}

    courses_payload: list[dict[str, Any]] = []
    total_lessons = 0
    indexed_lessons = 0
    for course in courses:
        lessons_payload: list[dict[str, Any]] = []
        for lesson in sorted(course.lessons or [], key=lambda item: (item.order_index or 0, item.id)):
            chunks = chunk_counts.get(lesson.id, 0)
            total_lessons += 1
            if chunks > 0:
                indexed_lessons += 1
            lessons_payload.append(
                {
                    "id": str(lesson.id),
                    "title": lesson.title,
                    "order": lesson.order_index,
                    "duration": lesson.duration or 0,
                    "videoUrl": lesson.video_url or "",
                    "resourcesUrl": lesson.resources_url or "",
                    "hasTranscript": bool((lesson.transcript or "").strip()),
                    "chunkCount": chunks,
                    "hasMaterial": chunks > 0,
                }
            )
        courses_payload.append(
            {
                "id": str(course.id),
                "title": course.title,
                "status": course.status.value if hasattr(course.status, "value") else str(course.status),
                "totalLessons": len(lessons_payload),
                "indexedLessons": sum(1 for item in lessons_payload if item["hasMaterial"]),
                "lessons": lessons_payload,
            }
        )

    return {
        "success": True,
        "data": {
            "courses": courses_payload,
            "summary": {
                "totalCourses": len(courses_payload),
                "totalLessons": total_lessons,
                "indexedLessons": indexed_lessons,
            },
        },
    }


@router.get("/quizzes")
async def get_instructor_quizzes(
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách tất cả đề thi trong ngân hàng đề thuộc các khóa học của giảng viên hiện tại."""
    from app.models.quiz import Quiz, QuizQuestion
    from app.models.user import UserRole

    is_admin = current_user.role == UserRole.admin or str(getattr(current_user.role, "value", current_user.role)) == "admin"

    # Lấy danh sách khóa học của giảng viên này
    c_stmt = select(Course)
    if not is_admin:
        c_stmt = c_stmt.where(Course.instructor_id == current_user.id)
    c_res = await db.execute(c_stmt)
    courses = c_res.scalars().all()
    course_map = {c.id: c.title for c in courses}
    course_ids = list(course_map.keys())

    if not course_ids:
        return {"success": True, "data": []}

    # Lấy toàn bộ đề thi kèm câu hỏi
    q_stmt = (
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.course_id.in_(course_ids))
        .order_by(Quiz.id.desc())
    )
    q_res = await db.execute(q_stmt)
    quizzes = q_res.scalars().all()

    formatted = []
    for q in quizzes:
        created_str = q.created_at.strftime("%d/%m/%Y %H:%M") if hasattr(q, "created_at") and q.created_at else ""
        formatted.append({
            "id": q.id,
            "courseId": str(q.course_id),
            "lessonId": str(q.lesson_id) if q.lesson_id is not None else None,
            "courseTitle": course_map.get(q.course_id, f"Khóa học #{q.course_id}"),
            "title": q.title,
            "description": q.description or "",
            "timeLimit": q.time_limit or 900,
            "passScore": q.pass_score or 0.6,
            "totalQuestions": len(q.questions) if q.questions else 0,
            "isAiGenerated": q.is_ai_generated,
            "createdAt": created_str,
            "questions": [
                {
                    "id": q_item.id,
                    "questionNumber": q_item.order_index or (idx + 1),
                    "questionText": q_item.question_text,
                    "options": q_item.options,
                    "correctAnswer": q_item.correct_answer,
                    "explanation": q_item.explanation or "",
                }
                for idx, q_item in enumerate(q.questions or [])
            ],
        })

    return {
        "success": True,
        "data": formatted,
    }


@router.post("/courses/{course_id}/sections")
async def create_section(
    course_id: int,
    data: dict[str, Any],
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a course section."""
    from app.models.user import UserRole
    c_res = await db.execute(select(Course).where(Course.id == course_id))
    course = c_res.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    is_admin = current_user.role == UserRole.admin or getattr(current_user.role, "value", str(current_user.role)) == "admin"
    if not is_admin and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền quản lý khóa học này")

    return {
        "success": True,
        "message": "Tạo chương học thành công",
        "data": {
            "id": f"sec-{course_id}-{data.get('order', 1)}",
            "title": data.get("title", "Chương mới"),
            "order": data.get("order", 1),
            "lessons": [],
        },
    }


@router.post("/courses/{course_id}/sections/{section_id}/lessons")
async def create_lesson(
    course_id: int,
    section_id: str,
    data: dict[str, Any] | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a lesson in a section and persist into PostgreSQL."""
    from app.models.lesson import Lesson
    from app.models.user import UserRole

    data = data or {}

    c_res = await db.execute(select(Course).where(Course.id == course_id))
    course = c_res.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Khóa học không tồn tại")

    is_admin = current_user.role == UserRole.admin or getattr(current_user.role, "value", str(current_user.role)) == "admin"
    if not is_admin and course.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền quản lý khóa học này")

    order = int(data.get("order", data.get("order_index", 1)))
    duration = int(data.get("duration", 0))

    lesson = Lesson(
        course_id=course_id,
        title=data.get("title", "Bài học mới"),
        description=data.get("description"),
        video_url=data.get("video_url") or data.get("videoUrl"),
        duration=duration,
        order_index=order,
        transcript=data.get("transcript"),
        resources_url=data.get("resources_url"),
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    await invalidate_course_caches()

    return {
        "success": True,
        "message": "Tạo bài học thành công và đã lưu vào cơ sở dữ liệu PostgreSQL",
        "data": {
            "id": str(lesson.id),
            "title": lesson.title,
            "order": lesson.order_index,
            "duration": lesson.duration,
            "videoUrl": lesson.video_url,
            "video_url": lesson.video_url,
            "transcript": lesson.transcript,
            "resources_url": lesson.resources_url,
            "isFree": lesson.order_index == 1,
        },
    }


@router.post("/courses", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_course_instructor(
    payload: CourseCreate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Create a new course (instructor/admin only)."""
    course = await CourseService.create(db, payload, instructor_id=current_user.id)
    await db.commit()
    await invalidate_course_caches()
    return {
        "success": True,
        "message": "Tạo khóa học thành công",
        "data": {"id": str(course.id), "slug": course.slug, "title": course.title, "status": course.status.value if hasattr(course.status, "value") else str(course.status)},
    }


@router.patch("/courses/{course_id}", response_model=dict)
async def update_course_instructor(
    course_id: int,
    payload: CourseUpdate,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Update a course. Instructors can only update their own courses."""
    course = await CourseService.update(db, course_id, payload, current_user)
    await db.commit()
    await invalidate_course_caches()
    return {
        "success": True,
        "message": "Cập nhật khóa học thành công",
        "data": {"id": str(course.id), "slug": course.slug, "title": course.title, "status": course.status.value if hasattr(course.status, "value") else str(course.status)},
    }


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_instructor(
    course_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (archive) a course."""
    await CourseService.delete(db, course_id, current_user)
    await db.commit()
    await invalidate_course_caches()
    return


@router.post("/courses/{course_id}/publish", response_model=dict)
async def publish_course_instructor(
    course_id: int,
    current_user: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    """Publish a draft course."""
    course = await CourseService.change_status(db, course_id, CourseStatus.published, current_user)
    await db.commit()
    await invalidate_course_caches()
    return {
        "success": True,
        "message": "Xuất bản khóa học thành công",
        "data": {"id": str(course.id), "status": course.status.value if hasattr(course.status, "value") else str(course.status)},
    }
