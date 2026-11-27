from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


def record_change(
    db: AsyncSession, actor_id: int, action: str, target_type: str, target_id: str | int, **details,
) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, target_type=target_type,
                    target_id=str(target_id), details=details))
