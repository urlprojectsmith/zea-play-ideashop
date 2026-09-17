"""Gamification helpers for achievements and rewards."""

from statistics import mean
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy import func, select, inspect
from sqlalchemy.orm import Session

from .. import models
from .notifications import create_notification
from .badge_engine import BadgeEvent, process_badge_event

COMPLETED_STATUSES = {models.TaskStatusEnum.DONE, models.TaskStatusEnum.DEPLOYED}


def _normalize_to_naive(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
PRIORITY_BONUS = {
    models.TaskPriorityEnum.LOW: 0,
    models.TaskPriorityEnum.MEDIUM: 0,
    models.TaskPriorityEnum.HIGH: 5,
    models.TaskPriorityEnum.URGENT: 10,
}


def grant_achievement_by_id(db: Session, user: models.User, achievement_id: str) -> Optional[models.Achievement]:
    try:
        if "badges" in inspect(db.bind).get_table_names():
            return None
    except Exception:
        return None
    if achievement_id in user.unlocked_achievement_ids:
        return None

    achievement = db.get(models.Achievement, achievement_id)
    if not achievement:
        return None

    unlocked_ids = list(user.unlocked_achievement_ids or [])
    unlocked_ids.append(achievement_id)
    user.unlocked_achievement_ids = unlocked_ids
    user.points += achievement.points
    create_notification(
        db,
        user_id=user.id,
        notification_type=models.NotificationTypeEnum.ACHIEVEMENT_UNLOCKED,
        message=f"Achievement unlocked: {achievement.title}!",
    )
    return achievement


def check_and_unlock_achievements(db: Session, user: models.User) -> None:
    try:
        if "badges" in inspect(db.bind).get_table_names():
            return
    except Exception:
        return
    achievements = db.execute(select(models.Achievement)).scalars().all()
    unlocked = set(user.unlocked_achievement_ids)

    for achievement in achievements:
        if achievement.id in unlocked or achievement.id == "ach-4":
            continue

        should_unlock = False
        if achievement.id == "ach-1" and user.tasks_completed >= 1:
            should_unlock = True
        elif achievement.id == "ach-2" and user.tasks_completed >= 5:
            should_unlock = True
        elif achievement.id == "ach-3":
            high_priority_count = db.execute(
                select(func.count(models.Task.id))
                .where(models.Task.assigned_to_id == user.id)
                .where(models.Task.status.in_(COMPLETED_STATUSES))
                .where(models.Task.priority.in_([models.TaskPriorityEnum.HIGH, models.TaskPriorityEnum.URGENT]))
            ).scalar_one()
            if high_priority_count >= 3:
                should_unlock = True
        elif achievement.id == "ach-5" and user.tasks_created >= 5:
            should_unlock = True
        elif achievement.id == "ach-6" and len(user.clarity_scores) >= 3:
            if mean(user.clarity_scores) >= 4:
                should_unlock = True

        if should_unlock:
            grant_achievement_by_id(db, user, achievement.id)


def award_task_completion_points(db: Session, task: models.Task) -> None:
    assignee = db.get(models.User, task.assigned_to_id) if task.assigned_to_id else None
    creator = db.get(models.User, task.created_by_id)

    if assignee:
        base_points = 15
        base_points += PRIORITY_BONUS.get(task.priority, 0)
        due_at = _normalize_to_naive(task.due_at)
        completed_at = _normalize_to_naive(task.completed_at)
        if due_at and completed_at and completed_at <= due_at:
            base_points += 10

        assignee.points += base_points
        assignee.tasks_completed += 1
        check_and_unlock_achievements(db, assignee)

        if task.priority == models.TaskPriorityEnum.URGENT:
            grant_achievement_by_id(db, assignee, "ach-4")

    if creator:
        creator.points += 5
        check_and_unlock_achievements(db, creator)

        assignee_name = assignee.name if assignee else "Someone"
        create_notification(
            db,
            user_id=creator.id,
            notification_type=models.NotificationTypeEnum.TASK_COMPLETED,
            message=f"{assignee_name} completed the task: '{task.title}'.",
            related_task_id=task.id,
        )


def record_clarity_rating(db: Session, task: models.Task, rating: int) -> None:
    creator = db.get(models.User, task.created_by_id)
    if not creator:
        return

    safe_rating = max(0, min(int(rating), 5))
    clarity_scores = list(creator.clarity_scores or [])
    clarity_scores.append(safe_rating)
    creator.clarity_scores = clarity_scores
    creator.points += safe_rating * 5
    check_and_unlock_achievements(db, creator)
    process_badge_event(
        db,
        event=BadgeEvent(
            entity="manual",
            event="updated",
            actor_id=creator.id,
            assigned_to_id=task.assigned_to_id,
            created_by_id=creator.id,
            priority=task.priority.value,
        ),
    )
