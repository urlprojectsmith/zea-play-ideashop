from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Optional

from sqlalchemy import inspect, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, selectinload

from .. import models
from ..database import SessionLocal
from ..services import browser_push as browser_push_service
from ..services import notifications as notification_service
from ..tickets.models import Ticket

logger = logging.getLogger(__name__)

COMPLETED_STATUSES = {
    models.TaskStatusEnum.DONE,
    models.TaskStatusEnum.FAILED,
    models.TaskStatusEnum.GRAVEYARD,
}

_worker_thread: threading.Thread | None = None
_worker_stop_event = threading.Event()


def _get_admin_owner_ids(db: Session, tenant_id: Optional[str]) -> set[str]:
    stmt = select(models.User.id).where(
        models.User.role.in_([models.RoleEnum.ADMIN, models.RoleEnum.OWNER])
    )
    if tenant_id:
        stmt = stmt.where(models.User.tenant_id == tenant_id)
    rows = db.execute(stmt).scalars().all()
    return {str(row) for row in rows if row}


def _get_manager_ids_for_user(db: Session, user: Optional[models.User]) -> set[str]:
    if not user:
        return set()
    recipient_ids: set[str] = set()
    if user.manager_id:
        recipient_ids.add(str(user.manager_id))
    if user.department_id:
        dept_stmt = select(models.User.id).where(
            models.User.role == models.RoleEnum.MANAGER,
            models.User.department_id == user.department_id,
        )
        if user.tenant_id:
            dept_stmt = dept_stmt.where(models.User.tenant_id == user.tenant_id)
        dept_manager_ids = db.execute(dept_stmt).scalars().all()
        recipient_ids.update(str(manager_id) for manager_id in dept_manager_ids if manager_id)
    return recipient_ids


def _get_task_oversight_recipient_ids(
    db: Session, assignee: Optional[models.User], *exclude_ids: Optional[str]
) -> set[str]:
    tenant_id = str(assignee.tenant_id) if assignee and assignee.tenant_id else None
    recipient_ids = _get_admin_owner_ids(db, tenant_id)
    recipient_ids.update(_get_manager_ids_for_user(db, assignee))
    for value in exclude_ids:
        if value:
            recipient_ids.discard(str(value))
    return recipient_ids


def _has_task_overdue_notified_column(db: Session) -> bool:
    try:
        inspector = inspect(db.bind)
        if "tasks" not in inspector.get_table_names():
            return False
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        return "overdue_notified" in columns
    except Exception:
        return False


def _has_task_overdue_notified_at_column(db: Session) -> bool:
    try:
        inspector = inspect(db.bind)
        if "tasks" not in inspector.get_table_names():
            return False
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        return "overdue_notified_at" in columns
    except Exception:
        return False


def run_overdue_task_notifications(*, limit: int = 300) -> int:
    with SessionLocal() as db:
        return _run_overdue_task_notifications(db, limit=limit)


def _run_overdue_task_notifications(db: Session, *, limit: int) -> int:
    now = datetime.utcnow()
    logger.info("Overdue worker tick utc_now=%s limit=%s", now.isoformat(), limit)
    has_overdue_notified = _has_task_overdue_notified_column(db)
    has_overdue_notified_at = _has_task_overdue_notified_at_column(db)
    if not has_overdue_notified:
        logger.warning("Overdue worker skipped: tasks.overdue_notified column missing")
        return 0

    task_stmt = (
        select(models.Task)
        .options(selectinload(models.Task.assignee))
        .where(
            models.Task.assigned_to_id.is_not(None),
            models.Task.due_at.is_not(None),
            models.Task.due_at < now,
            models.Task.status.not_in(list(COMPLETED_STATUSES)),
        )
    )
    if has_overdue_notified:
        task_stmt = task_stmt.where(text("(tasks.overdue_notified IS NULL OR tasks.overdue_notified = false)"))
    overdue_tasks = (
        db.execute(
            task_stmt
            .order_by(models.Task.due_at.asc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    if not overdue_tasks:
        return 0

    claimed_task_ids: list[str] = []
    for task in overdue_tasks:
        before_overdue_notified = db.execute(
            text("SELECT overdue_notified FROM tasks WHERE id = :task_id"),
            {"task_id": task.id},
        ).scalar_one_or_none()
        logger.info(
            "Overdue evaluate task_id=%s due_at=%s status=%s overdue_notified_before=%s",
            task.id,
            task.due_at.isoformat() if task.due_at else None,
            getattr(task.status, "value", task.status),
            before_overdue_notified,
        )

        if has_overdue_notified_at:
            claim_sql = text(
                """
                UPDATE tasks
                SET overdue_notified = :overdue_true,
                    overdue_notified_at = :notified_at
                WHERE id = :task_id
                  AND assigned_to_id IS NOT NULL
                  AND due_at IS NOT NULL
                  AND due_at < :now_utc
                  AND status NOT IN (:status_done, :status_failed, :status_graveyard)
                  AND (overdue_notified IS NULL OR overdue_notified = :overdue_false)
                """
            )
            params = {
                "task_id": task.id,
                "overdue_true": True,
                "overdue_false": False,
                "notified_at": now,
                "now_utc": now,
                "status_done": models.TaskStatusEnum.DONE.value,
                "status_failed": models.TaskStatusEnum.FAILED.value,
                "status_graveyard": models.TaskStatusEnum.GRAVEYARD.value,
            }
        else:
            claim_sql = text(
                """
                UPDATE tasks
                SET overdue_notified = :overdue_true
                WHERE id = :task_id
                  AND assigned_to_id IS NOT NULL
                  AND due_at IS NOT NULL
                  AND due_at < :now_utc
                  AND status NOT IN (:status_done, :status_failed, :status_graveyard)
                  AND (overdue_notified IS NULL OR overdue_notified = :overdue_false)
                """
            )
            params = {
                "task_id": task.id,
                "overdue_true": True,
                "overdue_false": False,
                "now_utc": now,
                "status_done": models.TaskStatusEnum.DONE.value,
                "status_failed": models.TaskStatusEnum.FAILED.value,
                "status_graveyard": models.TaskStatusEnum.GRAVEYARD.value,
            }

        claimed = db.execute(claim_sql, params)
        logger.info("Overdue claim task_id=%s affected_rows=%s", task.id, claimed.rowcount)
        if claimed.rowcount == 1:
            claimed_task_ids.append(task.id)

    # Commit claim first, then trigger push.
    db.commit()
    if not claimed_task_ids:
        return 0

    claimed_tasks = (
        db.execute(
            select(models.Task)
            .options(selectinload(models.Task.assignee))
            .where(models.Task.id.in_(claimed_task_ids))
        )
        .unique()
        .scalars()
        .all()
    )

    overdue_ids = [task.id for task in claimed_tasks]
    assignee_ids = {str(task.assigned_to_id) for task in claimed_tasks if task.assigned_to_id}
    existing_overdue_rows = db.execute(
        select(models.Notification.user_id, models.Notification.entity_id).where(
            models.Notification.user_id.in_(list(assignee_ids)),
            models.Notification.type == models.NotificationTypeEnum.TASK_OVERDUE,
            models.Notification.entity_type == models.NotificationEntityTypeEnum.TASK,
            models.Notification.entity_id.in_(overdue_ids),
        )
    ).all()
    existing_overdue_by_assignee = {
        (str(row[0]), str(row[1])) for row in existing_overdue_rows if row[0] and row[1]
    }

    ticket_ids = {task.ticket_id for task in claimed_tasks if task.ticket_id}
    tickets: dict[str, Ticket] = {}
    if ticket_ids:
        tickets = {
            ticket.id: ticket
            for ticket in db.execute(select(Ticket).where(Ticket.id.in_(list(ticket_ids))))
            .scalars()
            .all()
        }

    for task in claimed_tasks:
        task_path = f"/tasks?taskId={task.id}"
        assignee_id = str(task.assigned_to_id) if task.assigned_to_id else None
        if not assignee_id:
            continue

        if (assignee_id, task.id) not in existing_overdue_by_assignee:
            notification_service.create_notification(
                db,
                user_id=assignee_id,
                actor_id=assignee_id,
                notification_type=models.NotificationTypeEnum.TASK_OVERDUE,
                message=f"Task '{task.title}' is overdue.",
                title="Task overdue",
                body=f"Task '{task.title}' is overdue.",
                entity_type=models.NotificationEntityTypeEnum.TASK,
                entity_id=task.id,
                deep_link=task_path,
                related_task_id=task.id,
            )
            existing_overdue_by_assignee.add((assignee_id, task.id))

        assignee = (
            task.assignee
            if task.assignee and str(task.assignee.id) == assignee_id
            else db.get(models.User, assignee_id)
        )
        assignee_name = assignee.name if assignee and assignee.name else "Assigned user"
        assignee_push_count = browser_push_service.send_to_user(
            db,
            user_id=assignee_id,
            title="Task overdue",
            body=f"Your task is overdue: {task.title}",
            related_task_id=task.id,
            deep_link=task_path,
            tag=f"task-overdue-{task.id}",
            event_type="task.overdue",
        )
        oversight_ids = _get_task_oversight_recipient_ids(db, assignee, assignee_id)
        oversight_push_count = 0
        if oversight_ids:
            oversight_push_count = browser_push_service.send_to_users(
                db,
                user_ids=oversight_ids,
                title="Team task overdue",
                body=f"{assignee_name}'s task is overdue: {task.title}",
                related_task_id=task.id,
                deep_link=task_path,
                tag=f"task-overdue-team-{task.id}",
                event_type="task.overdue.team",
            )

        logger.info(
            "Push Triggered task_id=%s assignee_id=%s assignee_push_sent=%s oversight_push_sent=%s oversight_recipients=%s",
            task.id,
            assignee_id,
            assignee_push_count,
            oversight_push_count,
            sorted(list(oversight_ids)),
        )

        ticket = tickets.get(task.ticket_id) if task.ticket_id else None
        if ticket:
            creator = db.get(models.User, ticket.created_by)
            manager_id = creator.manager_id if creator else None
            if manager_id:
                manager_exists = db.execute(
                    select(models.Notification.id).where(
                        models.Notification.user_id == manager_id,
                        models.Notification.type == models.NotificationTypeEnum.TASK_OVERDUE,
                        models.Notification.entity_type == models.NotificationEntityTypeEnum.TASK,
                        models.Notification.entity_id == task.id,
                    )
                ).scalar_one_or_none()
                if not manager_exists:
                    notification_service.create_notification(
                        db,
                        user_id=str(manager_id),
                        actor_id=assignee_id,
                        notification_type=models.NotificationTypeEnum.TASK_OVERDUE,
                        message=f"Task '{task.title}' is overdue for ticket '{ticket.title}'.",
                        title="Task overdue escalation",
                        body=f"Task '{task.title}' linked to ticket '{ticket.title}' is overdue.",
                        entity_type=models.NotificationEntityTypeEnum.TASK,
                        entity_id=task.id,
                        deep_link=task_path,
                        related_task_id=task.id,
                    )

    db.commit()
    return len(claimed_task_ids)


def start_overdue_task_worker(poll_interval_seconds: int = 30) -> None:
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return

    _worker_stop_event.clear()

    def _worker_loop() -> None:
        while not _worker_stop_event.is_set():
            try:
                run_overdue_task_notifications()
            except OperationalError as exc:
                logger.warning(
                    "Overdue task worker skipped due to database connection error: %s",
                    exc,
                )
            except Exception:
                logger.exception("Overdue task worker failed")
            _worker_stop_event.wait(poll_interval_seconds)

    _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
    _worker_thread.start()


def stop_overdue_task_worker(timeout_seconds: float = 1.0) -> None:
    global _worker_thread
    if not _worker_thread:
        return
    _worker_stop_event.set()
    _worker_thread.join(timeout=timeout_seconds)
    _worker_thread = None
