"""add task overdue notified flag

Revision ID: 7a8b9c0d1e2f
Revises: 6e7f8g9h0i1j
Create Date: 2026-02-24 10:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "7a8b9c0d1e2f"
down_revision = "6e7f8g9h0i1j"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "tasks" not in tables:
        return

    task_columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "overdue_notified" not in task_columns:
        op.add_column(
            "tasks",
            sa.Column("overdue_notified", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if "notifications" in tables:
        op.execute(
            """
            UPDATE tasks
            SET overdue_notified = TRUE
            WHERE EXISTS (
                SELECT 1
                FROM notifications n
                WHERE n.type = 'TASK_OVERDUE'
                  AND n.entity_type = 'task'
                  AND n.entity_id = tasks.id
            )
            """
        )

    op.alter_column("tasks", "overdue_notified", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "tasks" not in tables:
        return
    task_columns = {col["name"] for col in inspector.get_columns("tasks")}
    if "overdue_notified" in task_columns:
        op.drop_column("tasks", "overdue_notified")
