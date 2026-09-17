"""Notification helper utilities."""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .. import models, schemas
from . import audit_logger
from ..integrations import trigger_n8n_event


def create_notification(
    db: Session,
    *,
    user_id: str,
    notification_type: models.NotificationTypeEnum,
    message: str,
    title: Optional[str] = None,
    body: Optional[str] = None,
    entity_type: Optional[models.NotificationEntityTypeEnum] = None,
    entity_id: Optional[str] = None,
    deep_link: Optional[str] = None,
    related_task_id: Optional[str] = None,
    related_reward_id: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> models.Notification:
    notification = models.Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        body=body,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        deep_link=deep_link,
        related_task_id=related_task_id,
        related_reward_id=related_reward_id,
        created_at=datetime.utcnow(),
    )
    db.add(notification)
    db.flush()
    payload = schemas.NotificationRead.model_validate(notification).model_dump()
    trigger_n8n_event("notification.created", payload)
    audit_logger.log_event(
        audit_logger.AuditLogInput(
            action="NOTIFICATION_SENT",
            category=models.AuditLogCategoryEnum.NOTIFICATION,
            actor_id=str(actor_id) if actor_id else None,
            actor_role=None,
            entity_type="notification",
            entity_id=str(notification.id),
            target_user_id=str(user_id),
            source=models.AuditLogSourceEnum.AUTOMATION,
            metadata={
                "type": notification_type.value,
                "entity_type": entity_type.value if entity_type else None,
                "entity_id": entity_id,
                "deep_link": deep_link,
            },
        )
    )
    return notification
