# TASK SYSTEM — DETAILED REPORT

## Executive summary
This document is a detailed end-to-end report of the Task system in this repository (frontend + backend). It describes data models, API endpoints, frontend components and hooks, core flows (create, update, comment, assign, complete, recurring, subtasks, attachments, approvals), validation, testing, performance characteristics, security, and recommended improvements.

---

## Table of contents
- Executive summary
- Task data model (database)
- Backend services & routers
- Core task flows
  - Create
  - Update
  - Assign / Transfer
  - Comments and chat
  - Subtasks
  - Recurring tasks
  - Attachments
  - Approvals / Approval-required tasks
  - Complete / Reopen
  - Linking with Tickets
- Frontend implementation
  - Components
  - Hooks / services
  - Mappings & DTOs
- Testing & coverage
- Performance & scaling
- Security
- Recommendations & next steps

---

## Task data model (backend)
Source of truth: the `Task` model in the backend database schema. See [backend/app/models.py](backend/app/models.py).

Key fields (observed in models):
- `id` (string uuid)
- `title` (string)
- `description` (text)
- `status` (enum; multiple workflow states)
- `priority` (enum)
- `team` (string)
- `task_group_id` (grouping id)
- `ticket_id` (optional FK to tickets)
- `assigned_to_id` (FK to `users.id`)
- `created_by_id` (FK to `users.id`)
- `approval_required` (bool)
- `approval_status` (enum)
- `approver_id` (optional FK)
- `due_at`, `completed_at`, `created_at`, `updated_at`
- `recurrence_rule` (enum)
- `recurring_task_id` (reference if recurring series)
- `clarity_rating` (optional)
- `attachments` (JSON array)
- `estimated_hours` (float)
- `tags` (JSON array)

These model fields provide a rich feature set: assignments, linked tickets, approvals, recurrence, subtasks, attachments, point/clarity tracking.

---

## Backend services & routers
Primary backend task logic is implemented across the routers and service layers. Key files to review:
- Routers: `backend/app/routers/tasks.py` (main task endpoints)
- Service layer / business logic: `backend/app/services` or `backend/app/tasks/*` (task services, task engine)
- Task linking / ticket integration: `backend/app/tickets/task_link_service.py`
- Models: `backend/app/models.py` (Task, Subtask, Comment, TaskMessage)

Typical endpoints (implemented or proxied by the frontend `mockApi`):
- `GET  /tasks` — list tasks (filters: status, priority, assignee, team, search)
- `POST /tasks` — create a new task
- `GET  /tasks/{taskId}` — read task details
- `PATCH /tasks/{taskId}` — partial update
- `DELETE /tasks/{taskId}` — delete/soft-delete
- `POST /tasks/{taskId}/comments` — post a comment
- `GET  /tasks/{taskId}/comments` — list comments
- `POST /tasks/{taskId}/subtasks` — create subtask
- `PATCH /subtasks/{subtaskId}` — update subtask (complete/uncomplete)
- `POST /tasks/{taskId}/complete` — mark complete (may also be PATCH)
- `POST /tasks/{taskId}/attachments/presign` & `POST /tasks/{taskId}/attachments/confirm`
- `POST /tasks/{taskId}/approve` / `/reject` if approval flows exist for tasks

The frontend `mockApi.ts` contains mapping code and wrappers for many task-related API interactions; see [frontend/services/mockApi.ts](frontend/services/mockApi.ts).

---

## Core task flows
This section details each major user flow and the backend/frontend pieces involved.

### Create task
- Frontend: `CreateTaskModal.tsx` or similar component posts to `/tasks` using `api.createTask()` (see `mockApi.ts`).
- Backend: router validates payload (title, assigned user, priority, due date, recurrence options), creates `Task` record, increments creator counters, emits audit event, and triggers notifications.
- Edge cases: creating a recurring task should create a base task record and optionally schedule the recurrence; `recurring_task_id` set for linked instances.

Success indicators:
- DB record with `created_by_id` and `created_at`.
- Notification to assignee(s).
- Optional audit log entry.

### Update task (partial updates)
- Frontend uses PATCH `/tasks/{id}` with only changed fields.
- Backend applies field-level updates, recomputes derived fields (e.g., SLA, assigned notifications), logs audit entries for changes (before/after), and sends notifications for key changes (assignment, priority, due date).

### Assign / Transfer
- Tasks may be assigned to a single `assigned_to_id` (the schema supports single assignee). The UI allows assigning to users and may provide transfer/claim flows.
- Backend ensures assignee exists and belongs to the same tenant; creates `TaskMessage` or `Notification` for the new assignee.

### Comments and chat
- Comments persist in `comments` table (see `Comment` model) and are returned via `/tasks/{id}/comments`.
- Real-time chat or typing indicators are implemented via WebSocket code (app-wide `ws` files); task comments are persisted and broadcast.
- Frontend component: `TaskChat` / comments section (look for `TaskMessage`/`CommentsPanel` components).

### Subtasks
- Subtasks have their own table `subtasks` linked to `task_id`.
- Flows: create subtask, mark subtask complete, delete subtask.
- Completing all subtasks may optionally trigger task completion (business logic present in service layer where `_resolve_ticket_if_all_tasks_completed` existed for tickets — similar logic may exist for tasks).

### Recurring tasks
- Supported via `recurrence_rule` and `recurring_task_id`. Backend `task_engine_service.py` or scheduled worker likely handles creating the next instance when due or after completion.
- Frontend: recurrence UI in `CreateTaskModal`.

### Attachments
- Upload flow uses presigned URLs (MinIO/S3) via endpoints to presign and confirm.
- Attachments metadata stored on task record (`attachments` JSON) or separate media table.
- Frontend: `TaskAttachmentsPanel.tsx` with upload and preview.

### Approvals / Approval-required tasks
- Tasks may set `approval_required` and `approver_id` (single approver) or more advanced approval flows (if the approvals module is shared between tickets and tasks).
- Approvals service handles request/approve/reject flows and approval status tracking.
- Endpoints: `/tasks/{id}/approve` and `/tasks/{id}/reject` or generic approvals endpoints.

### Complete / Reopen
- Marking a task complete sets `completed_at` and updates `status`.
- Business rules may require approvals before marking complete (if `approval_required`), or auto-complete when linked tasks all complete.
- Reopening clears `completed_at` or sets a new status.

### Linking with Tickets
- Tasks can be linked to Tickets (`ticket_id`). There is a task-linking service for converting tickets → tasks and vice versa. See `backend/app/tickets/task_link_service.py` for similar patterns.

---

## Frontend implementation
The frontend includes a full UI for tasks: creation, editing, views, boards, and lists.

Key files & components (look for these in `frontend/components`):
- `CreateTaskModal.tsx` — create form (title, description, assignee, priority, due date, recurrence, subtasks)
- `EditTaskModal.tsx` — edit form
- `TaskCard.tsx`, `TaskListView.tsx`, `TaskKanbanView.tsx`, `TaskGridView.tsx` — various renderers
- `TaskDetailDrawer.tsx` — full task details, timeline, comments, attachments
- `TaskAttachmentsPanel.tsx` — upload/preview/delete
- `TaskCommentsPanel.tsx` — comments UI and WebSocket feed
- `TaskSubtasksPanel.tsx` — manage subtasks

Hooks and services:
- `useTasks`, `useTask` — list, create, update, delete operations; uses `mockApi` wrappers
- `mockApi.ts` — maps API responses to frontend DTOs and handles token/refresh, caching, error mapping

DTO mapping: the frontend maps API models to app interfaces (see `frontend/types.ts` and `mapTask`, `mapSubtask` functions in `mockApi.ts`).

Caching and optimistic updates:
- `mockApi` caches lists (`getCached` / `setCached`) with TTLs (60s default), invalidates caches on write operations.
- Hooks often update local state optimistically and then reconcile with server responses.

---

## Testing & coverage (tasks)
Observed test coverage for tasks is limited compared to auth and tickets. Recommended tests to ensure robustness:
- Unit tests for service functions: create, update, assign, approval flows, recurrence engine
- Integration tests for router endpoints: POST /tasks, PATCH /tasks/{id}, /tasks/{id}/comments
- E2E tests for UI flows: create task → assign → comment → complete
- Edge case tests: recurring task scheduling, approval-required task cannot be completed without approval, subtask completion logic

Current repo test examples include `backend/tests/test_oauth2_server.py` and ticket tests; similar test modules should be added under `backend/tests/test_tasks_*.py`.

---

## Performance & scaling
- DB: ensure indexes on `assigned_to_id`, `status`, `created_by_id`, `ticket_id`, `due_at` for common filters.
- Use pagination on task lists (currently frontend sometimes requests full lists). Implement cursor-based pagination for large datasets.
- Long-running recurrence/workers should run in background jobs (Celery/RQ/n8n) rather than synchronous request handlers.
- Cache frequently read metadata (task counts, summaries) in Redis if required.

---

## Security & permissions
- Task endpoints use tenant filtering and role-based checks (same patterns as users/tickets).
- Ensure assignment operations validate assignee belongs to same tenant.
- Validate uploads to prevent unsafe file types and limit sizes. Use presigned upload URLs and confirm endpoint.
- Audit important task events (created, updated, assigned, completed) in `audit_logs`.

---

## Recommendations & next steps
1. Create dedicated backend unit/integration tests for tasks and recurrence engine.
2. Add API pagination for `GET /tasks` and ensure frontend uses paged queries.
3. Add rate limiting on write endpoints (create/update/delete) to prevent abuse.
4. Implement full approval cycle reuse (shared approvals service used for tickets) and add tests.
5. Add email/notification templates for task events (assignment, overdue, completion).
6. Add monitoring for recurrence worker and job queue health.
7. Add periodic data cleanup for old attachments and archived tasks.

---

## Files to review for deeper details
- Backend models and task services: `backend/app/models.py` and `backend/app/tasks` or `backend/app/services`
- Task routers: `backend/app/routers/tasks.py`
- Frontend mappings & api: `frontend/services/mockApi.ts` (mapTask, mapSubtask)
- Frontend components: `frontend/components/CreateTaskModal.tsx`, `TaskDetailDrawer.tsx`, `TaskCard.tsx`, `TaskKanbanView.tsx`.

---

## Closing note
I created this `task_report.md` with an overview and actionable recommendations. If you want, I can:
- Run a repo-wide search to list all exact task-related files and add precise links/line citations.
- Generate unit/integration test stubs for the backend task services.
- Add frontend test scenarios (Cypress/Playwright) for critical flows.

Which follow-up would you like next?