from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AiMessageFeedback(Base):
    """Đánh giá của người học cho một câu trả lời của Trợ lý AI.

    Mỗi người chỉ đánh giá một lần cho mỗi tin nhắn; gửi lại sẽ cập nhật lựa
    chọn cũ. Dữ liệu dùng để đo chất lượng câu trả lời và phát hiện các chủ đề
    học liệu chưa đủ tốt, không dùng để xếp hạng cá nhân.
    """

    __tablename__ = "ai_message_feedback"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_ai_feedback_message_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: Mapped[str] = mapped_column(String(8), nullable=False)  # up | down
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AiMessageFeedback message={self.message_id} user={self.user_id} rating={self.rating}>"
