import json
import logging
from datetime import datetime, timedelta
from threading import Lock
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
_recent_task_created_pushes: dict[str, datetime] = {}
_recent_task_created_pushes_lock = Lock()
_TASK_CREATED_PUSH_DEDUP_TTL_SECONDS = 90

try:
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - optional dependency in some environments
    WebPushException = Exception  # type: ignore[assignment]
    webpush = None  # type: ignore[assignment]


def is_available() -> bool:
    return bool(
        webpush
        and settings.vapid_public_key
        and settings.vapid_private_key
        and settings.vapid_subject
    )


def _vapid_claims() -> dict[str, str]:
    return {"sub": settings.vapid_subject}


def _resolve_push_url(*, deep_link: Optional[str], related_task_id: Optional[str], user: models.User) -> str:
    if deep_link:
        return deep_link
    if related_task_id:
        if user.role in {models.RoleEnum.ADMIN, models.RoleEnum.MANAGER, models.RoleEnum.OWNER}:
            return f"/admin/tasks/{related_task_id}"
        return f"/dashboard/tasks/{related_task_id}"
    return "/tasks"


def _should_skip_task_created_duplicate(
    *,
    user_id: str,
    event_type: Optional[str],
    related_task_id: Optional[str],
) -> bool:
    """Prevent duplicate push dispatches for the same task.created event."""
    if event_type != "task.created" or not related_task_id:
        return False

    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=_TASK_CREATED_PUSH_DEDUP_TTL_SECONDS)
    dedup_key = f"{user_id}:{related_task_id}:{event_type}"

    with _recent_task_created_pushes_lock:
        stale_keys = [key for key, ts in _recent_task_created_pushes.items() if ts < cutoff]
        for key in stale_keys:
            _recent_task_created_pushes.pop(key, None)

        if dedup_key in _recent_task_created_pushes:
            logger.info(
                "Skipping duplicate browser push for task.created (user_id=%s, task_id=%s)",
                user_id,
                related_task_id,
            )
            return True

        _recent_task_created_pushes[dedup_key] = now
        return False


def _send_to_subscription(subscription: models.BrowserPushSubscription, payload: dict[str, Any]) -> tuple[bool, bool]:
    """Returns (successfully_sent, should_be_pruned)"""
    if not is_available():
        print(f"DEBUG: Push not available! webpush={bool(webpush)}, pub={bool(settings.vapid_public_key)}, priv={bool(settings.vapid_private_key)}, sub={bool(settings.vapid_subject)}")
        return False, False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=_vapid_claims(),
            ttl=300,
        )
        return True, False
    except WebPushException as exc:  # pragma: no cover - depends on provider response
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        print(f"DEBUG: WebPushException status={status_code}, error={exc}")
        if status_code in {404, 410}:
            logger.info("Push subscription expired, pruning endpoint")
            return False, True
        else:
            logger.warning("Browser push failed for endpoint: %s", exc)
            return False, False
    except Exception as exc:  # pragma: no cover - safety net
        print(f"DEBUG: unexpected push error: {exc}")
        logger.warning("Browser push send failed: %s", exc)
        return False, False


def send_to_user(
    db: Session,
    *,
    user_id: str,
    title: str,
    body: str,
    related_task_id: Optional[str] = None,
    deep_link: Optional[str] = None,
    tag: Optional[str] = None,
    event_type: Optional[str] = None,
) -> int:
    if _should_skip_task_created_duplicate(
        user_id=str(user_id),
        event_type=event_type,
        related_task_id=related_task_id,
    ):
        return 0

    user = db.get(models.User, user_id)
    if not user:
        print(f"DEBUG: send_to_user - user {user_id} not found")
        return 0
    if not user.browser_notifications_enabled:
        print(f"DEBUG: send_to_user - user {user_id} notifications disabled")
        return 0
    
    subscriptions = db.execute(
        select(models.BrowserPushSubscription)
        .where(models.BrowserPushSubscription.user_id == user_id)
        .order_by(
            models.BrowserPushSubscription.updated_at.desc(),
            models.BrowserPushSubscription.created_at.desc(),
        )
    ).scalars().all()
    
    if not subscriptions:
        print(f"DEBUG: send_to_user - user {user_id} has 0 subscriptions in DB")
        return 0

    payload: dict[str, Any] = {
        "taskId": related_task_id,
        "title": title,
        "body": body,
        "url": _resolve_push_url(deep_link=deep_link, related_task_id=related_task_id, user=user),
        "deep_link": deep_link,
        "related_task_id": related_task_id,
        "tag": tag or event_type or "task-update",
        "event_type": event_type or "push.test",
        "silent": False,
    }

    sent = 0
    stale_ids: list[str] = []
    # Send at most one push notification per event/user.
    for subscription in subscriptions:
        success, prune = _send_to_subscription(subscription, payload)
        if success:
            sent = 1
            break
        if prune:
            stale_ids.append(subscription.id)

    if stale_ids:
        print(f"DEBUG: pruning {len(stale_ids)} stale subscriptions")
        stale_rows = db.execute(
            select(models.BrowserPushSubscription).where(
                models.BrowserPushSubscription.id.in_(stale_ids)
            )
        ).scalars().all()
        for row in stale_rows:
            db.delete(row)
        db.commit()
    return sent


def send_to_users(
    db: Session,
    *,
    user_ids: Iterable[str],
    title: str,
    body: str,
    related_task_id: Optional[str] = None,
    deep_link: Optional[str] = None,
    tag: Optional[str] = None,
    event_type: Optional[str] = None,
) -> int:
    sent = 0
    for user_id in {str(item) for item in user_ids if item}:
        sent += send_to_user(
            db,
            user_id=user_id,
            title=title,
            body=body,
            related_task_id=related_task_id,
            deep_link=deep_link,
            tag=tag,
            event_type=event_type,
        )
    return sent
