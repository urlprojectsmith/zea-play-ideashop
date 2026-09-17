import { useState, useMemo, useEffect, useCallback } from "react";
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import MultiSelect from './ui/MultiSelect';
import api from '../services/mockApi';
import { TaskPriority, User, UserStatus, Role, RecurrenceRule, KanbanColumn, TaskStatus, Subtask, CUSTOM_STATUS_NAMES } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { formatRecurrenceRule, formatTaskStatus } from '../utils';
import { PlusIcon, XMarkIcon, SparklesIcon } from './icons';
import GenerateTaskWithAIModal from './GenerateTaskWithAIModal';
import SingleSelect from './ui/SingleSelect';
import { getUserAvatarUrl } from '../utils/userAvatar';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_DATE_PRESETS = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: 'Next Week', offset: 7 },
    { label: 'In 2 Weeks', offset: 14 },
];

const QUICK_TIME_PRESETS = [
    { label: 'Morning', value: '10:00' },
    { label: 'Midday', value: '13:00' },
    { label: 'Afternoon', value: '15:00' },
    { label: 'EOD', value: '20:00' },
];

const DEFAULT_EOD_TIME = '20:00';
const DUE_DATE_CUTOFF_HOUR = 18;

const TAG_SUGGESTIONS = ['Urgent', 'Client', 'Follow-up', 'QA', 'Research', 'Blocked', 'Launch'];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return [`${hour}:00`, `${hour}:30`];
}).flat();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const resolveDefaultDueDateTime = (now = new Date()) => {
    const target = new Date(now);
    if (now.getHours() >= DUE_DATE_CUTOFF_HOUR) {
        target.setDate(target.getDate() + 1);
    }
    while (target.getDay() === 0) {
        target.setDate(target.getDate() + 1);
    }
    target.setHours(0, 0, 0, 0);
    return { date: formatDateInput(target), time: DEFAULT_EOD_TIME };
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskCreated: () => void;
    initialDueDate?: string | null;
    ticketId?: string;
    ticketTitle?: string;
    ticketDescription?: string;
}

// ─── Shared class strings ─────────────────────────────────────────────────────

const inputBase =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 ' +
    'transition-colors duration-150 ' +
    'hover:border-slate-400 ' +
    'focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20';

const textareaBase = inputBase + ' resize-none leading-relaxed';

const labelBase = 'mb-1.5 block text-xs font-medium tracking-wide text-slate-600';

const sectionBase =
    'rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5';

const chipBase =
    'inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white ' +
    'px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors';

const quickActionBase =
    'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 ' +
    'hover:border-slate-400 hover:bg-slate-50 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500/20';

// ─── Component ────────────────────────────────────────────────────────────────

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
    isOpen,
    onClose,
    onTaskCreated,
    initialDueDate = null,
    ticketId,
    ticketTitle,
    ticketDescription,
}) => {
    const { user: currentUser } = useAuth();
    const { notify } = useToast();
    const isTicketMode = Boolean(ticketId);

    // Core fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [assignedTo, setAssignedTo] = useState<string[]>([]);
    const [priority, setPriority] = useState<TaskPriority>(TaskPriority.LOW);
    const [status, setStatus] = useState('');
    const [dueDate, setDueDate] = useState(() => resolveDefaultDueDateTime().date);
    const [dueTime, setDueTime] = useState(() => resolveDefaultDueDateTime().time);
    const [team, setTeam] = useState('');
    const [approvalRequired, setApprovalRequired] = useState(false);
    const [approverId, setApproverId] = useState<string | null>(null);

    // Enhancements
    const [subtasks, setSubtasks] = useState<string[]>([]);
    const [currentSubtask, setCurrentSubtask] = useState('');
    const [attachments, setAttachments] = useState<string[]>([]);
    const [currentAttachment, setCurrentAttachment] = useState('');
    const [estimatedHours, setEstimatedHours] = useState<number | ''>('');
    const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(RecurrenceRule.NONE);
    const [tags, setTags] = useState<string[]>([]);
    const [currentTag, setCurrentTag] = useState('');

    // UI state
    const [users, setUsers] = useState<User[]>([]);
    const [columns, setColumns] = useState<KanbanColumn[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [activeAssignmentsSelectId, setActiveAssignmentsSelectId] = useState<string | null>(null);

    const todayDate = formatDateInput(new Date());

    const minDueTime = useMemo(() => {
        if (!dueDate || dueDate !== todayDate) return undefined;
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }, [dueDate, todayDate]);

    const statusOptions = (columns.length > 0
        ? columns.map((col) => ({ id: col.id, name: col.title }))
        : Object.values(TaskStatus).map((taskStatus) => {
            const t = taskStatus as TaskStatus;
            return { id: t, name: CUSTOM_STATUS_NAMES[t]?.name || formatTaskStatus(t) };
        })
    );

    const canSetHighPriority = currentUser?.role
        ? [Role.ADMIN, Role.MANAGER, Role.OWNER].includes(currentUser.role)
        : false;

    const allowedPriorities = useMemo(
        () => (canSetHighPriority ? Object.values(TaskPriority) : [TaskPriority.LOW, TaskPriority.MEDIUM]),
        [canSetHighPriority]
    );

    const priorityOptions = allowedPriorities.map((p) => ({
        id: p,
        name: `${String(p).charAt(0)}${String(p).slice(1).toLowerCase()}`,
    }));

    useEffect(() => {
        if (!allowedPriorities.includes(priority)) setPriority(TaskPriority.LOW);
    }, [allowedPriorities, priority]);

    const recurrenceOptions = Object.values(RecurrenceRule).map((rule) => ({
        id: rule,
        name: formatRecurrenceRule(rule),
    }));

    // ── Data fetching ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const fetchData = async () => {
            try {
                const [allUsers] = await Promise.all([api.getUsers(), api.getKanbanColumns()]);
                setUsers(allUsers.filter((u) => u.status === 'ACTIVE'));

                const resolvedColumns: KanbanColumn[] = Object.values(TaskStatus).map((s, index) => ({
                    id: s,
                    title: CUSTOM_STATUS_NAMES[s]?.name || s,
                    order: index,
                    pipelineId: 'default',
                }));
                setColumns(resolvedColumns);
                if (resolvedColumns.length > 0) setStatus(TaskStatus.WAITING_FOR_REQUIREMENT);
                if (currentUser) setTeam(currentUser.department);
            } catch (err) {
                console.error('Failed to fetch modal data:', err instanceof Error ? err.message : 'Unknown error');
            }
        };
        fetchData();
    }, [isOpen, currentUser]);

    useEffect(() => {
        if (!isOpen || !isTicketMode) return;
        setTitle(ticketTitle ?? '');
        setDescription(ticketDescription ?? '');
    }, [isOpen, isTicketMode, ticketTitle, ticketDescription]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const resetForm = () => {
        setTitle(ticketTitle ?? '');
        setDescription(ticketDescription ?? '');
        setAssignedTo([]);
        setPriority(TaskPriority.LOW);
        setStatus(TaskStatus.WAITING_FOR_REQUIREMENT);
        if (initialDueDate) {
            const date = new Date(initialDueDate);
            setDueDate(formatDateInput(date));
            setDueTime(date.toTimeString().slice(0, 5));
        } else {
            const defaults = resolveDefaultDueDateTime();
            setDueDate(defaults.date);
            setDueTime(defaults.time);
        }
        setError('');
        setIsSubmitting(false);
        if (currentUser) setTeam(currentUser.department);
        setSubtasks([]);
        setCurrentSubtask('');
        setAttachments([]);
        setCurrentAttachment('');
        setEstimatedHours('');
        setRecurrenceRule(RecurrenceRule.NONE);
        setTags([]);
        setCurrentTag('');
        setApprovalRequired(false);
        setApproverId(null);
    };

    const handleClose = () => { resetForm(); onClose(); };

    const handleAddSubtask = () => {
        if (currentSubtask.trim()) { setSubtasks([...subtasks, currentSubtask.trim()]); setCurrentSubtask(''); }
    };
    const handleRemoveSubtask = (i: number) => setSubtasks(subtasks.filter((_, idx) => idx !== i));

    const handleAddAttachment = () => {
        if (currentAttachment.trim()) { setAttachments([...attachments, currentAttachment.trim()]); setCurrentAttachment(''); }
    };
    const handleRemoveAttachment = (i: number) => setAttachments(attachments.filter((_, idx) => idx !== i));

    const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === ',' || e.key === 'Enter') && currentTag.trim()) {
            e.preventDefault();
            const newTag = currentTag.trim().replace(',', '');
            if (newTag && !tags.includes(newTag)) setTags([...tags, newTag]);
            setCurrentTag('');
        }
    };
    const handleRemoveTag = (i: number) => setTags(tags.filter((_, idx) => idx !== i));
    const handleAddTagSuggestion = (tag: string) => { if (!tags.includes(tag)) setTags([...tags, tag]); };

    const handleApplyQuickDate = (offset: number) => {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        base.setDate(base.getDate() + offset);
        setDueDate(formatDateInput(base));
    };

    const handleAssignmentsSelectOpen = useCallback((open: boolean, selectId?: string) => {
        if (!selectId) { setActiveAssignmentsSelectId(open ? 'assignments' : null); return; }
        setActiveAssignmentsSelectId((cur) => { if (open) return selectId; return cur === selectId ? null : cur; });
    }, []);

    const formatRoleLabel = useCallback((role: Role) => role.charAt(0).toUpperCase() + role.slice(1), []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) { setError('You must be logged in to create a task.'); return; }
        if (!dueDate || !dueTime) { setError('Due date and due time are required.'); return; }
        const scheduled = new Date(`${dueDate}T${dueTime}`);
        if (Number.isNaN(scheduled.getTime())) { setError('Due date or time is invalid.'); return; }
        if (scheduled.getTime() <= Date.now()) { setError('Due date and time cannot be in the past.'); return; }

        const dueAtUtc = (() => {
            const timePart = dueTime || '00:00';
            const normalized = new Date(`${dueDate}T${timePart}:00`);
            return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString();
        })();

        setIsSubmitting(true);
        setError('');
        try {
            if (ticketId) {
                if (approvalRequired && !approverId) {
                    setError('Select an approver for approval-required tasks.');
                    setIsSubmitting(false);
                    return;
                }
                await api.createTicketTask(ticketId, { dueAt: dueAtUtc, priority, approvalRequired, approverId: approvalRequired ? approverId : null });
                onTaskCreated();
                handleClose();
                notify('Task added to ticket.');
                return;
            }

            const finalSubtasks: Subtask[] = subtasks.map((t) => ({
                id: `sub-${Date.now()}-${Math.random()}`, title: t, completed: false,
            }));

            const shouldLinkGroup = assignedTo.length > 1;
            const groupId = shouldLinkGroup
                ? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `task-group-${Date.now()}`)
                : null;

            await api.createTask({
                title, description, priority, status: status as TaskStatus, dueAt: dueAtUtc,
                team, recurringTaskId: null, subtasks: finalSubtasks, attachments,
                estimatedHours: estimatedHours || null, recurrenceRule, tags,
                assignedTo: assignedTo.length ? assignedTo : null,
                taskGroupId: groupId,
            }, currentUser.id);

            onTaskCreated();
            handleClose();
            notify('Task created successfully.');
        } catch (err: any) {
            setError(err.message || 'Failed to create task. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTaskGenerated = (data: { title: string; description: string; priority: TaskPriority; subtasks?: string[] }) => {
        setTitle(data.title);
        setDescription(data.description);
        setPriority(allowedPriorities.includes(data.priority) ? data.priority : TaskPriority.LOW);
        if (data.subtasks) setSubtasks(data.subtasks.filter((s) => s.trim().length > 0));
    };

    // ── Derived values ─────────────────────────────────────────────────────────

    const assignedUsers = useMemo(() => users.filter((u) => assignedTo.includes(u.id)), [users, assignedTo]);
    const approverCandidates = useMemo(() => users.filter((u) => u.status === UserStatus.ACTIVE), [users]);
    const filteredTagSuggestions = useMemo(() => TAG_SUGGESTIONS.filter((t) => !tags.includes(t)), [tags]);

    const priorityLabel = useMemo(
        () => priorityOptions.find((o) => o.id === priority)?.name || 'Medium',
        [priorityOptions, priority]
    );
    const statusLabel = useMemo(
        () => statusOptions.find((o) => o.id === status)?.name || 'Select status',
        [statusOptions, status]
    );
    const recurrenceLabel = useMemo(
        () => recurrenceOptions.find((o) => o.id === recurrenceRule)?.name || 'None',
        [recurrenceOptions, recurrenceRule]
    );
    const dueDateDisplay = useMemo(() => {
        if (!dueDate) return 'No due date';
        const scheduled = new Date(`${dueDate}T${dueTime || '00:00'}`);
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(dueTime ? { timeStyle: 'short' } : {}) }).format(scheduled);
    }, [dueDate, dueTime]);

    const readinessScore = useMemo(() => {
        let score = 20;
        if (title.trim()) score += 15;
        if (description.trim()) score += 10;
        if (assignedTo.length > 0) score += 20;
        if (dueDate) score += 15;
        if (subtasks.length > 0) score += 10;
        if (tags.length > 0) score += 5;
        if (estimatedHours) score += 5;
        return Math.min(100, score);
    }, [title, description, assignedTo.length, dueDate, subtasks.length, tags.length, estimatedHours]);

    const readinessLabel =
        readinessScore >= 85 ? 'Ready to launch' :
        readinessScore >= 60 ? 'Almost there' :
        'Draft in progress';

    const readinessColor =
        readinessScore >= 85 ? 'bg-emerald-500' :
        readinessScore >= 60 ? 'bg-amber-400' :
        'bg-blue-400';

    const summaryStats = useMemo(() => [
        { label: 'Status', value: statusLabel, icon: '🚦' },
        { label: 'Priority', value: priorityLabel, icon: '⚡' },
        { label: 'Team', value: team || 'Unassigned', icon: '🛡️' },
        { label: 'Recurrence', value: recurrenceLabel, icon: '🔁' },
        { label: 'Due', value: dueDateDisplay, icon: '📅' },
        { label: 'Est. Hours', value: estimatedHours ? `${estimatedHours}h` : 'TBD', icon: '⏱️' },
    ], [statusLabel, priorityLabel, team, recurrenceLabel, dueDateDisplay, estimatedHours]);

    const summaryNotes = useMemo(() => {
        const notes: string[] = [];
        if (!assignedTo.length) notes.push('Assign at least one team member.');
        if (!dueDate) notes.push('Set a due date to track progress.');
        if (subtasks.length === 0) notes.push('Break this down into subtasks.');
        if (!description.trim()) notes.push('Add a description for context.');
        return notes;
    }, [assignedTo.length, dueDate, subtasks.length, description]);

    // ── Render guard ───────────────────────────────────────────────────────────

    if (!isOpen) return null;

    const lockedClass = isTicketMode ? 'opacity-60 pointer-events-none' : '';
    const assignmentSectionClass = activeAssignmentsSelectId
        ? `${sectionBase} relative z-20`
        : sectionBase;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── Backdrop ── */}
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 px-3 py-4 backdrop-blur-[1px] sm:px-5 sm:py-6 lg:px-8">

                {/* ── Modal shell ── */}
                <div
                    className="relative z-[61] mx-auto flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[90vh]"
                    style={{ boxShadow: '0 20px 48px -18px rgba(15, 23, 42, 0.28)' }}
                >

                    {/* ── Header ── */}
                    <header className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                        <div className="flex items-center justify-between gap-4">
                            {/* Left: title block */}
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                                    {isTicketMode ? `Linked to ticket #${ticketId?.slice(-6)}` : 'Task management'}
                                </p>
                                <h2 className="mt-1 text-2xl font-semibold leading-tight text-slate-900">
                                    Create Task
                                </h2>
                            </div>

                            {/* Right: actions */}
                            <div className="flex flex-shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAiModalOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                >
                                    <SparklesIcon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Generate with AI</span>
                                    <span className="sm:hidden">AI</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                >
                                    <XMarkIcon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Close</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                        <form onSubmit={handleSubmit}>
                            {/* 2-col grid: main | sidebar */}
                            <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] lg:gap-6">

                                {/* ════ LEFT COLUMN ════ */}
                                <div className="space-y-3 sm:space-y-4">

                                    {/* Mission Overview */}
                                    <section className={sectionBase}>
                                        <SectionHeading>Mission Overview</SectionHeading>
                                        <div className="mt-4 space-y-4">
                                            <div>
                                                <label htmlFor="title" className={labelBase}>Title <Required /></label>
                                                <input
                                                    id="title"
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    required
                                                    readOnly={isTicketMode}
                                                    className={[inputBase, lockedClass].filter(Boolean).join(' ')}
                                                    placeholder="Name this task…"
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor="description" className={labelBase}>Description</label>
                                                <textarea
                                                    id="description"
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    readOnly={isTicketMode}
                                                    rows={4}
                                                    className={[textareaBase, lockedClass].filter(Boolean).join(' ')}
                                                    placeholder="Describe what needs to be done and what success looks like…"
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    {/* Assignments */}
                                    <section className={assignmentSectionClass}>
                                        <SectionHeading>Assignments</SectionHeading>

                                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            {/* Assignees */}
                                            <div>
                                                <label className={labelBase}>Assignees</label>
                                                <MultiSelect
                                                    options={users.map((u) => ({ id: u.id, name: u.name }))}
                                                    value={assignedTo}
                                                    onChange={setAssignedTo}
                                                    placeholder="Select assignees…"
                                                    className="mt-1"
                                                />
                                            </div>

                                            {/* Status */}
                                            <div>
                                                <label htmlFor="status" className={labelBase}>Status</label>
                                                <SingleSelect
                                                    id="status"
                                                    options={statusOptions}
                                                    value={status}
                                                    onChange={setStatus}
                                                    onOpenChange={handleAssignmentsSelectOpen}
                                                    placeholder="Select status…"
                                                    className="mt-1"
                                                />
                                            </div>

                                            {/* Priority */}
                                            <div>
                                                <label htmlFor="priority" className={labelBase}>Priority</label>
                                                <SingleSelect
                                                    id="priority"
                                                    options={priorityOptions}
                                                    value={priority}
                                                    onChange={(v) => setPriority(v as TaskPriority)}
                                                    onOpenChange={handleAssignmentsSelectOpen}
                                                    placeholder="Select priority…"
                                                    className="mt-1"
                                                />
                                            </div>

                                            {/* Team */}
                                            <div>
                                                <label htmlFor="team" className={labelBase}>Team</label>
                                                <input
                                                    id="team"
                                                    type="text"
                                                    value={team}
                                                    onChange={(e) => setTeam(e.target.value)}
                                                    className={inputBase}
                                                    placeholder="Which team owns this?"
                                                />
                                            </div>

                                            {/* Due Date */}
                                            <div>
                                                <label htmlFor="dueDate" className={labelBase}>Due Date <Required /></label>
                                                <div className="relative mt-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            id="dueDate"
                                                            type="date"
                                                            value={dueDate}
                                                            onChange={(e) => setDueDate(e.target.value)}
                                                            min={todayDate}
                                                            required
                                                            className={inputBase}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowDatePicker(!showDatePicker)}
                                                            className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                                            aria-label="Open calendar"
                                                        >
                                                            📅
                                                        </button>
                                                    </div>
                                                    {showDatePicker && (
                                                        <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl">
                                                            <DayPicker
                                                                mode="single"
                                                                selected={selectedDate}
                                                                onSelect={(date) => {
                                                                    if (date) {
                                                                        setSelectedDate(date);
                                                                        setDueDate(formatDateInput(date));
                                                                        setShowDatePicker(false);
                                                                    }
                                                                }}
                                                                className="p-3"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {QUICK_DATE_PRESETS.map((p) => (
                                                            <button key={p.label} type="button" onClick={() => handleApplyQuickDate(p.offset)} className={quickActionBase}>{p.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Due Time */}
                                            <div>
                                                <label htmlFor="dueTime" className={labelBase}>Due Time <Required /></label>
                                                <div className="mt-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            id="dueTime"
                                                            type="time"
                                                            value={dueTime}
                                                            onChange={(e) => setDueTime(e.target.value)}
                                                            min={minDueTime}
                                                            required
                                                            className={inputBase}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowTimePicker(!showTimePicker)}
                                                            className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                                            aria-label="Open time picker"
                                                        >
                                                            ⏰
                                                        </button>
                                                    </div>
                                                    {showTimePicker && (
                                                        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                                                            <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
                                                                {TIME_OPTIONS.map((t) => (
                                                                    <button
                                                                        key={t}
                                                                        type="button"
                                                                        onClick={() => { setDueTime(t); setShowTimePicker(false); }}
                                                                        className={quickActionBase}
                                                                    >
                                                                        {t}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {QUICK_TIME_PRESETS.map((p) => (
                                                            <button key={p.label} type="button" onClick={() => setDueTime(p.value)} className={quickActionBase}>{p.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Estimated Hours */}
                                            <div>
                                                <label htmlFor="estimatedHours" className={labelBase}>Estimated Hours</label>
                                                <input
                                                    id="estimatedHours"
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    value={estimatedHours}
                                                    onChange={(e) => setEstimatedHours(e.target.value ? Number(e.target.value) : '')}
                                                    className={inputBase}
                                                    placeholder="e.g. 4"
                                                />
                                            </div>

                                            {/* Recurrence */}
                                            <div>
                                                <label htmlFor="recurrence" className={labelBase}>Recurrence</label>
                                                <SingleSelect
                                                    id="recurrence"
                                                    options={recurrenceOptions}
                                                    value={recurrenceRule}
                                                    onChange={(v) => setRecurrenceRule(v as RecurrenceRule)}
                                                    onOpenChange={handleAssignmentsSelectOpen}
                                                    placeholder="Select recurrence…"
                                                    className="mt-1"
                                                />
                                            </div>

                                            {/* Approval — ticket mode only */}
                                            {isTicketMode && (
                                                <div className="sm:col-span-2">
                                                    <label className={labelBase}>Approval</label>
                                                    <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                                                        <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={approvalRequired}
                                                                onChange={(e) => {
                                                                    setApprovalRequired(e.target.checked);
                                                                    if (!e.target.checked) setApproverId(null);
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                            Require approval
                                                        </label>
                                                        <select
                                                            value={approverId ?? ''}
                                                            onChange={(e) => setApproverId(e.target.value || null)}
                                                            disabled={!approvalRequired}
                                                            className={[inputBase, !approvalRequired ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}
                                                        >
                                                            <option value="">Select approver…</option>
                                                            {approverCandidates.map((c) => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Subtasks */}
                                    <section className={sectionBase}>
                                        <SectionHeading>Subtasks</SectionHeading>
                                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                            <input
                                                type="text"
                                                value={currentSubtask}
                                                onChange={(e) => setCurrentSubtask(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                                                placeholder="Add a subtask…"
                                                className={`${inputBase} flex-1`}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddSubtask}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                            >
                                                <PlusIcon className="h-4 w-4" />
                                                <span className="hidden sm:inline">Add</span>
                                            </button>
                                        </div>
                                        <ul className="mt-3 space-y-2">
                                            {subtasks.length === 0 ? (
                                                <li className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
                                                    No subtasks yet. Break this task down into steps.
                                                </li>
                                            ) : subtasks.map((sub, i) => (
                                                <li key={sub + i} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
                                                    <span className="flex-1">{sub}</span>
                                                    <button type="button" onClick={() => handleRemoveSubtask(i)} className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove subtask">
                                                        <XMarkIcon className="h-4 w-4" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>

                                    {/* Attachments */}
                                    <section className={sectionBase}>
                                        <SectionHeading>Attachments</SectionHeading>
                                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                            <input
                                                type="url"
                                                value={currentAttachment}
                                                onChange={(e) => setCurrentAttachment(e.target.value)}
                                                placeholder="https://…"
                                                className={`${inputBase} flex-1`}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddAttachment}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                            >
                                                <PlusIcon className="h-4 w-4" />
                                                <span className="hidden sm:inline">Add</span>
                                            </button>
                                        </div>
                                        <ul className="mt-3 space-y-2">
                                            {attachments.length === 0 ? (
                                                <li className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
                                                    No attachments linked yet.
                                                </li>
                                            ) : attachments.map((att, i) => (
                                                <li key={att + i} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm">
                                                    <span className="flex-1 truncate text-blue-600">{att}</span>
                                                    <button type="button" onClick={() => handleRemoveAttachment(i)} className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove attachment">
                                                        <XMarkIcon className="h-4 w-4" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>

                                    {/* Tags */}
                                    <section className={sectionBase}>
                                        <SectionHeading>Tags</SectionHeading>
                                        <div className="mt-4 space-y-3">
                                            <input
                                                type="text"
                                                value={currentTag}
                                                onChange={(e) => setCurrentTag(e.target.value)}
                                                onKeyDown={handleTagInput}
                                                placeholder="Type a tag and press Enter or comma"
                                                className={inputBase}
                                            />
                                            {filteredTagSuggestions.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {filteredTagSuggestions.map((tag) => (
                                                        <button key={tag} type="button" onClick={() => handleAddTagSuggestion(tag)} className={quickActionBase}>
                                                            + {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {tags.length === 0 ? (
                                                    <span className="text-sm text-gray-400">No tags yet.</span>
                                                ) : tags.map((tag, i) => (
                                                    <span key={tag + i} className={chipBase}>
                                                        {tag}
                                                        <button type="button" onClick={() => handleRemoveTag(i)} aria-label={`Remove ${tag}`} className="text-gray-400 hover:text-red-500 transition-colors">
                                                            <XMarkIcon className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </section>

                                    {/* Error */}
                                    {error && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                                            {error}
                                        </div>
                                    )}

                                    {/* Form actions */}
                                    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 pb-2 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-1">
                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="rounded-lg border border-sky-600 bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-sky-700 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                                        >
                                            {isSubmitting ? 'Creating…' : 'Create Task'}
                                        </button>
                                    </div>
                                </div>

                                {/* ════ RIGHT SIDEBAR ════ */}
                                <aside className="space-y-3 sm:space-y-4">

                                    {/* Live Preview */}
                                    <div className={`${sectionBase} space-y-4`}>
                                        <SectionHeading>Live Preview</SectionHeading>

                                        {/* Title + description preview */}
                                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                                            <p className="font-semibold leading-snug text-slate-900">
                                                {title.trim() || <span className="font-normal italic text-slate-400">Untitled task</span>}
                                            </p>
                                            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500">
                                                {description.trim() || 'Add a description above…'}
                                            </p>
                                        </div>

                                        {/* Readiness bar */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xs font-medium text-gray-600">{readinessLabel}</span>
                                                <span className="text-xs font-semibold text-gray-900">{readinessScore}%</span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${readinessColor}`}
                                                    style={{ width: `${readinessScore}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Stats grid */}
                                        <div className="space-y-2">
                                            {summaryStats.map((stat) => (
                                                <div key={stat.label} className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                                    <span className="mt-0.5 text-base leading-none">{stat.icon}</span>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
                                                        <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{stat.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Crew */}
                                    <div className={sectionBase}>
                                        <SectionHeading>Crew</SectionHeading>
                                        <div className="mt-3 space-y-2">
                                            {assignedUsers.length === 0 ? (
                                                <p className="text-sm text-gray-400">No assignees yet.</p>
                                            ) : assignedUsers.map((member) => {
                                                const avatar = getUserAvatarUrl(member);
                                                return (
                                                    <div key={member.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                                        <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                                                            {avatar ? (
                                                                <img src={avatar} alt={member.name} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500">
                                                                    {member.name.slice(0, 2)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-gray-800">{member.name}</p>
                                                            <p className="text-[10px] uppercase tracking-wider text-gray-400">{formatRoleLabel(member.role)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Tags preview */}
                                    {tags.length > 0 && (
                                        <div className={sectionBase}>
                                            <SectionHeading>Tags</SectionHeading>
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {tags.map((tag) => (
                                                    <span key={'preview-' + tag} className={chipBase}>{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Suggestions */}
                                    {summaryNotes.length > 0 && (
                                        <div className={sectionBase}>
                                            <SectionHeading>Suggestions</SectionHeading>
                                            <ul className="mt-3 space-y-2">
                                                {summaryNotes.map((note, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-500">
                                                        <span className="mt-0.5 flex-shrink-0 text-amber-400">→</span>
                                                        {note}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </aside>

                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* AI modal */}
            {isAiModalOpen && (
                <GenerateTaskWithAIModal
                    isOpen={isAiModalOpen}
                    onClose={() => setIsAiModalOpen(false)}
                    onTaskGenerated={handleTaskGenerated}
                />
            )}
        </>
    );
};

// ─── Small helpers ────────────────────────────────────────────────────────────

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-sm font-medium tracking-wide text-slate-700">{children}</h3>
);

const Required: React.FC = () => (
    <span className="ml-0.5 text-red-400">*</span>
);

export default CreateTaskModal;
