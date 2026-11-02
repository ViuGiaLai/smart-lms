from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EducationLevel(Base):
    """
    Bậc học và trình độ đào tạo đại học (Trường Đại học Đông Á):
    - GENERAL (Kiến thức Đại cương: Năm 1 - 2)
    - FOUNDATION (Cơ sở ngành: Năm 2 - 3)
    - MAJOR (Chuyên ngành: Năm 3 - 4)
    - CAPSTONE (Đồ án & Khóa luận tốt nghiệp: Năm cuối)
    - CERTIFICATION (Chuẩn đầu ra & Chứng chỉ nghề: TOEIC/IELTS, Tin học, AWS/Cisco)
    - POSTGRADUATE (Sau đại học & Nghiên cứu khoa học)
    """
    __tablename__ = "education_levels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Courses in this education level
    courses: Mapped[list["Course"]] = relationship(  # noqa: F821
        "Course", back_populates="education_level_rel"
    )

    def __repr__(self) -> str:
        return f"<EducationLevel id={self.id} code={self.code!r} name={self.name!r}>"
