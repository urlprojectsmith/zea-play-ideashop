from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..dependencies import get_current_active_user
from ..services import browser_push as browser_push_service

router = APIRouter(prefix="/push", tags=["browser-push"])
settings = get_settings()

def _remove_other_user_subscriptions(db: Session, *, user_id: str, active_endpoint: str) -> int:
    stale_rows = db.execute(
        select(models.BrowserPushSubscription).where(
            models.BrowserPushSubscription.user_id == user_id,
            models.BrowserPushSubscription.endpoint != active_endpoint,
        )
    ).scalars().all()
    for row in stale_rows:
        db.delete(row)
    return len(stale_rows)


@router.get("/settings", response_model=schemas.BrowserPushSettingsRead)
def get_push_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
) -> schemas.BrowserPushSettingsRead:
    rows = db.execute(
        select(models.BrowserPushSubscription).where(models.BrowserPushSubscription.user_id == current_user.id)
    ).scalars().all()
    subscriptions = [schemas.BrowserPushSubscriptionRead.model_validate(item) for item in rows]
    return schemas.BrowserPushSettingsRead(
        enabled=bool(current_user.browser_notifications_enabled),
        vapid_public_key=settings.vapid_public_key,
        subscriptions=subscriptions,
    )


@router.patch("/settings", response_model=schemas.BrowserPushSettingsRead)
def update_push_settings(
    payload: schemas.BrowserPushSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
) -> schemas.BrowserPushSettingsRead:
    if current_user.role not in {models.RoleEnum.ADMIN, models.RoleEnum.OWNER, models.RoleEnum.MANAGER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin, owner, or manager can change browser notification setting",
        )
    current_user.browser_notifications_enabled = bool(payload.enabled)
    db.commit()
    db.refresh(current_user)
    return get_push_settings(db=db, current_user=current_user)


@router.post("/subscriptions", response_model=schemas.BrowserPushSubscriptionRead, status_code=status.HTTP_201_CREATED)
def upsert_subscription(
    payload: schemas.BrowserPushSubscriptionCreate,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
) -> schemas.BrowserPushSubscriptionRead:
    print(f"DEBUG: upsert_subscription called for user {current_user.id}")
    print(f"DEBUG: payload = {payload.model_dump()}")
    existing = db.execute(
        select(models.BrowserPushSubscription).where(models.BrowserPushSubscription.endpoint == payload.endpoint)
    ).scalar_one_or_none()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = user_agent
        _remove_other_user_subscriptions(
            db,
            user_id=str(current_user.id),
            active_endpoint=payload.endpoint,
        )
        db.commit()
        db.refresh(existing)
        return schemas.BrowserPushSubscriptionRead.model_validate(existing)

    row = models.BrowserPushSubscription(
        user_id=current_user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=user_agent,
    )
    db.add(row)
    _remove_other_user_subscriptions(
        db,
        user_id=str(current_user.id),
        active_endpoint=payload.endpoint,
    )
    db.commit()
    db.refresh(row)
    return schemas.BrowserPushSubscriptionRead.model_validate(row)


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(
    endpoint: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
) -> None:
    row = db.execute(
        select(models.BrowserPushSubscription).where(
            models.BrowserPushSubscription.user_id == current_user.id,
            models.BrowserPushSubscription.endpoint == endpoint,
        )
    ).scalar_one_or_none()
    if row:
        db.delete(row)
        db.commit()


@router.post("/test")
def send_test_push(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
) -> dict[str, object]:
    sent_count = browser_push_service.send_to_user(
        db,
        user_id=current_user.id,
        title="Push test notification",
        body=f"Test push delivered to {current_user.name}.",
        deep_link="/settings",
        tag="push-test",
        event_type="push.test",
    )
    return {
        "ok": True,
        "sent_count": sent_count,
        "message": "Test notification dispatched.",
    }
