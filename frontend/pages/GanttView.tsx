import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, User, TaskStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import api from '../services/mockApi';
import { formatDate, formatTaskStatus } from '../utils';

type RangeFilter = '30' | '60' | '90' | 'ALL';
type StatusFilter = TaskStatus | 'ALL';

type StatusTheme = {
  title: string;
  gradient: string;
  glow: string;
  accent: string;
  ring: string;
};

const UNASSIGNED_FILTER_VALUE = '__UNASSIGNED__';

const statusThemes: Record<TaskStatus, StatusTheme> = {
  [TaskStatus.WAITING_FOR_REQUIREMENT]: {
    title: 'New Task',
    gradient: 'bg-gradient-to-r from-slate-100 to-indigo-100',
    glow: 'shadow-sm',
    accent: 'bg-indigo-500',
    ring: 'ring-1 ring-indigo-200',
  },
  [TaskStatus.TODO]: {
    title: 'Started',
    gradient: 'bg-gradient-to-r from-sky-100 to-cyan-100',
    glow: 'shadow-sm',
    accent: 'bg-sky-500',
    ring: 'ring-1 ring-sky-200',
  },
  [TaskStatus.IN_PROGRESS]: {
    title: 'In Progress',
    gradient: 'bg-gradient-to-r from-violet-100 to-fuchsia-100',
    glow: 'shadow-sm',
    accent: 'bg-violet-500',
    ring: 'ring-1 ring-violet-200',
  },
  [TaskStatus.IN_REVIEW]: {
    title: 'Half Done',
    gradient: 'bg-gradient-to-r from-emerald-100 to-teal-100',
    glow: 'shadow-sm',
    accent: 'bg-emerald-500',
    ring: 'ring-1 ring-emerald-200',
  },
  [TaskStatus.BLOCKED]: {
    title: 'Almost Done',
    gradient: 'bg-gradient-to-r from-rose-100 to-orange-100',
    glow: 'shadow-sm',
    accent: 'bg-rose-500',
    ring: 'ring-1 ring-rose-200',
  },
  [TaskStatus.ON_HOLD]: {
    title: 'On Hold',
    gradient: 'bg-gradient-to-r from-slate-100 to-gray-100',
    glow: 'shadow-sm',
    accent: 'bg-slate-500',
    ring: 'ring-1 ring-slate-200',
  },
  [TaskStatus.DONE]: {
    title: 'Completed Task',
    gradient: 'bg-gradient-to-r from-lime-100 to-emerald-100',
    glow: 'shadow-sm',
    accent: 'bg-lime-500',
    ring: 'ring-1 ring-lime-200',
  },
  [TaskStatus.FAILED]: {
    title: 'Failed',
    gradient: 'bg-gradient-to-r from-cyan-100 to-teal-100',
    glow: 'shadow-sm',
    accent: 'bg-cyan-500',
    ring: 'ring-1 ring-cyan-200',
  },
  [TaskStatus.GRAVEYARD]: {
    title: 'Archived',
    gradient: 'bg-gradient-to-r from-gray-100 to-slate-100',
    glow: 'shadow-sm',
    accent: 'bg-gray-500',
    ring: 'ring-1 ring-gray-200',
  },
};

const defaultTheme: StatusTheme = {
  title: 'Clinical Activity',
  gradient: 'bg-gradient-to-r from-slate-100 to-slate-200',
  glow: 'shadow-sm',
  accent: 'bg-slate-500',
  ring: 'ring-1 ring-slate-200',
};

const completedStatuses = new Set<TaskStatus>([TaskStatus.DONE]);
const activeStatuses = new Set<TaskStatus>([
  TaskStatus.WAITING_FOR_REQUIREMENT,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
]);

const formatShortDate = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const Initials: React.FC<{ name: string }> = ({ name }) => {
  const parts = name.split(' ').filter(Boolean);
  const initials = parts.length === 1 ? parts[0][0] : `${parts[0][0]}${parts[1][0]}`;
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-slate-200">
      {initials}
    </span>
  );
};

const Chip: React.FC<React.PropsWithChildren<{ active?: boolean; onClick?: () => void }>> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'rounded-full border px-3 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em] transition whitespace-nowrap',
      active
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
    ].join(' ')}
  >
    {children}
  </button>
);

const StatCard: React.FC<{ label: string; value: string; hint?: string; classes: string }>
  = ({ label, value, hint, classes }) => (
    <div className={`h-full rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm ${classes}`}>
      <div className="flex h-full flex-col justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        {hint && <p className="mt-3 text-xs text-slate-600">{hint}</p>}
      </div>
    </div>
  );

const PaginationBar: React.FC<{
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}> = ({ currentPage, totalPages, pageSize, onPrev, onNext }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700">
    <span className="uppercase tracking-[0.2em] text-slate-500">{pageSize} per page</span>
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentPage === 1}
        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 uppercase tracking-[0.16em] transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-40"
      >
        Prev
      </button>
      <span className="uppercase tracking-[0.2em] text-slate-500">
        Page {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={currentPage === totalPages}
        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 uppercase tracking-[0.16em] transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-40"
      >
        Next
      </button>
    </div>
    <span className="uppercase tracking-[0.2em] text-slate-500">Total {totalPages}</span>
  </div>
);

const GanttRaidMapPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, User>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<'ALL' | string>('ALL');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('60');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [fetchedTasks, allUsers] = await Promise.all([
        api.getTasks(user.id, user.role),
        api.getUsers(),
      ]);

      const sortedTasks = [...fetchedTasks].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setTasks(sortedTasks);

      const map = new Map<string, User>();
      allUsers.forEach((entry) => map.set(entry.id, entry));
      setUsersMap(map);
    } catch (error) {
      console.error('Failed to fetch Gantt data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') handleResetFilters();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { options: assigneeOptions, hasUnassignedTasks } = useMemo(() => {
    const uniqueAssignees = new Set<string>();
    let hasUnassigned = false;

    tasks.forEach((task) => {
      if (task.assignedTo && task.assignedTo.length > 0) {
        task.assignedTo.forEach((id) => uniqueAssignees.add(id));
      } else {
        hasUnassigned = true;
      }
    });

    const options = Array.from(uniqueAssignees)
      .map((id) => ({ id, name: usersMap.get(id)?.name || 'Unknown staff' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { options, hasUnassignedTasks: hasUnassigned };
  }, [tasks, usersMap]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const rangeStart = new Date();
    if (rangeFilter !== 'ALL') rangeStart.setDate(now.getDate() - Number(rangeFilter));

    return tasks
      .filter((task) => {
        if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
        if (assigneeFilter !== 'ALL') {
          if (assigneeFilter === UNASSIGNED_FILTER_VALUE) {
            if (task.assignedTo && task.assignedTo.length > 0) return false;
          } else if (!task.assignedTo || !task.assignedTo.includes(assigneeFilter)) return false;
        }
        if (rangeFilter !== 'ALL') {
          const comparisonDate = task.dueAt ? new Date(task.dueAt) : new Date(task.createdAt);
          if (comparisonDate < rangeStart) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [tasks, statusFilter, assigneeFilter, rangeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const displayedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  const projectStartDate = useMemo(() => {
    if (displayedTasks.length === 0) return new Date();
    const startDates = displayedTasks.map((t) => new Date(t.createdAt).getTime());
    return new Date(Math.min(...startDates));
  }, [displayedTasks]);

  const projectEndDate = useMemo(() => {
    if (displayedTasks.length === 0) return new Date();
    const endDates = displayedTasks.map((t) => (t.dueAt ? new Date(t.dueAt).getTime() : new Date(t.createdAt).getTime()));
    return new Date(Math.max(...endDates));
  }, [displayedTasks]);

  const totalDays = useMemo(() => {
    const diffTime = projectEndDate.getTime() - projectStartDate.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 ? days : 1;
  }, [projectStartDate, projectEndDate]);

  const getDayOffset = useCallback((date: Date) => {
    const diffTime = date.getTime() - projectStartDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }, [projectStartDate]);

  const timelineBackgroundStyle = useMemo(() => {
    const step = Math.max(1, 100 / totalDays);
    return {
      backgroundImage: [
        `repeating-linear-gradient(to right, rgba(148,163,184,0.16) 0, rgba(148,163,184,0.16) ${step}%, transparent ${step}%, transparent ${step * 2}%)`,
        'linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: 'auto, 100% 22px',
    } as React.CSSProperties;
  }, [totalDays]);

  const timelineMarkers = useMemo(() => {
    const markers: { position: number; label: string }[] = [];
    const segments = Math.min(6, totalDays);
    const interval = Math.max(1, Math.floor(totalDays / segments));

    for (let day = 0; day <= totalDays; day += interval) {
      const markerDate = new Date(projectStartDate);
      markerDate.setDate(projectStartDate.getDate() + day);
      markers.push({ position: Math.min(100, (day / totalDays) * 100), label: formatShortDate(markerDate) });
    }

    return markers;
  }, [projectStartDate, totalDays]);

  const formatAssigneeNames = useCallback((assigneeIds: string[] | null) => {
    if (!assigneeIds || assigneeIds.length === 0) return 'Unassigned staff';
    const names = assigneeIds.map((id) => usersMap.get(id)?.name).filter((n): n is string => Boolean(n));
    return names.length ? names.join(', ') : 'Unknown staff';
  }, [usersMap]);

  const todayPosition = useMemo(() => {
    const offset = getDayOffset(new Date());
    if (offset < 0 || offset > totalDays) return null;
    return (offset / totalDays) * 100;
  }, [getDayOffset, totalDays]);

  const totalQuests = displayedTasks.length;
  const completedQuests = displayedTasks.filter((t) => completedStatuses.has(t.status)).length;
  const activeQuests = displayedTasks.filter((t) => activeStatuses.has(t.status)).length;
  const upcomingQuests = displayedTasks.filter((t) => {
    const endDate = t.dueAt ? new Date(t.dueAt) : new Date(t.createdAt);
    return endDate.getTime() >= Date.now();
  }).length;
  const overallProgress = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;
  const xpEarned = completedQuests * 75;

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setAssigneeFilter('ALL');
    setRangeFilter('60');
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
          <p className="text-sm text-slate-600">Loading care flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-slate-50">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Gantt Chart</h1>
          <p className="text-sm text-slate-600">Track User tasks, monitor team progress, and coordinate care schedules.</p>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr,1fr,auto]">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={assigneeFilter === 'ALL'} onClick={() => setAssigneeFilter('ALL')}>All Staff</Chip>
            {hasUnassignedTasks && (
              <Chip active={assigneeFilter === UNASSIGNED_FILTER_VALUE} onClick={() => setAssigneeFilter(UNASSIGNED_FILTER_VALUE)}>Unassigned</Chip>
            )}
            {assigneeOptions.map((a) => (
              <Chip key={a.id} active={assigneeFilter === a.id} onClick={() => setAssigneeFilter(a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>All Statuses</Chip>
            {Object.values(TaskStatus).map((s) => (
              <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {formatTaskStatus(s)}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            {(['30', '60', '90', 'ALL'] as RangeFilter[]).map((r) => (
              <Chip key={r} active={rangeFilter === r} onClick={() => setRangeFilter(r)}>
                {r === 'ALL' ? 'All Time' : `${r}d`}
              </Chip>
            ))}
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:text-xs"
              title="Press R to reset"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Tasks" value={`${totalQuests}`} hint="All activities visible in the current view." classes="" />
          <StatCard label="Active Tasks" value={`${activeQuests}`} hint="Currently in motion across the board." classes="" />
          <StatCard label="Completion Rate" value={`${overallProgress}%`} hint="Task completion ratio for the visible timeline." classes="" />
          <StatCard label="Care Score" value={`${xpEarned} Points`} hint={`~${upcomingQuests} tasks upcoming`} classes="" />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPrev={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
        />

        <div className="overflow-x-auto pb-2">
          {displayedTasks.length > 0 ? (
            <div className="min-w-[980px] space-y-3">
              <div className="grid grid-cols-[240px,1fr] rounded-xl border border-slate-200 bg-slate-50">
                <div className="p-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Clinical Task</div>
                <div className="p-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Timeline</div>
              </div>

              <div className="grid grid-cols-[240px,1fr]">
                <div className="rounded-l-xl border border-r-0 border-slate-200 bg-white">
                  {displayedTasks.map((task) => (
                    <div key={`label-${task.id}`} className="flex h-[84px] items-center border-b border-slate-100 p-3 last:border-b-0" title={task.title}>
                      <div className="flex min-w-0 w-full flex-col gap-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <div className="-space-x-2">
                            {(task.assignedTo && task.assignedTo.length ? task.assignedTo : []).slice(0, 3).map((id) => (
                              <span key={id} className="inline-block">
                                <Initials name={usersMap.get(id)?.name || 'U'} />
                              </span>
                            ))}
                          </div>
                          <span className="truncate">{formatAssigneeNames(task.assignedTo)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded-r-xl border border-slate-200 bg-slate-50">
                  <div className="pointer-events-none absolute inset-0 opacity-90" style={timelineBackgroundStyle} />

                  {todayPosition !== null && (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 w-px -translate-x-1/2 bg-amber-500"
                      style={{ left: `${todayPosition}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 w-max -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                        Today
                      </div>
                    </div>
                  )}

                  {timelineMarkers.map((marker, i) => (
                    <div key={`marker-${i}`} className="pointer-events-none absolute bottom-0 top-0 border-l border-slate-200" style={{ left: `${marker.position}%` }}>
                      <span className="absolute -top-6 left-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{marker.label}</span>
                    </div>
                  ))}

                  <div className="relative">
                    {displayedTasks.map((task) => {
                      const startDate = new Date(task.createdAt);
                      const endDate = task.dueAt ? new Date(task.dueAt) : new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
                      const startOffset = getDayOffset(startDate);
                      const duration = Math.max(1, Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                      const left = Math.max(0, (startOffset / totalDays) * 100);
                      const width = Math.max(8, (duration / totalDays) * 100);
                      const maxWidth = 100 - left;
                      const clampedWidth = Math.min(width, maxWidth);
                      const isCompact = clampedWidth < 24;
                      const isUltraCompact = clampedWidth < 14;

                      const theme = statusThemes[task.status] || defaultTheme;
                      const assigneeNames = formatAssigneeNames(task.assignedTo);
                      const totalSubtasks = task.subtasks?.length || 0;
                      const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
                      const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : (completedStatuses.has(task.status) ? 100 : 0);

                      return (
                        <div key={task.id} className="flex h-[84px] items-center border-b border-slate-100 px-3 last:border-b-0">
                          <div
                            className={`relative z-10 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 ${theme.gradient} ${theme.glow} ${theme.ring}`}
                            style={{ marginLeft: `${left}%`, width: `${clampedWidth}%` }}
                            title={`${task.title}\n${theme.title} | ${formatTaskStatus(task.status)}\nAssigned: ${assigneeNames}\nStart: ${formatDate(task.createdAt)}\nDue: ${formatDate(task.dueAt)}`}
                          >
                            <div className={`relative z-10 ${isUltraCompact ? 'p-1.5' : isCompact ? 'p-2' : 'p-3'}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  {!isUltraCompact && (
                                    <div className="truncate text-[13px] font-bold tracking-wide text-slate-900">{task.title}</div>
                                  )}
                                  {!isCompact && (
                                    <div className="mt-0.5 truncate text-[11px] text-slate-600">{assigneeNames}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {!isCompact && (
                                    <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-600">{theme.title}</span>
                                  )}
                                  {!isUltraCompact && (
                                    <span className="whitespace-nowrap text-[11px] text-slate-600">{task.dueAt ? `Due ${formatShortDate(new Date(task.dueAt))}` : 'Due TBD'}</span>
                                  )}
                                </div>
                              </div>
                              <div className={`${isUltraCompact ? 'mt-1' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-white/70`}>
                                <div className="h-full rounded-full bg-slate-800" style={{ width: `${progress}%` }} />
                              </div>
                            </div>

                            {!isUltraCompact && (
                              <div className="pointer-events-none absolute right-1 top-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                {progress}%
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-700">
              <h3 className="text-lg font-semibold">No tasks match the current filters.</h3>
              <p className="mt-2 text-sm text-slate-500">Adjust filters or assign due dates to populate this care flow.</p>
            </div>
          )}
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPrev={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Legend</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(statusThemes).map(([status, theme]) => (
            <div key={status} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
              <span className={`h-2.5 w-2.5 rounded-full ${theme.accent}`} />
              <span className="font-semibold">{theme.title}</span>
              <span className="text-slate-500">({formatTaskStatus(status as TaskStatus)})</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GanttRaidMapPage;
