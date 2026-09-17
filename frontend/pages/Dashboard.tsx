import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, User, TaskStatus, TaskPriority, Role } from '../types';
import { useAuth, useSearch, useTheme } from '../hooks/useAuth';
import api from '../services/mockApi';
import TaskStatusBadge from '../components/ui/TaskStatusBadge';
import TaskPriorityBadge from '../components/ui/TaskPriorityBadge';
import { formatDate } from '../utils';
import TaskDetailModal from '../components/TaskDetailModal';
import { augmentTasksWithPoints, calculateUserPointsFromTasks } from '../utils/taskPoints';
import { loadPointsConfig, POINTS_CONFIG_UPDATED_EVENT } from '../utils/pointsConfigStorage';
import { LEVELS_CONFIG_UPDATED_EVENT, getLevelProgress, loadLevelsConfig } from '../utils/levelsConfigStorage';

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

const statusOrder: TaskStatus[] = [
    TaskStatus.WAITING_FOR_REQUIREMENT,
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_REVIEW,
    TaskStatus.BLOCKED,
    TaskStatus.ON_HOLD,
    TaskStatus.DONE,
    TaskStatus.FAILED,
    TaskStatus.GRAVEYARD,
];

const focusStatuses: TaskStatus[] = [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_REVIEW,
];

const focusQueueStatusSet = new Set<TaskStatus>([
    TaskStatus.WAITING_FOR_REQUIREMENT,
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
]);

const completedStatuses = new Set<TaskStatus>([
    TaskStatus.DONE,
    TaskStatus.FAILED,
]);

const statusDetails: Record<TaskStatus, { label: string; legend: string; gradient: string; glow: string }> = {
    [TaskStatus.WAITING_FOR_REQUIREMENT]: {
        label: 'New Task',
        legend: 'New / Ready',
        gradient: 'from-slate-500/25 via-slate-600/25 to-slate-800/30',
        glow: 'shadow-[0_25px_45px_rgba(100,116,139,0.35)]',
    },
    [TaskStatus.TODO]: {
        label: 'started',
        legend: 'Assigned / To Do',
        gradient: 'from-indigo-500/25 via-sky-500/25 to-cyan-500/30',
        glow: 'shadow-[0_25px_45px_rgba(59,130,246,0.35)]',
    },
    [TaskStatus.IN_PROGRESS]: {
        label: 'In Progress',
        legend: 'Task in progress',
        gradient: 'from-purple-500/25 via-fuchsia-500/25 to-rose-500/30',
        glow: 'shadow-[0_25px_45px_rgba(192,132,252,0.35)]',
    },
    [TaskStatus.IN_REVIEW]: {
        label: 'Almost Done',
        legend: 'Physician evaluation',
        gradient: 'from-emerald-500/25 via-teal-500/25 to-sky-400/30',
        glow: 'shadow-[0_25px_45px_rgba(16,185,129,0.35)]',
    },
    [TaskStatus.BLOCKED]: {
        label: 'Half Done',
        legend: 'Requires intervention',
        gradient: 'from-rose-500/25 via-red-500/25 to-orange-500/30',
        glow: 'shadow-[0_25px_45px_rgba(248,113,113,0.35)]',
    },
    [TaskStatus.ON_HOLD]: {
        label: 'On Hold',
        legend: 'Resume when ready',
        gradient: 'from-slate-400/25 via-slate-500/25 to-slate-600/30',
        glow: 'shadow-[0_25px_45px_rgba(148,163,184,0.3)]',
    },
    [TaskStatus.DONE]: {
        label: 'Completed',
        legend: 'Patient discharged',
        gradient: 'from-emerald-400/25 via-lime-400/25 to-amber-300/30',
        glow: 'shadow-[0_25px_45px_rgba(74,222,128,0.35)]',
    },
    [TaskStatus.FAILED]: {
        label: 'Failed',
        legend: 'Review required',
        gradient: 'from-cyan-400/25 via-emerald-400/25 to-teal-400/30',
        glow: 'shadow-[0_25px_45px_rgba(45,212,191,0.35)]',
    },
    [TaskStatus.GRAVEYARD]: {
        label: 'Archived',
        legend: 'Track progress',
        gradient: 'from-slate-500/25 via-slate-600/25 to-slate-800/30',
        glow: 'shadow-[0_25px_45px_rgba(100,116,139,0.35)]',
    },
};

const getStatusDetails = (status: TaskStatus) => {
    return statusDetails[status] || {
        label: status,
        legend: 'Track progress',
        gradient: 'from-slate-500/25 via-slate-600/25 to-slate-800/30',
        glow: 'shadow-[0_25px_45px_rgba(100,116,139,0.35)]',
    };
};

const Dashboard: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [usersMap, setUsersMap] = useState<Map<string, User>>(new Map());
    const [levelsConfig, setLevelsConfig] = useState(() => loadLevelsConfig());
    const { user, updateUserInContext } = useAuth();
    const { debouncedSearchQuery } = useSearch();
    const { theme } = useTheme();
    const resolvedTheme = useResolvedTheme(theme as ThemeMode);
    const isDark = resolvedTheme === 'dark';
    const isColorful = resolvedTheme === 'colorful';

    const [isPresent, setIsPresent] = useState(user?.is_present ?? 0);

    useEffect(() => {
        if (user) {
            setIsPresent(user.is_present ?? 0);
        }
    }, [user]);

    const handleToggleSelfAttendance = async () => {
        if (!user) return;
        const newIsPresent = isPresent === 1 ? 0 : 1;
        try {
            const updatedUser = await api.updateCurrentUserProfile(user.id, { is_present: newIsPresent });
            updateUserInContext(updatedUser);
            setIsPresent(updatedUser.is_present ?? newIsPresent);
            fetchDashboardData();
        } catch (error) {
            console.error('Failed to update self attendance:', error);
        }
    };

    const fetchDashboardData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [fetchedTasks, allUsers] = await Promise.all([
                api.getTasks(user.id, user.role),
                api.getUsers(),
            ]);

            const tasksWithPoints = augmentTasksWithPoints(fetchedTasks, { config: loadPointsConfig() });
            setAllTasks(tasksWithPoints);
            const myTasks = tasksWithPoints.filter((task) => task.assignedTo?.includes(user.id));
            setTasks(myTasks);

            const map = new Map<string, User>();
            allUsers.forEach((entry) => map.set(entry.id, entry));
            setUsersMap(map);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handlePointsConfigChange = () => {
            setAllTasks((prev) => augmentTasksWithPoints(prev, { config: loadPointsConfig() }));
            setTasks((prev) => augmentTasksWithPoints(prev, { config: loadPointsConfig() }));
        };

        window.addEventListener(POINTS_CONFIG_UPDATED_EVENT, handlePointsConfigChange);
        return () => window.removeEventListener(POINTS_CONFIG_UPDATED_EVENT, handlePointsConfigChange);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleLevelsConfigChange = (event: Event) => {
            const detail = (event as CustomEvent).detail as { levels?: unknown } | undefined;
            setLevelsConfig(Array.isArray(detail?.levels) ? (detail.levels as ReturnType<typeof loadLevelsConfig>) : loadLevelsConfig());
        };

        window.addEventListener(LEVELS_CONFIG_UPDATED_EVENT, handleLevelsConfigChange);
        return () => window.removeEventListener(LEVELS_CONFIG_UPDATED_EVENT, handleLevelsConfigChange);
    }, []);

    const priorityLabel: Record<TaskPriority, string> = {
        [TaskPriority.LOW]: 'Low',
        [TaskPriority.MEDIUM]: 'Medium',
        [TaskPriority.HIGH]: 'High',
        [TaskPriority.URGENT]: 'Urgent',
    };

    const filteredTasks = useMemo(() => {
        if (!debouncedSearchQuery) return tasks;
        const query = debouncedSearchQuery.toLowerCase();
        return tasks.filter((task) => {
            const label = priorityLabel[task.priority as TaskPriority] || '';
            return (
                task.title.toLowerCase().includes(query) ||
                task.description.toLowerCase().includes(query) ||
                task.team.toLowerCase().includes(query) ||
                task.priority.toLowerCase().includes(query) ||
                label.toLowerCase().includes(query)
            );
        });
    }, [tasks, debouncedSearchQuery]);

    const focusQueueTasks = useMemo(() => {
        const roleWeight: Record<Role, number> = {
            [Role.OWNER]: 3,
            [Role.MANAGER]: 2,
            [Role.ADMIN]: 1,
            [Role.USER]: 0,
        };

        const priorityWeight: Record<TaskPriority, number> = {
            [TaskPriority.URGENT]: 3,
            [TaskPriority.HIGH]: 2,
            [TaskPriority.MEDIUM]: 1,
            [TaskPriority.LOW]: 0,
        };

        return [...filteredTasks]
            .filter((task) => focusQueueStatusSet.has(task.status))
            .sort((a, b) => {
                const aRole = usersMap.get(a.createdBy)?.role ?? Role.USER;
                const bRole = usersMap.get(b.createdBy)?.role ?? Role.USER;
                const roleDelta = (roleWeight[bRole] ?? 0) - (roleWeight[aRole] ?? 0);
                if (roleDelta !== 0) return roleDelta;

                const priorityDelta = (priorityWeight[b.priority as TaskPriority] ?? 0) - (priorityWeight[a.priority as TaskPriority] ?? 0);
                if (priorityDelta !== 0) return priorityDelta;

                const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
                const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
                return aDue - bDue;
            })
            .slice(0, 5);
    }, [filteredTasks, usersMap]);

    const tasksByStatus = useMemo(() => {
        return filteredTasks.reduce((acc, task) => {
            const key = task.status;
            acc[key] = acc[key] || [];
            acc[key].push(task);
            return acc;
        }, {} as Record<TaskStatus, Task[]>);
    }, [filteredTasks]);

    const totalTasks = filteredTasks.length;
    const completedCount = filteredTasks.filter((task) => completedStatuses.has(task.status)).length;
    const focusCount = filteredTasks.filter((task) => focusStatuses.includes(task.status)).length;
    const blockedCount = filteredTasks.filter((task) => task.status === TaskStatus.BLOCKED).length;

    const xpScore = user ? calculateUserPointsFromTasks(allTasks, user.id, { user }) : 0;
    const levelProgressData = useMemo(() => getLevelProgress(xpScore, levelsConfig), [xpScore, levelsConfig]);
    const level = levelProgressData.level;
    const xpIntoLevel = levelProgressData.pointsIntoLevel;
    const levelProgress = levelProgressData.progressPercent;
    const levelSpan = levelProgressData.levelSpan;
    const xpToNextLevel = levelProgressData.pointsToNextLevel;
    const nextLevel = levelProgressData.nextLevel;

    const streakLength = Math.max(1, Math.min(30, completedCount + Math.floor(focusCount / 2)));
    const dailyObjective = Math.max(3, Math.ceil(totalTasks / 3));
    const momentumScore = Math.min(100, Math.round(((completedCount + focusCount) / Math.max(1, totalTasks)) * 100));

    const handleTaskClick = (taskId: string) => setSelectedTaskId(taskId);
    const handleCloseModal = () => setSelectedTaskId(null);

    const handleTaskDeleted = useCallback((_taskId: string) => {
        setSelectedTaskId(null);
        fetchDashboardData();
    }, [fetchDashboardData]);

    if (loading) {
        return <div className="text-center p-8">Loading dashboard...</div>;
    }

    const heroBorder = isDark ? 'border-primary/40' : isColorful ? 'border-pink-200/60' : 'border-black/20';
    const heroGradient = isDark
        ? 'from-[#1e1b4b] via-[#312e81] to-[#4c1d95]'
        : isColorful
        ? 'from-[#a855f7]/40 via-[#ec4899]/50 to-[#38bdf8]/45'
        : 'from-[#f8fafc] via-[#eef2ff] to-[#f0f9ff]';

    const heroTitle = isDark ? 'text-white' : 'text-slate-900';
    const heroSub = isDark ? 'text-white/80' : 'text-slate-600';
    const heroMeta = isDark ? 'text-white/60' : 'text-slate-500';
    const statCardBase = isDark
        ? 'border-white/15 bg-black/25 text-white/80'
        : isColorful
        ? 'border-white/60 bg-white/40 text-slate-900 shadow-[0_20px_45px_rgba(129,140,248,0.2)]'
        : 'border-slate-200/90 bg-white/90 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.08)]';
    const statAccent = isDark ? 'text-white' : 'text-slate-900';

    const questCardBase = isDark
        ? 'bg-surface/70 border border-border-color/70 text-white'
        : 'bg-white/90 border border-slate-200/90 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.08)]';

    const pipelineSurface = isDark
        ? 'bg-surface/80 border border-border-color/70'
        : 'bg-white/90 border border-slate-200/90 shadow-[0_10px_24px_rgba(15,23,42,0.08)]';

    return (
        <div className={`mx-auto w-full max-w-7xl space-y-7 sm:space-y-10 px-2 sm:px-0 pb-12 ${!isDark && !isColorful ? 'bg-gradient-to-b from-slate-50/90 via-indigo-50/40 to-sky-50/50 rounded-3xl p-3 sm:p-4' : ''}`}>
            <style>{`
                @keyframes dashboardPulse {
                    0%, 100% { transform: translate3d(0,0,0) scale(1); opacity: 0.9; }
                    50% { transform: translate3d(0,-8px,0) scale(1.02); opacity: 1; }
                }
                @keyframes dashboardGlow {
                    0%, 100% { box-shadow: 0 0 0 rgba(99,102,241,0.2); }
                    50% { box-shadow: 0 0 45px rgba(99,102,241,0.35); }
                }
                @keyframes dashboardSlide {
                    0% { transform: translateY(12px); opacity: 0; }
                    100% { transform: translateY(0); opacity: 1; }
                }
            `}</style>

            <section className={`relative overflow-hidden rounded-3xl border ${heroBorder} bg-gradient-to-br ${heroGradient} p-4 sm:p-8`}>
                <div className={`pointer-events-none absolute -top-20 sm:-top-24 right-0 h-48 sm:h-56 w-48 sm:w-56 rounded-full ${isDark ? 'bg-primary/30' : 'bg-white/60'} blur-3xl`} />
                <div className={`pointer-events-none absolute -bottom-20 sm:bottom-0 left-0 h-48 sm:h-52 w-48 sm:w-52 rounded-full ${isDark ? 'bg-rose-500/30' : 'bg-amber-200/60'} blur-3xl`} />

                <div className="relative grid gap-6 lg:gap-8 lg:grid-cols-[1.2fr,1fr] items-start justify-items-center lg:justify-items-stretch">
                    <div className="w-full space-y-5 sm:space-y-6 text-center sm:text-left">
                        <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4 sm:gap-6">
                            <p className={`text-xs font-semibold uppercase tracking-wider ${heroMeta}`}>
                                Dashboard
                            </p>

                            {(user?.role === Role.USER || user?.role === Role.MANAGER) && (
                                <div className={`w-full sm:w-auto flex flex-wrap items-center justify-center sm:justify-between gap-3 rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-2.5 ${isDark ? 'border-white/15 bg-white/5' : 'border-slate-200/90 bg-white/75 shadow-[0_8px_18px_rgba(15,23,42,0.08)]'}`}>
                                    <button
                                        onClick={handleToggleSelfAttendance}
                                        className={`flex h-10 items-center justify-center gap-2.5 rounded-full border px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold transition-all duration-300 min-w-[132px] sm:min-w-[168px]
                                            ${isPresent === 1
                                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 shadow-emerald-500/20'
                                                : 'border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 shadow-rose-500/20'
                                            } shadow-md hover:shadow-lg`}
                                    >
                                        <div className={`h-2.5 w-2.5 rounded-full ${isPresent === 1 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                                        {isPresent === 1 ? 'MARKED PRESENT' : 'MARK PRESENT'}
                                    </button>

                                    <span
                                        className={`h-10 inline-flex items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap ${isPresent === 1 ? (isDark ? 'text-emerald-300 bg-emerald-500/10' : 'text-emerald-600 bg-emerald-50') : (isDark ? 'text-rose-300 bg-rose-500/10' : 'text-rose-600 bg-rose-50')}`}
                                    >
                                        {isPresent === 1 ? 'You are Present' : 'You are Absent'}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <h1 className={`tracking-tight ${heroTitle}`}>
                                <span className="block text-[30px] sm:text-[34px] leading-[1.15] font-medium">
                                    Welcome back,
                                </span>
                                <span className="mt-1 block text-[34px] sm:text-[40px] leading-[1.05] font-extrabold">
                                    {user?.name?.split(' ')[0] || 'Care Provider'}!
                                </span>
                            </h1>
                            <p className={`mt-3 text-sm sm:text-base leading-7 max-w-3xl mx-auto sm:mx-0 ${heroSub}`}>
                                Your contributions matter. Stay committed to your daily tasks and help your team achieve meaningful outcomes.
                            </p>
                        </div>

                        <div className="grid w-full gap-4 sm:grid-cols-2 justify-items-center sm:justify-items-stretch">
                            <div className={`${statCardBase} w-full max-w-md sm:max-w-none rounded-2xl px-5 py-5 backdrop-blur-sm animate-[dashboardSlide_0.6s_ease-out]`}>
                                <p className="text-xs uppercase tracking-wider opacity-80">Experience Level</p>
                                <p className="mt-2 text-3xl font-bold">Level {level}</p>
                                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-400 to-indigo-500"
                                        style={{ width: `${levelProgress}%` }}
                                    />
                                </div>
                                <p className="mt-3 text-xs opacity-70">
                                    {xpIntoLevel.toLocaleString()} / {levelSpan.toLocaleString()} Care Points •{' '}
                                    {nextLevel ? `${xpToNextLevel.toLocaleString()} to Level ${nextLevel.level}` : 'Max level'}
                                </p>
                            </div>

                            <div className={`${statCardBase} w-full max-w-md sm:max-w-none rounded-2xl px-5 py-5 backdrop-blur-sm animate-[dashboardSlide_0.75s_ease-out]`}>
                                <p className="text-xs uppercase tracking-wider opacity-80">Task Progress</p>
                                <p className="mt-2 text-3xl font-bold">{momentumScore}%</p>
                                <p className="mt-3 text-sm opacity-80">
                                    {completedCount} completed • {focusCount} priority • {blockedCount} pending
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <span className="rounded-full px-3 py-1 text-xs font-medium bg-black/10 dark:bg-white/10">
                                        {streakLength}-day streak
                                    </span>
                                    <span className="rounded-full px-3 py-1 text-xs font-medium bg-black/10 dark:bg-white/10">
                                        Goal: {dailyObjective} tasks
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid w-full gap-4 sm:grid-cols-2 justify-items-center sm:justify-items-stretch">
                        {[
                            { label: 'Tasks Assigned', value: totalTasks, accent: 'from-sky-400 via-indigo-400 to-purple-500', delay: '0s' },
                            { label: 'Tasks Points Earned', value: xpScore.toLocaleString(), accent: 'from-emerald-400 via-teal-400 to-cyan-400', delay: '0.08s' },
                            { label: 'Priority Tasks', value: focusCount, accent: 'from-fuchsia-400 via-rose-400 to-orange-400', delay: '0.16s' },
                            { label: 'Pending Actions', value: Math.max(0, completedCount - 3), accent: 'from-amber-400 via-yellow-400 to-rose-400', delay: '0.24s' },
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                className={`relative w-full max-w-md sm:max-w-none overflow-hidden rounded-2xl ${statCardBase} px-5 py-5 animate-[dashboardSlide_0.7s_ease-out]`}
                                style={{ animationDelay: stat.delay }}
                            >
                                <div className="absolute inset-0 opacity-[0.07] sm:opacity-[0.12]">
                                    <div className={`h-full w-full bg-gradient-to-br ${stat.accent}`} />
                                </div>
                                <div className="relative">
                                    <p className="text-xs uppercase tracking-wider opacity-80">{stat.label}</p>
                                    <p className={`mt-2 text-2xl sm:text-3xl font-bold ${statAccent}`}>{stat.value}</p>
                                    <p className="mt-2 text-xs opacity-70">Complete tasks to maintain progress</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Rest of your component remains exactly the same – only hero section alignment was adjusted */}

            <section className="grid gap-6 lg:grid-cols-[2fr,1fr] items-start">
                <div className={`${pipelineSurface} rounded-3xl p-6 sm:p-7 backdrop-blur-sm`}>
                    <div className="mb-6 flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4 text-center sm:text-left">
                        <div>
                            <p className="text-xs uppercase tracking-wider opacity-70">Task Workflow</p>
                            <h2 className="mt-1 text-2xl font-semibold">Task Management</h2>
                        </div>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-4 text-sm opacity-70">
                            <span>Total: {totalTasks}</span>
                            <span>• Completed: {completedCount}</span>
                        </div>
                    </div>

                    {totalTasks === 0 ? (
                        <div className="rounded-2xl border border-dashed p-8 text-center opacity-70">
                            No tasks assigned yet. Please assign tasks from the  Board.
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 items-stretch">
                            {statusOrder
                                .filter((status) => tasksByStatus[status]?.length)
                                .map((status) => {
                                    const detail = getStatusDetails(status);
                                    const items = tasksByStatus[status];
                                    const progressValue = Math.min(100, Math.round((items.length / Math.max(1, totalTasks)) * 100));

                                    return (
                                        <div
                                            key={status}
                                            className={`relative overflow-hidden rounded-2xl border px-5 py-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col ${detail.glow} ${isDark ? 'border-white/10' : 'border-black/10'}`}
                                        >
                                            <div className="absolute inset-0 opacity-75">
                                                <div className={`h-full w-full bg-gradient-to-br ${detail.gradient}`} />
                                            </div>
                                            <div className="relative flex flex-col h-full">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wider opacity-70">{detail.legend}</p>
                                                        <h3 className="mt-1 text-lg font-semibold">{detail.label}</h3>
                                                    </div>
                                                    <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium">
                                                        {items.length} {items.length === 1 ? 'Task' : 'Tasks'}
                                                    </span>
                                                </div>

                                                <div className="h-2 w-full overflow-hidden rounded-full bg-black/20 mb-4">
                                                    <div className="h-full rounded-full bg-white/60" style={{ width: `${progressValue}%` }} />
                                                </div>

                                                <p className="text-xs opacity-70 mb-4">{progressValue}% of current load</p>

                                                <div className="space-y-3 flex-1">
                                                    {items.slice(0, 3).map((task) => (
                                                        <button
                                                            key={task.id}
                                                            onClick={() => handleTaskClick(task.id)}
                                                            className={`group flex w-full items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all ${isDark ? 'border-white/5 bg-black/30 hover:bg-black/40' : 'border-black/5 bg-white/60 hover:bg-white/80 shadow-sm'}`}
                                                        >
                                                            <div className="flex-1">
                                                                <p className={`font-medium group-hover:text-primary ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                                    {task.title}
                                                                </p>
                                                                <p className="mt-1 text-xs opacity-70 line-clamp-2">{task.description}</p>
                                                            </div>
                                                            <TaskPriorityBadge priority={task.priority} />
                                                        </button>
                                                    ))}
                                                    {items.length > 3 && (
                                                        <p className="text-xs opacity-60 text-center pt-2">
                                                            +{items.length - 3} more
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className={`${questCardBase} rounded-3xl p-6 sm:p-7 backdrop-blur-sm`}>
                        <h2 className="text-xl font-semibold mb-2 text-center sm:text-left">Priority Tasks</h2>
                        <p className="text-sm opacity-70 mb-5 text-center sm:text-left">These tasks require immediate attention.</p>

                        <div className="space-y-4">
                            {focusQueueTasks.length === 0 ? (
                                <p className="text-sm opacity-70 py-4">No urgent cases right now.</p>
                            ) : (
                                focusQueueTasks.map((task) => (
                                    <button
                                        key={task.id}
                                        onClick={() => handleTaskClick(task.id)}
                                        className={`group w-full rounded-2xl border px-5 py-4 text-left transition-all ${isDark ? 'border-white/10 bg-black/30 hover:border-primary/50' : 'border-black/10 bg-white/60 hover:border-primary/30'} hover:shadow-md`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="font-medium group-hover:text-primary">{task.title}</p>
                                            <span className="text-xs opacity-70">
                                                {task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date'}
                                            </span>
                                        </div>
                                        <p className="text-sm opacity-70 line-clamp-2 mb-3">{task.description}</p>
                                        <div className="flex items-center gap-3 text-xs">
                                            <TaskStatusBadge status={task.status} />
                                            <span className="opacity-50">•</span>
                                            <TaskPriorityBadge priority={task.priority} />
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {selectedTaskId && (
                <TaskDetailModal
                    taskId={selectedTaskId}
                    isOpen={Boolean(selectedTaskId)}
                    onClose={handleCloseModal}
                    usersMap={usersMap}
                    onTaskDeleted={handleTaskDeleted}
                />
            )}
        </div>
    );
};

export default Dashboard;
