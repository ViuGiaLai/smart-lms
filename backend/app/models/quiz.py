from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)  # seconds
    pass_score: Mapped[float] = mapped_column(Float, default=0.6, nullable=False)  # 0.0 – 1.0
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─
    course: Mapped["Course"] = relationship("Course", back_populates="quizzes")  # noqa: F821
    questions: Mapped[list["QuizQuestion"]] = relationship(
        "QuizQuestion", back_populates="quiz", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["QuizSubmission"]] = relationship(
        "QuizSubmission", back_populates="quiz", cascade="all, delete-orphan"
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    # options stored as JSON list of {"key": "A", "text": "..."}
    options: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    correct_answer: Mapped[str] = mapped_column(String(10), nullable=False)  # "A", "B", "C", "D"
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="questions")


class QuizSubmission(Base):
    __tablename__ = "quiz_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # answers: {"question_id": "selected_key"}
    answers: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0.0 – 1.0
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    time_spent: Mapped[int | None] = mapped_column(Integer, nullable=True)  # seconds

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="submissions")
    user: Mapped["User"] = relationship("User", back_populates="quiz_submissions")  # noqa: F821
