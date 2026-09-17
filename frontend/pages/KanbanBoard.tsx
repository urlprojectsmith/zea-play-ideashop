import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { Task, User, KanbanColumn } from '../types';
import KanbanDocumentationModal from '../components/KanbanDocumentationModal';
import { Role, TaskStatus, TaskPriority, CUSTOM_STATUS_NAMES } from '../types';
import { useAuth, useSearch, useTheme } from '../hooks/useAuth';
import api from '../services/mockApi';
import TaskDetailModal from '../components/TaskDetailModal';
import CreateColumnModal from '../components/CreateColumnModal';
import EditColumnModal from '../components/EditColumnModal';
import Tooltip from '../components/ui/Tooltip';
import { formatDate, formatTaskStatus } from '../utils';
import { loadPointsConfig, POINTS_CONFIG_UPDATED_EVENT } from '../utils/pointsConfigStorage';
import { augmentTasksWithPoints, summarizeTaskPoints, formatPointsValue, normalizeDepartmentKey } from '../utils/taskPoints';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  RocketLaunchIcon,
  ClipboardDocumentListIcon,
  PuzzlePieceIcon,
  FireIcon,
  AcademicCapIcon,
  TrophyIcon,
  XMarkIcon,
  NoSymbolIcon,
  QuestionMarkCircleIcon,
  FunnelIcon,
} from '../components/icons';

type DragState = {
  taskId: string | null;
  sourceColumn: string | null;
};

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

type StatusDetail = {
  label: string;
  legend: string;
  gradient: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
};

// 9 stages aligned with task statuses
const statusDetails: { [K in TaskStatus]: StatusDetail } = {
  [TaskStatus.WAITING_FOR_REQUIREMENT]: {
    label: 'New Task',
    legend: 'New / Ready',
    gradient: 'from-slate-500/30 via-slate-600/30 to-slate-800/40',
    icon: RocketLaunchIcon,
  },
  [TaskStatus.TODO]: {
    label: 'Started',
    legend: 'Ready to Start',
    gradient: 'from-indigo-500/25 via-sky-500/25 to-cyan-500/35',
    icon: ClipboardDocumentListIcon,
  },
  [TaskStatus.IN_PROGRESS]: {
    label: 'In Progress',
    legend: 'In Progress',
    gradient: 'from-purple-500/25 via-fuchsia-500/25 to-rose-500/35',
    icon: PuzzlePieceIcon,
  },
  [TaskStatus.BLOCKED]: {
    label: 'Half Done',
    legend: 'Requires Attention',
    gradient: 'from-amber-500/25 via-orange-500/25 to-rose-500/35',
    icon: FireIcon,
  },
  [TaskStatus.IN_REVIEW]: {
    label: 'Almost Done',
    legend: 'Pending Verification',
    gradient: 'from-emerald-500/25 via-teal-500/25 to-sky-400/35',
    icon: AcademicCapIcon,
  },
  [TaskStatus.ON_HOLD]: {
    label: 'On Hold',
    legend: 'Paused / Waiting',
    gradient: 'from-slate-400/25 via-slate-500/25 to-slate-600/35',
    icon: QuestionMarkCircleIcon,
  },
  [TaskStatus.DONE]: {
    label: 'Completed',
    legend: 'Task Finalized',
    gradient: 'from-green-500/25 via-emerald-500/25 to-teal-500/35',
    icon: TrophyIcon,
  },
  [TaskStatus.FAILED]: {
    label: 'Failed',
    legend: 'Clinical Task Suspended',
    gradient: 'from-red-500/25 via-rose-500/25 to-pink-500/35',
    icon: XMarkIcon,
  },
  [TaskStatus.GRAVEYARD]: {
    label: 'Archived',
    legend: 'For inactive / archived tasks',
    gradient: 'from-gray-500/25 via-gray-600/25 to-gray-700/30',
    icon: NoSymbolIcon,
  },
};

const priorityStyles: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/30',
  [TaskPriority.MEDIUM]: 'bg-sky-400/15 text-sky-200 border border-sky-300/30',
  [TaskPriority.HIGH]: 'bg-amber-400/15 text-amber-200 border border-amber-300/30',
  [TaskPriority.URGENT]: 'bg-rose-500/20 text-rose-100 border border-rose-400/40',
};

const overdueExcludedStatuses = new Set<TaskStatus>([
  TaskStatus.DONE,
  TaskStatus.FAILED,
  TaskStatus.GRAVEYARD,
]);

const formatPriority = (value: TaskPriority) =>
  value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const KanbanTaskCard: React.FC<any> = ({ task, assignees, creator, onDragStart, onClick, onEdit, theme, user }) => {
  const isDark = theme === 'dark';
  const cardSurface = isDark
    ? 'border-white/10 bg-white/5 shadow-[0_18px_40px_rgba(15,23,42,0.45)]'
    : 'border-slate-200 bg-white shadow-sm';

  const assigneeNames = assignees.length > 0 ? assignees.map((a: any) => a.name).join(', ') : 'Unassigned';
  const pointsSummary = task.pointsBreakdown ? summarizeTaskPoints(task.pointsBreakdown) : null;
  const showReadMore = (task.description ?? '').trim().length > 100;
  const createdByName = creator?.name ?? 'Unknown';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onClick(task.id)}
      className={`rounded-2xl border p-4 transition hover:-translate-y-2 hover:shadow-xl ${cardSurface}`}
    >
      <div className="flex justify-between items-start">
        <p className="min-h-[4.5rem] font-semibold text-sm line-clamp-3">{task.title}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityStyles[task.priority]}`}>
          {formatPriority(task.priority)}
        </span>
      </div>
      <p className="min-h-[2.5rem] text-xs mt-2 leading-5 opacity-70 line-clamp-2 break-words overflow-hidden">{task.description}</p>
      {showReadMore && (
        <span className="mt-1 inline-block text-xs font-semibold text-primary/80">Read more..</span>
      )}
      <div className="mt-3 grid gap-1 text-xs opacity-75">
        <div>Created by: {createdByName}</div>
        <div>Created at: {formatDate(task.createdAt, true)}</div>
        <div>Assigned to: {assigneeNames}</div>
        <div>Due date: {formatDate(task.dueAt)}</div>
      </div>

      {pointsSummary && (
        <div className="mt-2 text-[11px] opacity-80">
          {pointsSummary.label}: {formatPointsValue(pointsSummary.value)}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onClick(task.id)}
          className="flex-1 rounded-full border border-blue-400 bg-blue-500/10 px-3 py-1 text-sm text-blue-400 hover:bg-blue-500/20"
        >
          View
        </button>
        {(user?.role === Role.MANAGER || user?.role === Role.ADMIN || user?.role === Role.OWNER) && (
          <button
            onClick={() => onEdit(task.id)}
            className="flex-1 rounded-full border border-amber-400 bg-amber-500/10 px-3 py-1 text-sm text-amber-400 hover:bg-amber-500/20"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
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
      if (!wrapperRef.current || wrapperRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative w-full md:min-w-[190px]">
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

const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, User>>(new Map());
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { searchQuery, setSearchQuery, debouncedSearchQuery } = useSearch();
  const { theme } = useTheme();
  const resolvedTheme = useResolvedTheme(theme as ThemeMode);
  const isColorful = resolvedTheme === 'colorful';
  const isLight = resolvedTheme === 'light';
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardDragState = useRef<{ isDragging: boolean; startX: number; scrollLeft: number }>({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });

  // Filtering and sorting state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [dueDateFilter, setDueDateFilter] = useState<string>('');
  const [creationDateFilter, setCreationDateFilter] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<string>('');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(20);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [fetchedTasks, allUsers, deptData] = await Promise.all([
        api.getTasks(user.id, user.role),
        api.getUsers(),
        api.getDepartments(),
      ]);
      const relevantTasks =
        user.role === Role.USER ? fetchedTasks.filter((t) => t.assignedTo?.includes(user.id)) : fetchedTasks;
      setTasks(augmentTasksWithPoints(relevantTasks));

      const fixedColumns = Object.values(TaskStatus).map((status) => ({
        id: status,
        title: statusDetails[status]?.label || formatTaskStatus(status),
        order: 0,
        pipelineId: 'default',
      }));
      setColumns(fixedColumns);

      const map = new Map<string, User>();
      allUsers.forEach((entry: User) => map.set(entry.id, entry));
      setUsersMap(map);
      const departmentNames = Array.from(
        new Set(
          (deptData ?? [])
            .map((dept) => dept.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b));
      setDepartmentOptions(departmentNames);
    } catch (err) {
      console.error('Failed to fetch Kanban data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, newStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus || !user) return;

    try {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      await api.updateTask(taskId, { status: newStatus }, user.id);
    } catch (err) {
      console.error('Failed to update task:', err);
      fetchData();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const handleTaskClick = (id: string) => setSelectedTaskId(id);
  const handleTaskEdit = (id: string) => setSelectedTaskId(id);

  const scrollBoard = (direction: 'left' | 'right') => {
    if (!boardRef.current) return;
    const distance = direction === 'left' ? -320 : 320;
    boardRef.current.scrollBy({ left: distance, behavior: 'smooth' });
  };

  const stopBoardDrag = () => {
    boardDragState.current.isDragging = false;
    if (boardRef.current) {
      boardRef.current.classList.remove('cursor-grabbing', 'select-none');
    }
  };

  const handleBoardMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!boardRef.current) return;
    boardDragState.current.isDragging = true;
    boardDragState.current.startX = event.pageX - boardRef.current.offsetLeft;
    boardDragState.current.scrollLeft = boardRef.current.scrollLeft;
    boardRef.current.classList.add('cursor-grabbing', 'select-none');
  };

  const handleBoardMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!boardDragState.current.isDragging || !boardRef.current) return;
    event.preventDefault();
    const x = event.pageX - boardRef.current.offsetLeft;
    const walk = x - boardDragState.current.startX;
    boardRef.current.scrollLeft = boardDragState.current.scrollLeft - walk;
  };

  const handleBoardMouseUp = () => {
    if (!boardDragState.current.isDragging) return;
    stopBoardDrag();
  };

  const handleBoardMouseLeave = () => {
    if (!boardDragState.current.isDragging) return;
    stopBoardDrag();
  };

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (!boardDragState.current.isDragging) return;
      boardDragState.current.isDragging = false;
      if (boardRef.current) {
        boardRef.current.classList.remove('cursor-grabbing', 'select-none');
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);
  const handleCloseModal = () => {
    setSelectedTaskId(null);
    fetchData();
  };

  const filteredTasks = useMemo(() => {
    let filtered: Task[] = tasks;

    // Apply search
    if (typeof debouncedSearchQuery === 'string' && debouncedSearchQuery.length > 0) {
      const lowercasedQuery = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter((task) => {
        const assigneeNames = (task.assignedTo ?? [])
          .map((id) => usersMap.get(id)?.name?.toLowerCase() || '')
          .filter((name) => name !== '');
        const matchesAssignee = assigneeNames.some(name => name.includes(lowercasedQuery));
        return (
          task.title.toLowerCase().includes(lowercasedQuery) ||
          task.description.toLowerCase().includes(lowercasedQuery) ||
          task.team.toLowerCase().includes(lowercasedQuery) ||
          matchesAssignee ||
          (task.tags && task.tags.some(tag => tag.toLowerCase().includes(lowercasedQuery)))
        );
      });
    }

    // Apply filters
    if (statusFilter) {
      filtered = filtered.filter((task) => task.status === statusFilter as TaskStatus);
    }
    if (priorityFilter) {
      filtered = filtered.filter((task) => task.priority === priorityFilter as TaskPriority);
    }
    if (assigneeFilter) {
      filtered = filtered.filter((task) => task.assignedTo?.includes(assigneeFilter));
    }
    if (teamFilter) {
      const normalizedFilter = normalizeDepartmentKey(teamFilter);
      filtered = filtered.filter((task) => normalizeDepartmentKey(task.team) === normalizedFilter);
    }
    if (tagFilter) {
      const tagFilterLower = tagFilter.toLowerCase();
      filtered = filtered.filter((task) => task.tags && task.tags.some(tag => tag.toLowerCase().includes(tagFilterLower)));
    }
    if (dueDateFilter) {
      // Assuming dueDateFilter is a date string, filter tasks due on that date
      filtered = filtered.filter((task) => task.dueAt && new Date(task.dueAt).toDateString() === new Date(dueDateFilter).toDateString());
    }
    if (creationDateFilter) {
      // Assuming creationDateFilter is a date string
      filtered = filtered.filter((task) => task.createdAt && new Date(task.createdAt).toDateString() === new Date(creationDateFilter).toDateString());
    }

    // Apply quick filters
    if (quickFilter === 'createdByMe') {
      filtered = filtered.filter((task) => (user?.id ? task.createdBy === user.id : false));
    } else if (quickFilter === 'myTasks') {
      filtered = filtered.filter((task) => (user?.id ? task.assignedTo?.includes(user.id) : false));
    } else if (quickFilter === 'overdue') {
      filtered = filtered.filter(
        (task) =>
          task.dueAt &&
          new Date(task.dueAt).getTime() < Date.now() &&
          !overdueExcludedStatuses.has(task.status),
      );
    } else if (quickFilter === 'completed') {
      filtered = filtered.filter((task) => task.status === TaskStatus.DONE);
    }

    return filtered;
  }, [tasks, debouncedSearchQuery, usersMap, statusFilter, priorityFilter, assigneeFilter, teamFilter, tagFilter, dueDateFilter, creationDateFilter, quickFilter, user?.id]);

  const maxTasksInColumn = useMemo(() => {
    if (!columns.length) return 0;
    return columns.reduce((max, column) => {
      const count = filteredTasks.filter(
        (t) => statusDetails[t.status]?.label === column.title
      ).length;
      return Math.max(max, count);
    }, 0);
  }, [columns, filteredTasks]);

  const totalPages = Math.max(1, Math.ceil(maxTasksInColumn / pageSize));
  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex + 1 < totalPages;

  useEffect(() => {
    if (pageIndex >= totalPages) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  const createdByFilterActive = quickFilter === 'createdByMe';
  const createdByFilterBase =
    'group relative inline-flex items-center justify-center overflow-hidden rounded-full border-2 px-10 py-5 text-lg font-semibold uppercase tracking-[0.22em] transition duration-300 min-w-[280px] focus-visible:outline-none focus-visible:ring-2';
  const createdByFilterTheme = isLight
    ? {
      surface: 'bg-white/90',
      active: 'border-sky-500/90 text-slate-900 shadow-[0_0_24px_rgba(56,189,248,0.5)]',
      inactive: 'border-slate-300/80 text-slate-700 hover:border-sky-400/80 hover:text-slate-900 hover:shadow-[0_0_18px_rgba(56,189,248,0.35)]',
      ring: 'focus-visible:ring-sky-300/60',
      glow: 'bg-[radial-gradient(circle,rgba(56,189,248,0.25),transparent_70%)]',
      saber: 'bg-[linear-gradient(120deg,rgba(56,189,248,0.9),rgba(255,255,255,0.7),rgba(56,189,248,0.9))]',
      saberGlow: 'bg-[radial-gradient(circle,rgba(56,189,248,0.45),transparent_70%)]',
      ping: 'bg-sky-400/70',
      dotActive: 'bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.8)]',
      dotInactive: 'bg-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.6)]',
      sheen: 'bg-[linear-gradient(120deg,rgba(255,255,255,0.6),rgba(125,211,252,0.35),rgba(186,230,253,0.55))]',
      halo: 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_60%)]',
    }
    : isColorful
      ? {
        surface: 'bg-gradient-to-r from-fuchsia-950/80 via-indigo-950/70 to-sky-950/80',
        active: 'border-fuchsia-300/90 text-white shadow-[0_0_30px_rgba(217,70,239,0.55)]',
        inactive: 'border-sky-400/70 text-white/90 hover:border-fuchsia-300/80 hover:text-white hover:shadow-[0_0_24px_rgba(56,189,248,0.45)]',
        ring: 'focus-visible:ring-fuchsia-300/60',
        glow: 'bg-[radial-gradient(circle,rgba(217,70,239,0.3),transparent_70%)]',
        saber: 'bg-[linear-gradient(120deg,rgba(217,70,239,0.9),rgba(56,189,248,0.7),rgba(217,70,239,0.9))]',
        saberGlow: 'bg-[radial-gradient(circle,rgba(217,70,239,0.5),transparent_70%)]',
        ping: 'bg-fuchsia-300/70',
        dotActive: 'bg-fuchsia-300 shadow-[0_0_14px_rgba(217,70,239,0.9)]',
        dotInactive: 'bg-sky-300/80 shadow-[0_0_12px_rgba(56,189,248,0.7)]',
        sheen: 'bg-[linear-gradient(120deg,rgba(216,180,254,0.45),rgba(56,189,248,0.45),rgba(167,139,250,0.45))]',
        halo: 'bg-[radial-gradient(circle_at_top,rgba(224,231,255,0.45),transparent_60%)]',
      }
      : {
        surface: 'bg-slate-950/80',
        active: 'border-cyan-300/90 text-cyan-100 shadow-[0_0_35px_rgba(34,211,238,0.7)]',
        inactive: 'border-cyan-500/60 text-white/90 hover:border-cyan-300/80 hover:text-white hover:shadow-[0_0_30px_rgba(34,211,238,0.55)]',
        ring: 'focus-visible:ring-cyan-400/70',
        glow: 'bg-[radial-gradient(circle,rgba(34,211,238,0.3),transparent_70%)]',
        saber: 'bg-[linear-gradient(120deg,rgba(34,211,238,0.9),rgba(56,189,248,0.6),rgba(34,211,238,0.9))]',
        saberGlow: 'bg-[radial-gradient(circle,rgba(34,211,238,0.5),transparent_70%)]',
        ping: 'bg-cyan-300/60',
        dotActive: 'bg-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.9)]',
        dotInactive: 'bg-cyan-200/80 shadow-[0_0_10px_rgba(34,211,238,0.7)]',
        sheen: 'bg-[linear-gradient(120deg,rgba(6,182,212,0.25),rgba(59,130,246,0.4),rgba(14,116,144,0.25))]',
        halo: 'bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.35),transparent_60%)]',
      };
  const createdByFilterClass = [
    createdByFilterBase,
    createdByFilterTheme.surface,
    createdByFilterActive ? 'saber-pulse scale-[1.01]' : 'hover:scale-[1.01]',
    createdByFilterActive ? createdByFilterTheme.active : createdByFilterTheme.inactive,
    createdByFilterTheme.ring,
  ].join(' ');
  const quickFilterButtonBase = [
    'group relative isolate inline-flex w-full sm:w-auto items-center justify-center overflow-hidden rounded-md border px-4 py-2 h-10 text-[11px] font-semibold uppercase tracking-[0.1em] md:tracking-[0.18em]',
    'transition duration-200 ease-out active:translate-y-[1px]',
    'focus-visible:outline-none focus-visible:ring-0',
  ].join(' ');
  const quickFilterButtonTheme = {
    active:
      'border-indigo-500 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 focus-visible:border-indigo-500',
    inactive:
      'border-gray-200 text-gray-700 bg-white hover:bg-gray-50 focus-visible:border-indigo-500',
    overlay: 'bg-transparent',
    edgeTop: 'bg-transparent',
    edgeBottom: 'bg-transparent',
  };
  const getQuickFilterButtonClass = (isActive: boolean) =>
    [quickFilterButtonBase, isActive ? quickFilterButtonTheme.active : quickFilterButtonTheme.inactive].join(' ');
  const questFilterPanelClass = isLight
    ? 'border-sky-200/70 bg-gradient-to-r from-white via-sky-50 to-slate-100 shadow-[0_22px_48px_rgba(15,23,42,0.12)]'
    : isColorful
      ? 'border-fuchsia-300/30 bg-gradient-to-r from-indigo-950/85 via-fuchsia-950/75 to-slate-950/90 shadow-[0_24px_54px_rgba(91,33,182,0.45)]'
      : 'border-cyan-400/30 bg-gradient-to-r from-slate-950/90 via-cyan-950/40 to-slate-950/90 shadow-[0_25px_60px_rgba(8,145,178,0.22)]';
  const questFilterMetaClass = isLight
    ? 'text-slate-600'
    : isColorful
      ? 'text-fuchsia-200/80'
      : 'text-cyan-200/80';
  const questFilterTitleClass = isLight ? 'text-slate-900' : 'text-white';
  const questFilterBodyClass = isLight ? 'text-slate-600' : 'text-white/70';
  const battleBoardTitleClass = 'text-gray-800';
  const filterControlBase = [
    'kanban-filter-control rounded-md border border-gray-200 bg-white px-4 py-2 h-10 text-sm text-gray-700 transition shadow-none',
    'focus:outline-none focus:ring-0 focus:border-indigo-500',
  ].join(' ');
  const filterControlTheme = '';
  const filterSelectClass = [
    filterControlBase,
    filterControlTheme,
    'kanban-filter-select w-full font-semibold uppercase tracking-[0.22em]',
  ].join(' ');
  const filterPlaceholderClass = 'placeholder:text-gray-400';
  const filterInputClass = [
    filterControlBase,
    filterControlTheme,
    'kanban-filter-input',
    'font-semibold uppercase tracking-[0.22em]',
    filterPlaceholderClass,
  ].join(' ');
  const dropdownMenuClass =
    'border-gray-200 bg-white text-gray-700 shadow-sm';
  const dropdownItemClass = [
    'w-full px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] transition',
    'text-gray-700 hover:bg-gray-50',
  ].join(' ');
  const dropdownItemActiveClass = 'bg-indigo-50 text-indigo-800';
  const dropdownButtonClass = filterSelectClass;
  const filterColorScheme = 'light';
  const statusOptions = useMemo(
    () => [
      { value: '', label: 'All Statuses' },
      ...Object.values(TaskStatus).map((status) => ({
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
    const list = (Array.from(usersMap.values()) as User[])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({ value: entry.id, label: entry.name }));
    return [{ value: '', label: 'All Assignees' }, ...list];
  }, [usersMap]);
  const teamOptions = useMemo(
    () => [{ value: '', label: 'All Teams' }, ...departmentOptions.map((department) => ({ value: department, label: department }))],
    [departmentOptions],
  );

  if (loading) return <div className="text-center p-8 text-text-secondary">Loading Kanban Board...</div>;

  return (
    <div className="flex flex-col space-y-6 px-4 sm:px-5 lg:px-6">
      <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 ${battleBoardTitleClass} mb-6`}>Kanban Board</h1>

      {/* Quest Filter Section Hidden as requested */}
      {/* 
      <div className={`rounded-3xl border p-5 ${questFilterPanelClass}`}>
        <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="space-y-1">
            <p className={`text-[10px] uppercase tracking-[0.5em] ${questFilterMetaClass}`}>Quest Filter</p>
            <h2 className={`text-xl font-semibold ${questFilterTitleClass}`}>Task Created By Me</h2>
            <p className={`text-sm ${questFilterBodyClass}`}>Show only the tasks you created across the board.</p>
          </div>
          <button
            type="button"
            onClick={() => setQuickFilter(createdByFilterActive ? '' : 'createdByMe')}
            className={createdByFilterClass}
            aria-pressed={createdByFilterActive}
            title="Show tasks you created"
          >
            {createdByFilterActive && (
              <>
                <span
                  className={`pointer-events-none absolute -inset-[3px] rounded-full ${createdByFilterTheme.saber} saber-shift opacity-90`}
                />
                <span
                  className={`pointer-events-none absolute -inset-4 rounded-full ${createdByFilterTheme.saberGlow} blur-2xl opacity-80`}
                />
              </>
            )}
            <span className={`pointer-events-none absolute inset-0 rounded-full ${createdByFilterTheme.sheen} saber-shift opacity-90`} />
            <span className={`pointer-events-none absolute inset-0 rounded-full ${createdByFilterTheme.halo} opacity-90`} />
            <span className={`pointer-events-none absolute -inset-4 rounded-full ${createdByFilterTheme.glow} blur-2xl opacity-80 transition duration-300 group-hover:opacity-100`} />
            <span className="relative z-10 flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${createdByFilterTheme.ping}`} />
                <span
                  className={
                    createdByFilterActive
                      ? `relative inline-flex h-3 w-3 rounded-full ${createdByFilterTheme.dotActive}`
                      : `relative inline-flex h-3 w-3 rounded-full ${createdByFilterTheme.dotInactive}`
                  }
                />
              </span>
              <span>Task Created By Me</span>
            </span>
          </button>
        </div>
      </div>
      */}

      {/* Filters and Quick Filters */}
      <div className="flex flex-col space-y-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setQuickFilter(quickFilter === 'myTasks' ? '' : 'myTasks')}
              className={getQuickFilterButtonClass(quickFilter === 'myTasks')}
            >
              <span className={`pointer-events-none absolute inset-0 rounded-[10px] ${quickFilterButtonTheme.overlay} opacity-80`} />
              <span className={`pointer-events-none absolute inset-x-2 top-1 h-px ${quickFilterButtonTheme.edgeTop}`} />
              <span className={`pointer-events-none absolute inset-x-2 bottom-1 h-px ${quickFilterButtonTheme.edgeBottom}`} />
              <span className="relative z-10 whitespace-nowrap">My Tasks</span>
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'overdue' ? '' : 'overdue')}
              className={getQuickFilterButtonClass(quickFilter === 'overdue')}
            >
              <span className={`pointer-events-none absolute inset-0 rounded-[10px] ${quickFilterButtonTheme.overlay} opacity-80`} />
              <span className={`pointer-events-none absolute inset-x-2 top-1 h-px ${quickFilterButtonTheme.edgeTop}`} />
              <span className={`pointer-events-none absolute inset-x-2 bottom-1 h-px ${quickFilterButtonTheme.edgeBottom}`} />
              <span className="relative z-10 whitespace-nowrap">Overdue</span>
            </button>
            <button
              onClick={() => setQuickFilter(quickFilter === 'completed' ? '' : 'completed')}
              className={getQuickFilterButtonClass(quickFilter === 'completed')}
            >
              <span className={`pointer-events-none absolute inset-0 rounded-[10px] ${quickFilterButtonTheme.overlay} opacity-80`} />
              <span className={`pointer-events-none absolute inset-x-2 top-1 h-px ${quickFilterButtonTheme.edgeTop}`} />
              <span className={`pointer-events-none absolute inset-x-2 bottom-1 h-px ${quickFilterButtonTheme.edgeBottom}`} />
              <span className="relative z-10 whitespace-nowrap">Completed</span>
            </button>
          </div>

          <div className="md:hidden flex-shrink-0 self-start">
            <button
              onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              <FunnelIcon className="h-3 w-3" />
              {isMobileFiltersOpen ? 'Hide' : 'Filters'}
            </button>
          </div>
        </div>

        <div
          className={`${isMobileFiltersOpen ? 'grid' : 'hidden'} md:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-4 items-stretch`}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className={`${filterInputClass} w-full`}
            placeholder="Search tasks"
          />
          <FilterDropdown
            value={statusFilter}
            placeholder="All Statuses"
            options={statusOptions}
            onChange={setStatusFilter}
            buttonClassName={dropdownButtonClass}
            menuClassName={dropdownMenuClass}
            itemClassName={dropdownItemClass}
            activeItemClassName={dropdownItemActiveClass}
          />
          <FilterDropdown
            value={priorityFilter}
            placeholder="All Priorities"
            options={priorityOptions}
            onChange={setPriorityFilter}
            buttonClassName={dropdownButtonClass}
            menuClassName={dropdownMenuClass}
            itemClassName={dropdownItemClass}
            activeItemClassName={dropdownItemActiveClass}
          />
          <FilterDropdown
            value={assigneeFilter}
            placeholder="All Assignees"
            options={assigneeOptions}
            onChange={setAssigneeFilter}
            buttonClassName={dropdownButtonClass}
            menuClassName={dropdownMenuClass}
            itemClassName={dropdownItemClass}
            activeItemClassName={dropdownItemActiveClass}
          />
          <FilterDropdown
            value={teamFilter}
            placeholder="All Teams"
            options={teamOptions}
            onChange={setTeamFilter}
            buttonClassName={dropdownButtonClass}
            menuClassName={dropdownMenuClass}
            itemClassName={dropdownItemClass}
            activeItemClassName={dropdownItemActiveClass}
          />
          <input
            type="text"
            value={tagFilter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagFilter(e.target.value)}
            className={`${filterInputClass} w-full`}
            placeholder="Filter by Tag"
          />
          <input
            type="date"
            value={dueDateFilter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDueDateFilter(e.target.value)}
            className={`${filterInputClass} w-full`}
            placeholder="Due Date"
            style={{ colorScheme: filterColorScheme }}
          />
          <input
            type="date"
            value={creationDateFilter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreationDateFilter(e.target.value)}
            className={`${filterInputClass} w-full`}
            placeholder="Creation Date"
            style={{ colorScheme: filterColorScheme }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => scrollBoard('left')}
          className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          aria-label="Scroll board left"
        >
          &lt;
        </button>
        <button
          type="button"
          onClick={() => scrollBoard('right')}
          className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          aria-label="Scroll board right"
        >
          &gt;
        </button>
      </div>

      <div
        ref={boardRef}
        className="flex gap-6 overflow-x-auto overflow-y-visible pb-6 cursor-grab active:cursor-grabbing"
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseLeave={handleBoardMouseLeave}
        onMouseUp={handleBoardMouseUp}
      >
        {columns.map((column) => {
          const tasksInColumn = filteredTasks.filter(
            (t) => statusDetails[t.status]?.label === column.title
          );
          const startIndex = pageIndex * pageSize;
          const visibleTasks = tasksInColumn.slice(startIndex, startIndex + pageSize);
          const detail = Object.values(statusDetails).find((s) => s.label === column.title);
          if (!detail) return null;
          const Icon = detail.icon;

          return (
            <div
              key={column.id}
              className="w-72 flex-shrink-0 rounded-3xl border border-white/15 p-5 backdrop-blur relative"
              onDrop={(e) => handleDrop(e, column.id as TaskStatus)}
              onDragOver={handleDragOver}
            >
              <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${detail.gradient} opacity-90`} />
              <div className="relative flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="flex items-center gap-2 font-semibold text-black">
                    <Icon className="h-5 w-5" />
                    <Tooltip text={String(column.id)} triggerClassName="inline-flex items-center">
                      <span>{detail.label}</span>
                    </Tooltip>
                  </h3>
                  <span className="text-xs text-black/70">{tasksInColumn.length}</span>
                </div>

                <div className="space-y-4">
                  {visibleTasks.map((task) => {
                    const assignees = (task.assignedTo || []).map((id) => usersMap.get(id)).filter(Boolean) as User[];
                    const creator = usersMap.get(task.createdBy);
                    return (
                      <KanbanTaskCard
                        key={task.id}
                        task={task}
                        assignees={assignees}
                        creator={creator}
                        onDragStart={handleDragStart}
                        onClick={handleTaskClick}
                        onEdit={handleTaskEdit}
                        theme={resolvedTheme}
                        user={user || null}
                      />
                    );
                  })}
                  {tasksInColumn.length === 0 && (
                    <div className="text-xs text-white/60 text-center py-6 border border-dashed border-white/20 rounded-2xl">
                      Drop quests here
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="w-72 flex-shrink-0">
          <button
            onClick={() => { }}
            className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border-color/70 bg-surface/40 p-8 text-sm font-semibold text-text-secondary transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <div className="grid h-12 w-12 place-items-center rounded-xl border-2 border-dashed border-current bg-white/5 group-hover:scale-110">
              <PlusIcon className="h-6 w-6" />
            </div>
            <span>Add Stage</span>
          </button>
        </div>
      </div>

      <div className="hidden md:block rounded-3xl border border-white/10 bg-black/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={!canGoPrev}
              className={`rounded border px-4 py-2 text-sm font-semibold transition ${canGoPrev
                ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                : 'border-white/10 bg-white/5 text-white/50 cursor-not-allowed'
                }`}
            >
              Prev page
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={!canGoNext}
              className={`rounded border px-4 py-2 text-sm font-semibold transition ${canGoNext
                ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                : 'border-white/10 bg-white/5 text-white/50 cursor-not-allowed'
                }`}
            >
              Next page
            </button>
            <span className="text-xs text-white/70">Page {pageIndex + 1} of {totalPages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPageSize(20);
                setPageIndex(0);
              }}
              className={`rounded border px-3 py-2 text-sm font-semibold transition ${pageSize === 20
                ? 'border-cyan-300/70 bg-cyan-500/10 text-cyan-100'
                : 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                }`}
            >
              20 per page
            </button>
            <button
              type="button"
              onClick={() => {
                setPageSize(100);
                setPageIndex(0);
              }}
              className={`rounded border px-3 py-2 text-sm font-semibold transition ${pageSize === 100
                ? 'border-cyan-300/70 bg-cyan-500/10 text-cyan-100'
                : 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                }`}
            >
              100 per page
            </button>
          </div>
        </div>
      </div>

      {selectedTaskId &&
        typeof window !== 'undefined' &&
        ReactDOM.createPortal(
          <TaskDetailModal
            taskId={selectedTaskId}
            isOpen={!!selectedTaskId}
            onClose={handleCloseModal}
            usersMap={usersMap}
            onTaskDeleted={() => setSelectedTaskId(null)}
          />,
          document.body
        )}
    </div>
  );
};

export default KanbanBoard;
