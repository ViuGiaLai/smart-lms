from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def notify(db: AsyncSession, user_id: int, title: str, href: str) -> None:
    db.add(Notification(user_id=user_id, title=title[:240], href=href))


@router.get("")
async def inbox(before: int | None = Query(None, gt=0), user: User = Depends(get_current_active_user),
                db: AsyncSession = Depends(get_db)):
    query = select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc()).limit(26)
    if before is not None:
        query = query.where(Notification.id < before)
    entries = list(await db.scalars(query))
    return {"data": [{"id": row.id, "title": row.title, "href": row.href,
                      "read": row.read_at is not None, "createdAt": row.created_at} for row in entries[:25]],
            "nextBefore": entries[24].id if len(entries) > 25 else None}


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == user.id, Notification.read_at.is_(None),
    ))
    return {"count": count}


@router.post("/read-all")
async def read_all(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None),
    ).values(read_at=datetime.now(timezone.utc)))
    return {"success": True}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: int, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Không tìm thấy thông báo.")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
    return {"success": True}
