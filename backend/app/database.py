from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import get_settings


settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")
engine_kwargs = {"echo": False, "future": True, "pool_pre_ping": True}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = settings.db_pool_size
    engine_kwargs["max_overflow"] = settings.db_max_overflow
    engine_kwargs["pool_timeout"] = settings.db_pool_timeout
    engine_kwargs["pool_recycle"] = settings.db_pool_recycle

engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def _ensure_task_group_column() -> None:
    """
    Lightweight migration helper so older SQLite/Postgres installs gain the new task_group_id column automatically.
    This keeps local developer/test databases from breaking when the ORM expects the field.
    """
    try:
        inspector = inspect(engine)
        if "tasks" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        if "task_group_id" in columns:
            return
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN task_group_id VARCHAR(36)"))
            conn.execute(
                text(
                    """
                    UPDATE tasks
                    SET task_group_id = id
                    WHERE task_group_id IS NULL OR task_group_id = ''
                    """
                )
            )
    except Exception:
        # Swallow errors so startup still succeeds; the API will surface a clearer DB error if this failed.
        pass


_ensure_task_group_column()


def _ensure_user_profile_columns() -> None:
    """
    Add optional profile/shift columns to the users table for existing databases.
    """
    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("users")}
        desired = {
            "manager_email": "VARCHAR(255)",
            "shift_name": "VARCHAR(255)",
            "shift_start": "VARCHAR(16)",
            "shift_end": "VARCHAR(16)",
            "morning_break_start": "VARCHAR(16)",
            "morning_break_end": "VARCHAR(16)",
            "lunch_break_start": "VARCHAR(16)",
            "lunch_break_end": "VARCHAR(16)",
            "evening_break_start": "VARCHAR(16)",
            "evening_break_end": "VARCHAR(16)",
        }
        missing = {name: col_type for name, col_type in desired.items() if name not in columns}
        if not missing:
            return
        with engine.begin() as conn:
            for name, col_type in missing.items():
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {col_type}"))
    except Exception:
        # Swallow errors so startup still succeeds; the API will surface a clearer DB error if this failed.
        pass


_ensure_user_profile_columns()


def _ensure_is_present_column() -> None:
    """
    Add the is_present column to the users table for existing databases.
    """
    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("users")}
        if "is_present" in columns:
            return
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_present INTEGER DEFAULT 0"))
    except Exception:
        pass


_ensure_is_present_column()


def _ensure_browser_notification_column() -> None:
    """
    Add the browser_notifications_enabled column to users table for existing databases.
    """
    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("users")}
        if "browser_notifications_enabled" in columns:
            return
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN browser_notifications_enabled BOOLEAN DEFAULT 1")
            )
    except Exception:
        pass


_ensure_browser_notification_column()


def _ensure_task_overdue_notified_column() -> None:
    """
    Add overdue_notified and overdue_notified_at to tasks table for existing databases.
    """
    try:
        inspector = inspect(engine)
        if "tasks" not in inspector.get_table_names():
            return
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        with engine.begin() as conn:
            if "overdue_notified" not in columns:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN overdue_notified BOOLEAN DEFAULT 0"))
            if "overdue_notified_at" not in columns:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN overdue_notified_at TIMESTAMP NULL"))
        if "overdue_notified" not in columns and "notifications" in inspector.get_table_names():
            notification_columns = {col["name"] for col in inspector.get_columns("notifications")}
            required = {"type", "entity_type", "entity_id"}
            if required.issubset(notification_columns):
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            """
                            UPDATE tasks
                            SET overdue_notified = 1
                            WHERE EXISTS (
                                SELECT 1
                                FROM notifications n
                                WHERE n.type = 'TASK_OVERDUE'
                                  AND n.entity_type = 'task'
                                  AND n.entity_id = tasks.id
                            )
                            """
                        )
                    )
    except Exception:
        pass


_ensure_task_overdue_notified_column()


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
