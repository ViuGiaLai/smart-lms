from decimal import Decimal
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.checkout import DemoOrder, DemoPayment
from app.models.course import Course, CourseStatus
from app.models.user import User, UserRole
from app.services.enrollment_service import enrolled_course_ids, ensure_enrollment
from app.services.audit_service import record_change
from app.api.v1.notifications import notify

router = APIRouter(prefix="/checkout", tags=["Demo checkout"])


async def require_demo_student(user: User = Depends(get_current_active_user)) -> User:
    if not settings.demo_checkout_enabled:
        raise HTTPException(status_code=404, detail="Thanh toán Demo chưa được bật.")
    if user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Chỉ học viên có thể ghi danh.")
    return user


class DemoConfirmation(BaseModel):
    method: Literal["momo_demo", "vnpay_demo", "bank_demo"]
    outcome: Literal["success", "failed", "cancelled"]
    expected_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


@router.post("/courses/{course_id}")
async def create_order(course_id: int, user: User = Depends(require_demo_student), db: AsyncSession = Depends(get_db)):
    course = await db.get(Course, course_id)
    if course is None or course.is_internal or course.status != CourseStatus.published or course.price <= 0:
        raise HTTPException(status_code=404, detail="Khóa học không có trong danh mục thanh toán.")
    if course_id in await enrolled_course_ids(db, user.id):
        return {"enrolled": True}
    await db.execute(insert(DemoOrder).values(
        id=uuid4().hex, user_id=user.id, course_id=course_id, amount=course.price, status="pending",
    ).on_conflict_do_nothing(index_elements=[DemoOrder.user_id, DemoOrder.course_id]))
    order = (await db.execute(select(DemoOrder).where(
        DemoOrder.user_id == user.id, DemoOrder.course_id == course_id,
    ).with_for_update())).scalar_one()
    if order.status == "paid":
        return {"enrolled": True}
    order.amount = course.price
    return {"orderId": order.id, "amount": str(order.amount), "title": course.title, "enrolled": False}


@router.post("/orders/{order_id}/confirm")
async def confirm_order(order_id: str, payload: DemoConfirmation, user: User = Depends(require_demo_student), db: AsyncSession = Depends(get_db)):
    order = (await db.execute(select(DemoOrder).where(
        DemoOrder.id == order_id, DemoOrder.user_id == user.id,
    ).with_for_update())).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng.")
    if order.status == "paid":
        return {"status": "paid"}
    course = await db.get(Course, order.course_id, with_for_update=True)
    if (
        course is None or course.is_internal or course.status != CourseStatus.published or course.price <= 0
        or course.price != order.amount or payload.expected_amount != order.amount
    ):
        raise HTTPException(status_code=409, detail="Khóa học hoặc giá đã thay đổi. Hãy tải lại trang thanh toán.")
    if course.id in await enrolled_course_ids(db, user.id):
        return {"status": "enrolled"}

    payment_id = uuid4().hex
    db.add(DemoPayment(
        id=payment_id, order_id=order.id, amount=order.amount, method=payload.method, status=payload.outcome,
    ))
    record_change(db, user.id, "checkout.demo", "payment", payment_id, orderId=order.id, outcome=payload.outcome)
    if payload.outcome == "success":
        await ensure_enrollment(db, user.id, course.id)
        order.status = "paid"
        notify(db, user.id, f"Đã ghi danh qua thanh toán Demo: {course.title}", f"/courses/{course.id}")
    await db.commit()
    return {"status": order.status if payload.outcome == "success" else payload.outcome}


@router.get("/history")
async def payment_history(user: User = Depends(require_demo_student), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(DemoPayment, Course.title)
        .join(DemoOrder, DemoOrder.id == DemoPayment.order_id)
        .join(Course, Course.id == DemoOrder.course_id)
        .where(DemoOrder.user_id == user.id)
        .order_by(DemoPayment.created_at.desc(), DemoPayment.id.desc()).limit(50)
    )).all()
    return {"data": [
        {"id": payment.id, "title": title, "amount": str(payment.amount), "method": payment.method,
         "status": payment.status, "createdAt": payment.created_at}
        for payment, title in rows
    ]}
