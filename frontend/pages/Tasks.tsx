import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Task, User, TaskStatus, TaskPriority, CUSTOM_STATUS_NAMES, Role, TaskKanbanResponse } from '../types';
import { useAuth, useTheme } from '../hooks/useAuth';
import { useTaskList } from '../hooks/useTaskList';
import { useTaskPrefetch } from '../hooks/useTaskPrefetch';
import { useTaskWebSocket } from '../hooks/useTaskWebSocket';
import { buildTaskKanbanKey, getTaskCaches, invalidateTaskCaches } from '../hooks/useTaskCache';
import api from '../services/mockApi';
import { loadPointsConfig, POINTS_CONFIG_UPDATED_EVENT } from '../utils/pointsConfigStorage';
import { formatDate, timeAgo } from '../utils';
import { augmentTasksWithPoints, summarizeTaskPoints, formatPointsValue, TaskPointsTone } from '../utils/taskPoints';
import { PlusIcon, TagIcon, FunnelIcon } from '../components/icons';
import TaskStatusBadge from '../components/ui/TaskStatusBadge';
import TaskPriorityBadge from '../components/ui/TaskPriorityBadge';
import CreateTaskModal from '../components/CreateTaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskTemplateModal from '../components/TaskTemplateModal';

type ThemeMode = 'light' | 'dark' | 'colorful' | 'system';
type ResolvedTheme = 'light' | 'dark' | 'colorful';

const resolveTheme = (theme: ThemeMode): ResolvedTheme => {
    if (theme === 'colorful') return 'colorful';
    if (theme === 'light') return 'light';
    if (theme === 'dark') return 'dark';
    if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
};

const useResolvedTheme = (theme: ThemeMode): ResolvedTheme => {
    const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme));

    useEffect(() => {
        if (theme === 'system') {
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            const listener = () => setResolved(media.matches ? 'dark' : 'light');
            listener();
            media.addEventListener('change', listener);
            return () => media.removeEventListener('change', listener);
        }
        setResolved(resolveTheme(theme));
    }, [theme]);

    return resolved;
};

const completedStatuses = new Set<TaskStatus>([TaskStatus.DONE]);
const activeStatuses = new Set<TaskStatus>([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW]);
const overdueExcludedStatuses = new Set<TaskStatus>([TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.GRAVEYARD]);

const STATUS_ORDER: TaskStatus[] = [
    TaskStatus.WAITING_FOR_REQUIREMENT,
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.IN_REVIEW,
    TaskStatus.ON_HOLD,
    TaskStatus.DONE,
    TaskStatus.FAILED,
    TaskStatus.GRAVEYARD,
];

const TASK_STAGE_LIGHT_TONES: Record<TaskStatus, string> = {
    [TaskStatus.WAITING_FOR_REQUIREMENT]: 'border-sky-200 bg-sky-50/75',
    [TaskStatus.TODO]: 'border-blue-200 bg-blue-50/75',
    [TaskStatus.IN_PROGRESS]: 'border-amber-200 bg-amber-50/80',
    [TaskStatus.BLOCKED]: 'border-orange-200 bg-orange-50/80',
    [TaskStatus.IN_REVIEW]: 'border-yellow-200 bg-yellow-50/75',
    [TaskStatus.ON_HOLD]: 'border-slate-200 bg-slate-50/85',
    [TaskStatus.DONE]: 'border-emerald-200 bg-emerald-50/80',
    [TaskStatus.FAILED]: 'border-rose-200 bg-rose-50/80',
    [TaskStatus.GRAVEYARD]: 'border-zinc-200 bg-zinc-50/80',
};

type FilterOption = {
    value: string;
    label: string;
};

const ChevronIcon: React.FC<{ open: boolean; className?: string }> = ({ open, className }) => (
    <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className={`${className ?? ''} ${open ? 'rotate-180' : ''}`.trim()}
    >
        <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const FilterDropdown: React.FC<{
    value: string;
    placeholder: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    buttonClassName: string;
    menuClassName: string;
    itemClassName: string;
    activeItemClassName: string;
}> = ({ value, placeholder, options, onChange, buttonClassName, menuClassName, itemClassName, activeItemClassName }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;

    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (event: MouseEvent) => {
            if (!wrapperRef.current || wrapperRef.current.contains(event.target as Node)) return;
            setIsOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [isOpen]);

    return (
        <div ref={wrapperRef} className="relative w-full min-w-0 sm:min-w-[190px]">
            <button
                type="button"
                className={`${buttonClassName} flex w-full items-center justify-between gap-3 text-left`}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className={value ? '' : 'opacity-80'}>{selectedLabel}</span>
                <ChevronIcon open={isOpen} className="h-4 w-4 shrink-0 opacity-80 transition" />
            </button>
            {isOpen && (
                <div className={`absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-b-[12px] border ${menuClassName}`}>
                    <div className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
                        {options.map((option) => {
                            const isActive = option.value === value;
                            return (
                                <button
                                    key={option.value || option.label}
                                    type="button"
                                    role="option"
                                    aria-selected={isActive}
                                    className={`${itemClassName} ${isActive ? activeItemClassName : ''}`}
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [usersMap, setUsersMap] = useState<Map<string, User>>(new Map());
    const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalTasks, setTotalTasks] = useState(0);
    const [statusCounts, setStatusCounts] = useState<Record<TaskStatus, number>>({} as Record<TaskStatus, number>);
    const [kanbanData, setKanbanData] = useState<TaskKanbanResponse | null>(null);
    const [kanbanLoading, setKanbanLoading] = useState(false);
    const [kanbanRefreshTick, setKanbanRefreshTick] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const { user } = useAuth();
    const { theme } = useTheme();
    const resolvedTheme = useResolvedTheme(theme as ThemeMode);
    const isDark = resolvedTheme === 'dark';
    const isColorful = resolvedTheme === 'colorful';
    const isLight = resolvedTheme === 'light';

    const taskTextColor = isDark ? 'text-white' : 'text-slate-900';
    const taskTextSecondary = isDark ? 'text-white/80' : 'text-slate-700';
    const taskTextMuted = isDark ? 'text-white/70' : 'text-slate-600';
    const taskBgSecondary = isDark ? 'bg-black/30' : 'bg-slate-200/50';
    const taskTagText = isDark ? 'text-white/80' : 'text-slate-800';

    const getPointsBadgeClass = useCallback(
        (tone: TaskPointsTone | undefined) => {
            if (tone === 'positive') {
                return isDark
                    ? 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-700';
            }
            if (tone === 'negative') {
                return isDark
                    ? 'border border-rose-400/50 bg-rose-500/15 text-rose-100'
                    : 'border border-rose-400/60 bg-rose-500/10 text-rose-700';
            }
            if (tone === 'warning') {
                return isDark
                    ? 'border border-amber-400/50 bg-amber-500/15 text-amber-100'
                    : 'border border-amber-400/60 bg-amber-500/10 text-amber-700';
            }
            return isDark
                ? 'border border-white/25 bg-white/10 text-white'
                : 'border border-slate-300 bg-slate-100 text-slate-700';
        },
        [isDark],
    );

    const renderPointsBadge = useCallback(
        (taskItem: Task) => {
            if (!taskItem.pointsBreakdown) return null;
            const summary = summarizeTaskPoints(taskItem.pointsBreakdown);
            const badgeClass = getPointsBadgeClass(summary.tone);
            const notes = taskItem.pointsBreakdown.notes.length > 0 ? taskItem.pointsBreakdown.notes.join(' | ') : '';
            const tooltip = [summary.detail, notes].filter(Boolean).join(' | ');
            return (
                <div className={'mt-2 flex flex-wrap items-center gap-2 text-xs ' + taskTextMuted}>
                    <span
                        className={'inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ' + badgeClass}
                        title={tooltip || undefined}
                    >
                        {summary.label}: {formatPointsValue(summary.value)}
                    </span>
                    {summary.detail && <span className="text-[11px]">{summary.detail}</span>}
                </div>
            );
        },
        [getPointsBadgeClass, taskTextMuted],
    );

    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

    const [statusFilter, setStatusFilter] = useState<string>('');
    const [priorityFilter, setPriorityFilter] = useState<string>('');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('');
    const [teamFilter, setTeamFilter] = useState<string>('');
    const [tagFilter, setTagFilter] = useState<string>('');
    const [dueDateFilter, setDueDateFilter] = useState<string>('');
    const [creationDateFilter, setCreationDateFilter] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('status');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [quickFilter, setQuickFilter] = useState<string>('');
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'kanban'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('taskViewMode');
            if (saved === 'list' || saved === 'grid' || saved === 'kanban') return saved;
        }
        return 'list';
    });

    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSizeByView, setPageSizeByView] = useState<Record<'list' | 'grid' | 'kanban', number>>({
        list: 20,
        grid: 10,
        kanban: 10,
    });

    const changeViewMode = (mode: 'list' | 'grid' | 'kanban') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taskViewMode', mode);
        }
    };

    const location = useLocation();
    const { id: routeTaskId } = useParams<{ id?: string }>();

    useEffect(() => {
        setSearchQuery('');
        setDebouncedSearchQuery('');
    }, []);

    useEffect(() => {
        const normalized = searchQuery.trim();

        // Avoid triggering search calls for short inputs.
        if (normalized.length > 0 && normalized.length < 2) {
            setDebouncedSearchQuery((prev) => (prev === '' ? prev : ''));
            return undefined;
        }

        const timer = window.setTimeout(() => {
            // Prevent duplicate state updates for the same term.
            setDebouncedSearchQuery((prev) => (prev === normalized ? prev : normalized));
        }, 500);

        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    const isSearchInputTooShort = searchQuery.trim().length > 0 && searchQuery.trim().length < 2;

    useEffect(() => {
        try {
            const params = new URLSearchParams(location.search);
            const taskIdParam = params.get('taskId');
            const candidateTaskId = routeTaskId || taskIdParam;
            if (candidateTaskId) {
                setSelectedTaskId(decodeURIComponent(candidateTaskId));
            }
        } catch (err) {
            // ignore malformed query
        }
    }, [location.search, routeTaskId]);

    const pageSize = pageSizeByView[viewMode];
    const apiPageSize = viewMode === 'grid' ? pageSize * 3 : pageSize;

    const listParams = useMemo(
        () => ({
            viewMode,
            page: currentPage,
            pageSize: apiPageSize,
            search: debouncedSearchQuery || undefined,
            status: statusFilter ? (statusFilter as TaskStatus) : undefined,
            priority: priorityFilter ? (priorityFilter as TaskPriority) : undefined,
            assigneeId: assigneeFilter || undefined,
            team: teamFilter || undefined,
            tag: tagFilter || undefined,
            dueDate: dueDateFilter || undefined,
            createdDate: creationDateFilter || undefined,
            quickFilter: quickFilter || undefined,
            sortBy: sortBy || undefined,
            sortOrder: sortOrder,
        }),
        [
            viewMode,
            currentPage,
            apiPageSize,
            debouncedSearchQuery,
            statusFilter,
            priorityFilter,
            assigneeFilter,
            teamFilter,
            tagFilter,
            dueDateFilter,
            creationDateFilter,
            quickFilter,
            sortBy,
            sortOrder,
        ],
    );

    const { data: pageResult, loading: listLoading, refresh: refreshTasks } = useTaskList({
        params: listParams,
        enabled: Boolean(user) && !isSearchInputTooShort,
    });

    const { kanbanCache, ttlMs } = useMemo(() => getTaskCaches(), []);

    const loading = listLoading;

    useEffect(() => {
        if (!pageResult) return;
        const tasksWithPoints = augmentTasksWithPoints(pageResult.items);
        setTasks(tasksWithPoints);
        setTotalPages(pageResult.totalPages);
        setTotalTasks(pageResult.total);
        setStatusCounts(pageResult.statusCounts ?? {} as Record<TaskStatus, number>);
    }, [pageResult]);

    useEffect(() => {
        if (!user) return;
        const loadMetadata = async () => {
            try {
                const [allUsers, deptData] = await Promise.all([api.getUsers(), api.getDepartments()]);
                const map = new Map<string, User>();
                allUsers.forEach((entry) => map.set(entry.id, entry));
                setUsersMap(map);
                const departmentNames = Array.from(
                    new Set((deptData ?? []).map((dept) => dept.name).filter((name): name is string => Boolean(name))),
                ).sort((a, b) => a.localeCompare(b));
                setDepartmentOptions(departmentNames);
            } catch (error: unknown) {
                console.error('Failed to fetch task metadata:', error);
            }
        };
        loadMetadata();
    }, [user]);

    const kanbanParams = useMemo(
        () => ({
            pageSize: pageSizeByView.kanban,
            search: debouncedSearchQuery || undefined,
            priority: priorityFilter ? (priorityFilter as TaskPriority) : undefined,
            assigneeId: assigneeFilter || undefined,
            team: teamFilter || undefined,
            tag: tagFilter || undefined,
            dueDate: dueDateFilter || undefined,
            createdDate: creationDateFilter || undefined,
            quickFilter: quickFilter || undefined,
        }),
        [
            pageSizeByView.kanban,
            debouncedSearchQuery,
            priorityFilter,
            assigneeFilter,
            teamFilter,
            tagFilter,
            dueDateFilter,
            creationDateFilter,
            quickFilter,
        ],
    );

    const kanbanCacheKey = useMemo(() => buildTaskKanbanKey(kanbanParams), [kanbanParams]);

    useEffect(() => {
        if (!user) return;
        if (isSearchInputTooShort) {
            setKanbanLoading(false);
            return;
        }
        const cached = kanbanCache.get(kanbanCacheKey);
        if (cached) {
            setKanbanData(cached);
            setKanbanLoading(false);
        }
        const shouldFetch = !cached || kanbanRefreshTick > 0;
        if (!shouldFetch) return;

        setKanbanLoading(!cached);
        api
            .getTasksKanban({
                pageSize: kanbanParams.pageSize,
                search: kanbanParams.search,
                priority: kanbanParams.priority,
                assigneeId: kanbanParams.assigneeId,
                team: kanbanParams.team,
                tag: kanbanParams.tag,
                dueDate: kanbanParams.dueDate,
                createdDate: kanbanParams.createdDate,
                quickFilter: kanbanParams.quickFilter,
            })
            .then((response) => {
                if (!response) return;
                kanbanCache.set(kanbanCacheKey, response, ttlMs);
                setKanbanData(response);
            })
            .catch((error: unknown) => {
                console.error('Failed to fetch kanban tasks:', error);
            })
            .finally(() => setKanbanLoading(false));
    }, [user, kanbanCache, kanbanCacheKey, kanbanParams, kanbanRefreshTick, ttlMs, isSearchInputTooShort]);

    const prefetchBaseParams = useMemo(() => {
        const { page, ...rest } = listParams;
        return rest;
    }, [listParams]);

    const prefetchPages = useMemo(() => [currentPage + 1, currentPage + 2], [currentPage]);

    useTaskPrefetch({
        baseParams: prefetchBaseParams,
        pages: prefetchPages,
        enabled: Boolean(user) && !isSearchInputTooShort,
        visibleTasks: tasks,
        kanbanParams,
    });

    const handleTaskEvent = useCallback(() => {
        invalidateTaskCaches();
        setKanbanRefreshTick((prev) => prev + 1);
        refreshTasks();
    }, [refreshTasks]);

    useTaskWebSocket({
        enabled: Boolean(user),
        onEvent: handleTaskEvent,
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handlePointsConfigChange = () => {
            setTasks((previous) => augmentTasksWithPoints(previous, { config: loadPointsConfig() }));
        };
        window.addEventListener(POINTS_CONFIG_UPDATED_EVENT, handlePointsConfigChange);
        return () => window.removeEventListener(POINTS_CONFIG_UPDATED_EVENT, handlePointsConfigChange);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [
        viewMode,
        debouncedSearchQuery,
        statusFilter,
        priorityFilter,
        assigneeFilter,
        teamFilter,
        tagFilter,
        dueDateFilter,
        creationDateFilter,
        sortBy,
        sortOrder,
        quickFilter,
        pageSizeByView,
    ]);

    const formatAssigneeNames = useCallback(
        (assigneeIds: string[] | null) => {
            if (!assigneeIds || assigneeIds.length === 0) return 'Unassigned';
            const names = assigneeIds
                .map((id) => usersMap.get(id)?.name || '')
                .filter((name) => name !== '');
            return names.length === 0 ? 'Unassigned' : names.join(', ');
        },
        [usersMap],
    );

    const filteredTasks = useMemo(() => tasks, [tasks]);
    const pagedTasks = useMemo(() => filteredTasks, [filteredTasks]);

    const kanbanTaskIds = useMemo(() => {
        if (!kanbanData) return [];
        const ids = kanbanData.columns.flatMap((column) => column.items.map((task) => task.id));
        return Array.from(new Set(ids));
    }, [kanbanData]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const visibleTaskIds = useMemo(() => {
        if (viewMode !== 'kanban') return pagedTasks.map((task) => task.id);
        return kanbanTaskIds;
    }, [viewMode, pagedTasks, kanbanTaskIds]);

    const handleDeleteTask = async (taskId: string) => {
        if (!user) return;
        try {
            await api.deleteTask(taskId);
            setTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
            setSelectedTaskIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(taskId);
                return newSet;
            });
            if (selectedTaskId === taskId) setSelectedTaskId(null);
            refreshTasks();
        } catch (error: unknown) {
            console.error('Failed to delete task:', error);
        }
    };

    const handleBulkDelete = async () => {
        if (!user || selectedTaskIds.size === 0) return;
        try {
            await Promise.all(Array.from(selectedTaskIds).map((taskId) => api.deleteTask(taskId)));
            setTasks((prevTasks) => prevTasks.filter((task) => !selectedTaskIds.has(task.id)));
            setSelectedTaskIds(new Set());
            setSelectedTaskId(null);
            refreshTasks();
        } catch (error: unknown) {
            console.error('Failed to bulk delete tasks:', error);
        }
    };

    const toggleSelectTask = (taskId: string) => {
        setSelectedTaskIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) newSet.delete(taskId);
            else newSet.add(taskId);
            return newSet;
        });
    };

    const selectAllTasks = () => setSelectedTaskIds(new Set(visibleTaskIds));
    const deselectAllTasks = () => setSelectedTaskIds(new Set());

    const allSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id));

    const toggleSelectAll = () => {
        if (allSelected) deselectAllTasks();
        else selectAllTasks();
    };

    const getTaskCardToneClass = useCallback(
        (taskItem: Pick<Task, 'status' | 'priority' | 'dueAt'>) => {
            if (!isLight) return 'border-slate-200 bg-white';
            const isTaskOverdue =
                Boolean(taskItem.dueAt) &&
                !overdueExcludedStatuses.has(taskItem.status) &&
                new Date(taskItem.dueAt).getTime() < Date.now();
            const stageTone = isTaskOverdue
                ? 'border-rose-200 bg-rose-50/85'
                : TASK_STAGE_LIGHT_TONES[taskItem.status] ?? 'border-slate-200 bg-slate-50/85';
            const priorityTone =
                taskItem.priority === TaskPriority.URGENT
                    ? 'ring-1 ring-inset ring-rose-200'
                    : taskItem.priority === TaskPriority.HIGH
                    ? 'ring-1 ring-inset ring-orange-200'
                    : taskItem.priority === TaskPriority.LOW
                    ? 'ring-1 ring-inset ring-emerald-200'
                    : 'ring-1 ring-inset ring-sky-100';
            return `${stageTone} ${priorityTone}`;
        },
        [isLight],
    );

    const completedCount = useMemo(() => {
        if (Object.keys(statusCounts).length === 0) {
            return filteredTasks.filter((task) => completedStatuses.has(task.status)).length;
        }
        return Array.from(completedStatuses).reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0);
    }, [statusCounts, filteredTasks]);

    const urgentCount = filteredTasks.filter((task) => task.priority === TaskPriority.URGENT).length;

    const activeCount = useMemo(() => {
        if (Object.keys(statusCounts).length === 0) {
            return filteredTasks.filter((task) => activeStatuses.has(task.status)).length;
        }
        return Array.from(activeStatuses).reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0);
    }, [statusCounts, filteredTasks]);

    const blockedCount = filteredTasks.filter((task) => task.status === TaskStatus.BLOCKED).length;

    const overdueCount = filteredTasks.filter((task) =>
        task.dueAt ? new Date(task.dueAt).getTime() < Date.now() : false,
    ).length;

    const statusSummary = useMemo(
        () =>
            STATUS_ORDER.map((status) => ({
                status,
                label: CUSTOM_STATUS_NAMES[status]?.name ?? status,
                count: statusCounts[status] ?? 0,
            })),
        [statusCounts],
    );

    const newsItems = useMemo(() => {
        if (tasks.length === 0) return [];
        const sorted = [...tasks].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        return sorted.slice(0, 8).map((task) => {
            const creatorName = usersMap.get(task.createdBy)?.name || 'Someone';
            const assigneeNames = (task.assignedTo ?? [])
                .map((id) => usersMap.get(id)?.name)
                .filter((name): name is string => Boolean(name));
            const assigneeLabel = assigneeNames.length > 0 ? assigneeNames.join(', ') : 'unassigned';
            const departmentLabel = task.team || 'General';
            const statusLabel = CUSTOM_STATUS_NAMES[task.status]?.name ?? task.status;
            return {
                id: task.id,
                title: task.title || 'Untitled task',
                department: departmentLabel,
                creator: creatorName,
                assignee: assigneeLabel,
                priority: task.priority,
                status: statusLabel,
            };
        });
    }, [tasks, usersMap]);

    const newsTickerItems = useMemo(() => {
        if (newsItems.length === 0) return [];
        return newsItems.length > 1 ? [...newsItems, ...newsItems] : newsItems;
    }, [newsItems]);

    const shouldAnimateNews = newsItems.length > 1;

    const canSeeTaskCounts = Boolean(user && [Role.MANAGER, Role.ADMIN, Role.OWNER].includes(user.role));

    const xpScore = completedCount * 160 + activeCount * 60 + urgentCount * 90;
    const baseLevel = 600;
    const level = Math.max(1, Math.floor(xpScore / baseLevel) + 1);
    const levelProgress = Math.min(100, ((xpScore % baseLevel) / baseLevel) * 100);

    const createdByFilterActive = quickFilter === 'createdByMe';

    const statusOptions = useMemo(
        () => [
            { value: '', label: 'All Statuses' },
            ...STATUS_ORDER.map((status) => ({
                value: String(status),
                label: CUSTOM_STATUS_NAMES[status as TaskStatus]?.name || status.replace('_', ' '),
            })),
        ],
        [],
    );

    const priorityOptions = useMemo(
        () => [
            { value: '', label: 'All Priorities' },
            ...Object.values(TaskPriority).map((priority) => ({
                value: priority,
                label: priority,
            })),
        ],
        [],
    );

    const assigneeOptions = useMemo(() => {
        const list = Array.from(usersMap.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entry) => ({ value: entry.id, label: entry.name }));
        return [{ value: '', label: 'All Assignees' }, ...list];
    }, [usersMap]);

    const teamOptions = useMemo(
        () => [{ value: '', label: 'All Teams' }, ...departmentOptions.map((department) => ({ value: department, label: department }))],
        [departmentOptions],
    );

    const sortByOptions = useMemo(
        () => [
            { value: 'dueAt', label: 'Due Date' },
            { value: 'priority', label: 'Priority' },
            { value: 'status', label: 'Status' },
            { value: 'assignee', label: 'Assignee' },
            { value: 'lastUpdated', label: 'Last Updated' },
            { value: 'title', label: 'Title' },
        ],
        [],
    );

    const sortOrderOptions = useMemo(
        () => [
            { value: 'asc', label: 'Ascending' },
            { value: 'desc', label: 'Descending' },
        ],
        [],
    );

    const handleTaskClick = (taskId: string) => setSelectedTaskId(taskId);

    const handleCloseDetailModal = () => {
        setSelectedTaskId(null);
        refreshTasks();
    };

    const handleTaskCreated = () => {
        setCreateModalOpen(false);
        refreshTasks();
    };

    // ──────────────────────────────────────────────────────────────
    //          IMPROVED UI CLASSES (light theme friendly)
    // ──────────────────────────────────────────────────────────────

    const mainContainerClass = isLight
        ? 'bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden mx-auto max-w-7xl'
        : 'bg-slate-900/40 border border-slate-700/50 rounded-2xl shadow-xl backdrop-blur-sm mx-auto max-w-7xl';

    const headerClass = isLight
        ? 'bg-slate-50/80 border-b border-slate-300 px-5 py-4'
        : 'bg-slate-900/70 border-b border-slate-700 px-5 py-4';

    const sectionDividerClass = isLight ? 'border-t border-slate-300' : 'border-t border-slate-700/60';

    const updatesBarClass = isLight
        ? 'bg-white'
        : 'bg-slate-800/60 border border-slate-700 rounded-xl shadow-md';

    const quickFiltersContainerClass = isLight
        ? 'bg-white'
        : 'bg-slate-800/60 border border-slate-700 rounded-xl shadow-md';

    const filterPanelClass = isLight
        ? 'bg-white'
        : 'bg-slate-800/50 border border-slate-700 rounded-xl shadow-md';

    const cardBaseClass = isLight
        ? 'bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow'
        : 'bg-slate-800/60 border border-slate-700 hover:border-slate-500 shadow-sm hover:shadow-md';

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
                Loading tasks...
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10 bg-slate-50/60">
            <div className={mainContainerClass}>
                <style>{`
                    @keyframes taskNewsTicker {
                        0% { transform: translate3d(0, 0, 0); }
                        100% { transform: translate3d(-50%, 0, 0); }
                    }
                `}</style>
                {/* Header */}
                <div className={headerClass}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-800 sm:text-3xl">
                            Tasks
                        </h1>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                                className="md:hidden inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                <FunnelIcon className="h-4 w-4" />
                                {isMobileFiltersOpen ? 'Hide Filters' : 'Filters'}
                            </button>
                            <button
                                onClick={() => setCreateModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Create Task
                            </button>
                        </div>
                    </div>
                </div>

                {/* Updates bar */}
                <div className={`px-5 py-3 ${updatesBarClass}`}>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline-block rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                            Updates
                        </span>
                        <div className="flex-1 overflow-hidden">
                            {newsItems.length === 0 ? (
                                <span className="text-sm text-slate-500">No task updates yet.</span>
                            ) : (
                                <div
                                    className="flex w-max items-center gap-6 pr-8 text-sm text-slate-600"
                                    style={
                                        shouldAnimateNews
                                            ? {
                                                  animation: 'taskNewsTicker 80s linear infinite',
                                                  willChange: 'transform',
                                                  backfaceVisibility: 'hidden',
                                              }
                                            : undefined
                                    }
                                >
                                    {newsTickerItems.map((item, index) => (
                                        <span key={`${item.id}-${index}`} className="whitespace-nowrap">
                                            <span className="font-semibold text-slate-700">{item.department}</span>
                                            <span className="text-slate-500"> team: </span>
                                            <span className="font-semibold text-slate-700">{item.creator}</span>
                                            <span className="text-slate-500"> created </span>
                                            <span className="text-sky-700">"{item.title}"</span>
                                            <span className="text-slate-500"> for </span>
                                            <span className="font-semibold text-slate-700">{item.assignee}</span>
                                            <span className="text-slate-500">. Status: </span>
                                            <span className="font-semibold text-slate-700">{item.status}</span>
                                            <span
                                                className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
                                                    item.priority === TaskPriority.URGENT
                                                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                                                        : item.priority === TaskPriority.HIGH
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700'
                                                        : item.priority === TaskPriority.MEDIUM
                                                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                        : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                }`}
                                            >
                                                {item.priority}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={sectionDividerClass} />

                {/* Quick filters */}
                <div className={`px-5 pt-4 pb-3 ${quickFiltersContainerClass}`}>
                    <div className="flex flex-nowrap gap-2.5 overflow-x-auto custom-scrollbar pb-1">
                        <button
                            onClick={() => setQuickFilter(quickFilter === 'myTasks' ? '' : 'myTasks')}
                            className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 shrink-0 ${
                                quickFilter === 'myTasks'
                                    ? isLight
                                        ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                        : isColorful
                                        ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                        : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                    : isLight
                                    ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                    : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                            }`}
                        >
                            My Tasks
                        </button>

                        <button
                            onClick={() => setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue')}
                            className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 shrink-0 ${
                                quickFilter === 'overdue'
                                    ? isLight
                                        ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                        : isColorful
                                        ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                        : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                    : isLight
                                    ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                    : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                            }`}
                        >
                            Overdue
                        </button>

                        <button
                            onClick={() => setQuickFilter(quickFilter === 'completed' ? '' : 'completed')}
                            className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 shrink-0 ${
                                quickFilter === 'completed'
                                    ? isLight
                                        ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                        : isColorful
                                        ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                        : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                    : isLight
                                    ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                    : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                            }`}
                        >
                            Completed
                        </button>
                    </div>
                </div>

                <div className={sectionDividerClass} />

                {/* Filters & view controls */}
                <div className={`px-5 py-5 ${filterPanelClass}`}>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 ${isMobileFiltersOpen ? 'block' : 'hidden md:grid'}`}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] w-full ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60 placeholder:text-slate-500'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60 placeholder:text-white'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60 placeholder:text-sky-100'
                            }`}
                            placeholder="Search tasks"
                        />

                        <FilterDropdown
                            value={statusFilter}
                            placeholder="All Statuses"
                            options={statusOptions}
                            onChange={setStatusFilter}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />

                        <FilterDropdown
                            value={priorityFilter}
                            placeholder="All Priorities"
                            options={priorityOptions}
                            onChange={setPriorityFilter}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />

                        <FilterDropdown
                            value={assigneeFilter}
                            placeholder="All Assignees"
                            options={assigneeOptions}
                            onChange={setAssigneeFilter}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />

                        <FilterDropdown
                            value={teamFilter}
                            placeholder="All Teams"
                            options={teamOptions}
                            onChange={setTeamFilter}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />

                        <input
                            type="text"
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                            className={`h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] w-full ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60 placeholder:text-slate-500'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60 placeholder:text-white'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60 placeholder:text-sky-100'
                            }`}
                            placeholder="Filter by Tag"
                        />

                        <input
                            type="date"
                            value={dueDateFilter}
                            onChange={(e) => setDueDateFilter(e.target.value)}
                            className={`h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] w-full ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            style={{ colorScheme: isLight ? 'light' : 'dark' }}
                        />

                        <input
                            type="date"
                            value={creationDateFilter}
                            onChange={(e) => setCreationDateFilter(e.target.value)}
                            className={`h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] w-full ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            style={{ colorScheme: isLight ? 'light' : 'dark' }}
                        />

                        <FilterDropdown
                            value={sortBy}
                            placeholder="Sort By"
                            options={sortByOptions}
                            onChange={setSortBy}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />

                        <FilterDropdown
                            value={sortOrder}
                            placeholder="Sort Order"
                            options={sortOrderOptions}
                            onChange={(value) => setSortOrder(value as 'asc' | 'desc')}
                            buttonClassName={`kanban-filter-control h-11 rounded-xl border px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 font-semibold uppercase tracking-[0.22em] ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 shadow-sm focus:border-sky-400/80 focus:ring-sky-300/60'
                                    : isColorful
                                    ? 'border-fuchsia-300/70 text-white bg-gradient-to-b from-indigo-950/85 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(30,27,75,0.5)] focus:border-fuchsia-200/80 focus:ring-fuchsia-300/60'
                                    : 'border-slate-500/40 text-slate-100 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-black/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_18px_rgba(2,6,23,0.55)] focus:border-cyan-200/80 focus:ring-cyan-300/60'
                            }`}
                            menuClassName={
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-800 shadow-lg'
                                    : isColorful
                                    ? 'border-fuchsia-300/40 bg-[#120a2e]/95 text-white shadow-[0_20px_45px_rgba(30,27,75,0.7)]'
                                    : 'border-slate-500/40 bg-[#081229]/95 text-slate-100 shadow-[0_20px_45px_rgba(2,6,23,0.7)]'
                            }
                            itemClassName={`w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                                isLight ? 'text-slate-700 hover:bg-slate-200/80' : isColorful ? 'text-white/90 hover:bg-white/10' : 'text-slate-100 hover:bg-white/10'
                            }`}
                            activeItemClassName={
                                isLight
                                    ? 'bg-sky-200/80 text-slate-900'
                                    : isColorful
                                    ? 'bg-fuchsia-500/35 text-white'
                                    : 'bg-sky-500/30 text-white'
                            }
                        />
                    </div>

                    {/* View mode + bulk actions */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/70 pt-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => changeViewMode('list')}
                                className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 ${
                                    viewMode === 'list'
                                        ? isLight
                                            ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                            : isColorful
                                            ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                            : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                        : isLight
                                        ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                        : isColorful
                                        ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                        : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                                }`}
                            >
                                List
                            </button>

                            <button
                                onClick={() => changeViewMode('grid')}
                                className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 ${
                                    viewMode === 'grid'
                                        ? isLight
                                            ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                            : isColorful
                                            ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                            : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                        : isLight
                                        ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                        : isColorful
                                        ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                        : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                                }`}
                            >
                                Grid
                            </button>

                            <button
                                onClick={() => changeViewMode('kanban')}
                                className={`group relative isolate inline-flex h-10 items-center justify-center overflow-hidden rounded-xl border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 ${
                                    viewMode === 'kanban'
                                        ? isLight
                                            ? 'border-sky-300 bg-sky-100 text-sky-800 shadow-sm focus-visible:ring-sky-300/70'
                                            : isColorful
                                            ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-white shadow-sm focus-visible:ring-fuchsia-300/60'
                                            : 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 shadow-sm focus-visible:ring-cyan-300/70'
                                        : isLight
                                        ? 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-sky-300/60'
                                        : isColorful
                                        ? 'border-white/20 bg-white/10 text-white/85 shadow-sm hover:border-white/35 hover:text-white focus-visible:ring-fuchsia-300/60'
                                        : 'border-slate-500/50 bg-slate-900/50 text-slate-100 shadow-sm hover:border-slate-400/70 hover:text-white focus-visible:ring-cyan-300/70'
                                }`}
                            >
                                Kanban
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleSelectAll}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-50"
                                disabled={visibleTaskIds.length === 0}
                            >
                                {allSelected ? 'Deselect All' : 'Select All'}
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:border-slate-200 disabled:text-slate-400"
                                disabled={selectedTaskIds.size === 0}
                            >
                                Delete Selected ({selectedTaskIds.size})
                            </button>
                        </div>
                    </div>
                </div>

                <div className={sectionDividerClass} />

                {/* Tasks content area */}
                <div className="px-4 py-6 sm:px-6">
                    <div className="grid gap-4 md:gap-5">
                        {viewMode === 'list' &&
                            pagedTasks.map((task) => {
                                const showReadMore = task.description.trim().length > 100;
                                const taskToneClass = getTaskCardToneClass(task);
                                return (
                                    <div
                                        key={task.id}
                                        className={`rounded-xl p-4 cursor-pointer transition-all ${cardBaseClass} ${taskToneClass}`}
                                        onClick={() => handleTaskClick(task.id)}
                                    >
                                        <div className="flex items-start gap-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedTaskIds.has(task.id)}
                                                onChange={() => toggleSelectTask(task.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-semibold text-slate-800 line-clamp-2">{task.title}</h3>
                                                <p className="text-sm text-slate-600 line-clamp-2 break-words overflow-hidden">{task.description}</p>
                                                {showReadMore && (
                                                    <span className="mt-1 inline-block text-xs font-semibold text-sky-700">Read more..</span>
                                                )}
                                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                    <TaskStatusBadge status={task.status} />
                                                    <TaskPriorityBadge priority={task.priority} />
                                                    <span className="text-xs text-slate-500">
                                                        Assigned to: {formatAssigneeNames(task.assignedTo)}
                                                    </span>
                                                </div>
                                                {renderPointsBadge(task)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                        {viewMode === 'grid' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                                {pagedTasks.map((task) => {
                                    const showReadMore = task.description.trim().length > 100;
                                    const taskToneClass = getTaskCardToneClass(task);
                                    return (
                                        <div
                                            key={task.id}
                                            className={`relative rounded-xl p-4 cursor-pointer transition-all ${cardBaseClass} ${taskToneClass}`}
                                            onClick={() => handleTaskClick(task.id)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedTaskIds.has(task.id)}
                                                onChange={() => toggleSelectTask(task.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute top-3 left-3 z-10 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                            />
                                            <div className="pl-10 pt-1">
                                                <h3 className="min-h-[3rem] font-semibold text-slate-800 line-clamp-2">{task.title}</h3>
                                                <p className="min-h-[2.5rem] text-sm text-slate-600 line-clamp-2 break-words overflow-hidden">
                                                    {task.description}
                                                </p>
                                                {showReadMore && (
                                                    <span className="mt-1 inline-block text-xs font-semibold text-sky-700">
                                                        Read more..
                                                    </span>
                                                )}
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <TaskPriorityBadge priority={task.priority} />
                                                    <span className="text-xs text-slate-500">
                                                        Assigned to: {formatAssigneeNames(task.assignedTo)}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTaskClick(task.id);
                                                    }}
                                                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    View
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {viewMode === 'kanban' && (
                            <div className="flex gap-4 overflow-x-auto pb-4">
                                {kanbanLoading && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm min-w-[300px]">
                                        Loading kanban...
                                    </div>
                                )}
                                {!kanbanLoading && (kanbanData?.columns ?? []).length === 0 && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm min-w-[300px]">
                                        No tasks available.
                                    </div>
                                )}
                                {(kanbanData?.columns ?? []).map((column) => (
                                    <div key={column.status} className="min-w-[300px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <h2
                                            className="mb-4 font-semibold text-slate-800"
                                            title={CUSTOM_STATUS_NAMES[column.status]?.tooltip ?? 'Status info unavailable'}
                                        >
                                            {column.title || CUSTOM_STATUS_NAMES[column.status]?.name || column.status}
                                        </h2>
                                        <div className="flex flex-col gap-3">
                                            {column.items.map((task) => {
                                                const showReadMore = task.description.trim().length > 100;
                                                const taskToneClass = getTaskCardToneClass(task);
                                                return (
                                                    <div
                                                        key={task.id}
                                                        className={`rounded-xl p-3 transition-all ${cardBaseClass} ${taskToneClass}`}
                                                    >
                                                        <h3 className="min-h-[3rem] font-semibold text-slate-800 line-clamp-2">
                                                            {task.title}
                                                        </h3>
                                                        <p className="min-h-[2.5rem] text-sm text-slate-600 line-clamp-2 break-words overflow-hidden">
                                                            {task.description}
                                                        </p>
                                                        {showReadMore && (
                                                            <span className="mt-1 inline-block text-xs font-semibold text-sky-700">
                                                                Read more..
                                                            </span>
                                                        )}
                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                            <TaskPriorityBadge priority={task.priority} />
                                                            <span className="text-xs text-slate-500">
                                                                Assigned to: {formatAssigneeNames(task.assignedTo)}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleTaskClick(task.id)}
                                                            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Pagination */}
                <div className={`px-5 py-4 border-t ${sectionDividerClass}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600">
                        <div className="flex items-center gap-3">
                            <span className="uppercase tracking-wide text-xs font-medium text-slate-500">Rows</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setPageSizeByView((prev) => ({ ...prev, [viewMode]: v }));
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            >
                                {[10, 20, 50, 100].map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-3 flex-wrap justify-center">
                                <button
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Prev
                                </button>
                                <span>
                                    Page <strong>{currentPage}</strong> of {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>
                        )}

                        <div className="hidden sm:block" />
                    </div>
                </div>
            </div>

            {isCreateModalOpen && (
                <CreateTaskModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                    onTaskCreated={handleTaskCreated}
                />
            )}

            {selectedTaskId && (
                <TaskDetailModal
                    taskId={selectedTaskId}
                    isOpen={Boolean(selectedTaskId)}
                    onClose={handleCloseDetailModal}
                    usersMap={usersMap}
                    onTaskDeleted={() => {
                        setSelectedTaskId(null);
                        refreshTasks();
                    }}
                />
            )}

            {isTemplateModalOpen && (
                <TaskTemplateModal
                    isOpen={isTemplateModalOpen}
                    onClose={() => setTemplateModalOpen(false)}
                    onTemplateAssigned={() => {
                        setTemplateModalOpen(false);
                        refreshTasks();
                    }}
                />
            )}
        </div>
    );
};

export default Tasks;
