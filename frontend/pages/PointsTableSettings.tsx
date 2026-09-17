import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskPriority } from '../types';
import {
    getConfiguredDepartments,
    getDefaultPointsConfig,
    loadPointsConfig,
    savePointsConfig,
    resetPointsConfig,
    loadTaskCreationPoints,
    saveTaskCreationPoints,
    resetTaskCreationPoints,
    loadClarityPointsPerStar,
    saveClarityPointsPerStar,
    resetClarityPointsPerStar,
    loadManagerOverduePenalty,
    saveManagerOverduePenalty,
    resetManagerOverduePenalty,
    PointsConfig,
    PointsField,
    PriorityPoints,
    priorityOrder,
} from '../utils/pointsConfigStorage';
import { BOT_ERROR_MESSAGE, sendAiMessage } from '../utils/aiClient';
import api from '../services/mockApi';
import { ArrowRightIcon } from '../components/icons';

interface RowDescriptor {
    id: string;
    label: string;
    priority: TaskPriority;
    field: PointsField;
    tone: 'base' | 'bonus' | 'penalty';
}

const priorityLabels: Record<TaskPriority, string> = {
    [TaskPriority.LOW]: 'Low Priority',
    [TaskPriority.MEDIUM]: 'Medium Priority',
    [TaskPriority.HIGH]: 'High Priority',
    [TaskPriority.URGENT]: 'Urgent Priority',
};

const fieldFriendlyLabels: Record<PointsField, string> = {
    base: 'Base',
    beforeDueBonus: 'Before Due Bonus',
    overduePenalty: 'Overdue Penalty',
};

const rowDescriptors: RowDescriptor[] = priorityOrder.flatMap((priority) => ([
    {
        id: `${priority}-base`,
        label: priorityLabels[priority],
        priority,
        field: 'base',
        tone: 'base',
    },
    {
        id: `${priority}-bonus`,
        label: '➕ Before Due Date',
        priority,
        field: 'beforeDueBonus',
        tone: 'bonus',
    },
    {
        id: `${priority}-penalty`,
        label: '❌ Overdue Penalty',
        priority,
        field: 'overduePenalty',
        tone: 'penalty',
    },
]));

const createEmptyPriorityPoints = (): PriorityPoints => ({
    base: 0,
    beforeDueBonus: 0,
    overduePenalty: 0,
});

const createEmptyDepartmentConfig = (): Record<TaskPriority, PriorityPoints> => ({
    [TaskPriority.LOW]: createEmptyPriorityPoints(),
    [TaskPriority.MEDIUM]: createEmptyPriorityPoints(),
    [TaskPriority.HIGH]: createEmptyPriorityPoints(),
    [TaskPriority.URGENT]: createEmptyPriorityPoints(),
});

const cloneDepartmentConfig = (departmentConfig: Record<TaskPriority, PriorityPoints>): Record<TaskPriority, PriorityPoints> => ({
    [TaskPriority.LOW]: { ...departmentConfig[TaskPriority.LOW] },
    [TaskPriority.MEDIUM]: { ...departmentConfig[TaskPriority.MEDIUM] },
    [TaskPriority.HIGH]: { ...departmentConfig[TaskPriority.HIGH] },
    [TaskPriority.URGENT]: { ...departmentConfig[TaskPriority.URGENT] },
});

const resolveFallbackDepartmentConfig = (defaultConfig: PointsConfig): Record<TaskPriority, PriorityPoints> => {
    if (defaultConfig.Other) {
        return cloneDepartmentConfig(defaultConfig.Other);
    }
    const [first] = Object.values(defaultConfig);
    return first ? cloneDepartmentConfig(first) : createEmptyDepartmentConfig();
};

const clonePointsConfig = (config: PointsConfig): PointsConfig => {
    const copy: PointsConfig = {} as PointsConfig;
    for (const [department, departmentConfig] of Object.entries(config)) {
        copy[department] = cloneDepartmentConfig(departmentConfig);
    }
    return copy;
};

const normalizeDepartmentKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const stripDepartmentSuffix = (value: string): string => value.replace(/\b(team|department|dept)\b/gi, '').trim();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findNumberNearKeywords = (source: string, keywords: string[]): number | null => {
    for (const keyword of keywords) {
        const escaped = escapeRegExp(keyword);
        const forward = new RegExp(`${escaped}\\s*(?:points?|value|score)?\\s*(?:to|=|is|:)?\\s*(-?\\d+)`, 'i');
        const backward = new RegExp(`(-?\\d+)\\s*(?:points?)?\\s*(?:for\\s*)?${escaped}`, 'i');
        const match = source.match(forward) ?? source.match(backward);
        if (match) {
            const parsed = Number(match[1]);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
};

const findAnyNumber = (source: string): number | null => {
    const match = source.match(/-?\d+/);
    if (!match) {
        return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
};

const extractPriorities = (source: string): TaskPriority[] => {
    const normalized = source.toLowerCase();
    if (/\b(all|every|across)\b.*\b(priority|priorities|levels)\b/.test(normalized)) {
        return priorityOrder.slice();
    }

    const matches: TaskPriority[] = [];
    if (/\blow\b/.test(normalized)) {
        matches.push(TaskPriority.LOW);
    }
    if (/\bmedium\b|\bmid\b/.test(normalized)) {
        matches.push(TaskPriority.MEDIUM);
    }
    if (/\bhigh\b/.test(normalized)) {
        matches.push(TaskPriority.HIGH);
    }
    if (/\burgent\b|\bcritical\b/.test(normalized)) {
        matches.push(TaskPriority.URGENT);
    }
    return matches;
};

const matchDepartmentsFromInstruction = (instruction: string, departments: string[]): string[] => {
    const normalizedInstruction = normalizeDepartmentKey(instruction);
    const matches = departments.filter((department) => {
        const normalized = normalizeDepartmentKey(department);
        if (normalizedInstruction.includes(normalized)) {
            return true;
        }
        const alias = normalizeDepartmentKey(stripDepartmentSuffix(department));
        return alias.length > 0 && normalizedInstruction.includes(alias);
    });
    return matches;
};

const parseLocalInstruction = (
    instruction: string,
    departments: string[],
): { payload: Record<string, unknown>[]; note?: string } | null => {
    const trimmed = instruction.trim();
    if (!trimmed) {
        return null;
    }

    const matchedDepartments = matchDepartmentsFromInstruction(trimmed, departments);
    if (matchedDepartments.length === 0) {
        return null;
    }

    let priorities = extractPriorities(trimmed);
    let note: string | undefined;
    if (priorities.length === 0) {
        priorities = [TaskPriority.MEDIUM];
        note = 'No priority specified; applied to Medium priority.';
    }

    const bonusValue = findNumberNearKeywords(trimmed, [
        'before due',
        'before due date',
        'early bonus',
        'early completion',
        'bonus',
    ]);
    const penaltyValue = findNumberNearKeywords(trimmed, [
        'overdue penalty',
        'late penalty',
        'overdue',
        'penalty',
    ]);

    let baseValue = findNumberNearKeywords(trimmed, ['base', 'base points']);
    if (baseValue === null) {
        baseValue = findNumberNearKeywords(trimmed, ['points', 'point']);
    }

    if (baseValue === null && bonusValue === null && penaltyValue === null) {
        const fallback = findAnyNumber(trimmed);
        if (fallback === null) {
            return null;
        }
        baseValue = fallback;
        note = note ? `${note} Assumed base points.` : 'Assumed base points.';
    }

    const payload: Record<string, unknown>[] = [];
    matchedDepartments.forEach((department) => {
        priorities.forEach((priority) => {
            payload.push({
                department,
                priority,
                base: baseValue ?? undefined,
                beforeDueBonus: bonusValue ?? undefined,
                overduePenalty: penaltyValue ?? undefined,
                note,
            });
        });
    });

    return { payload, note };
};

const extractJsonCandidate = (reply: string): string | null => {
    const firstBrace = reply.indexOf('{');
    const firstBracket = reply.indexOf('[');
    const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
    if (start === -1) {
        return null;
    }
    const lastBrace = reply.lastIndexOf('}');
    const lastBracket = reply.lastIndexOf(']');
    const end = lastBrace === -1 ? lastBracket : lastBracket === -1 ? lastBrace : Math.max(lastBrace, lastBracket);
    if (end === -1 || end <= start) {
        return null;
    }
    return reply.slice(start, end + 1);
};

const parseAiJsonReply = (reply: string): unknown | null => {
    try {
        return JSON.parse(reply);
    } catch {
        const candidate = extractJsonCandidate(reply);
        if (!candidate) {
            return null;
        }
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }
};

const findDepartmentMatch = (departments: string[], raw: string): string | null => {
    const normalized = normalizeDepartmentKey(raw);
    return departments.find((dept) => normalizeDepartmentKey(dept) === normalized) ?? null;
};

const normalizePriority = (value: string): TaskPriority | null => {
    const normalized = value.trim().toUpperCase();
    const cleaned = normalized.replace('PRIORITY', '').trim();
    switch (cleaned) {
        case 'LOW':
        case 'L':
            return TaskPriority.LOW;
        case 'MEDIUM':
        case 'MID':
        case 'M':
            return TaskPriority.MEDIUM;
        case 'HIGH':
        case 'H':
            return TaskPriority.HIGH;
        case 'URGENT':
        case 'CRITICAL':
        case 'U':
            return TaskPriority.URGENT;
        default:
            return null;
    }
};

const readNumeric = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
};

const coercePenalty = (value: number): number => (value > 0 ? -value : value);
const coerceBonus = (value: number): number => (value < 0 ? Math.abs(value) : value);

const collectNote = (entry: Record<string, unknown>): string => {
    const sources = ['notes', 'note', 'reason', 'suggestion', 'message'];
    const collected = sources
        .map((key) => entry[key])
        .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
        .map((text) => text.trim());
    return collected.join(' ');
};

const applyAiPayload = (
    config: PointsConfig,
    departments: string[],
    payload: unknown,
    defaultConfig: PointsConfig,
): { config: PointsConfig; messages: string[] } => {
    const working = clonePointsConfig(config);
    const clonedDepartments = new Set<string>();
    const messages: string[] = [];

    const ensureDepartment = (departmentName: string): Record<TaskPriority, PriorityPoints> => {
        if (!working[departmentName]) {
            const fallback = defaultConfig[departmentName] ?? resolveFallbackDepartmentConfig(defaultConfig);
            working[departmentName] = cloneDepartmentConfig(fallback);
            clonedDepartments.add(departmentName);
            return working[departmentName];
        }
        if (!clonedDepartments.has(departmentName)) {
            working[departmentName] = cloneDepartmentConfig(working[departmentName]);
            clonedDepartments.add(departmentName);
        }
        return working[departmentName];
    };

    const processEntry = (entry: Record<string, unknown>) => {
        if (typeof entry.error === 'string') {
            messages.push(`AI reported an error: ${entry.error}`);
            return;
        }

        const departmentRaw = [entry.department, entry.team, entry.group, entry.org]
            .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (!departmentRaw) {
            messages.push('AI response skipped: department not provided.');
            return;
        }

        const matchedDepartment = findDepartmentMatch(departments, departmentRaw);
        if (!matchedDepartment) {
            messages.push(`AI referenced unknown department "${departmentRaw}"; no changes applied.`);
            return;
        }

        const priorityRaw = [entry.priority, entry.level]
            .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (!priorityRaw) {
            messages.push(`AI response for ${matchedDepartment} skipped: priority missing.`);
            return;
        }

        const priority = normalizePriority(priorityRaw);
        if (!priority) {
            messages.push(`AI response for ${matchedDepartment} skipped: unrecognised priority "${priorityRaw}".`);
            return;
        }

        const updates: Partial<PriorityPoints> = {};

        const baseValue = readNumeric(entry.base ?? entry.points ?? entry.value ?? entry.score);
        if (baseValue !== null) {
            updates.base = baseValue;
        }

        const bonusValue = readNumeric(entry.beforeDueBonus ?? entry.before_due_bonus ?? entry.earlyBonus ?? entry.bonus);
        if (bonusValue !== null) {
            updates.beforeDueBonus = coerceBonus(bonusValue);
        }

        const penaltyValue = readNumeric(entry.overduePenalty ?? entry.overdue_penalty ?? entry.latePenalty ?? entry.penalty);
        if (penaltyValue !== null) {
            updates.overduePenalty = coercePenalty(penaltyValue);
        }

        if (Object.keys(updates).length === 0) {
            messages.push(`AI response for ${matchedDepartment} → ${priorityLabels[priority]} did not include numeric values.`);
            return;
        }

        const departmentConfig = ensureDepartment(matchedDepartment);
        const updatedPriority = {
            ...departmentConfig[priority],
            ...updates,
        };
        departmentConfig[priority] = updatedPriority;

        const summaryParts = Object.entries(updates).map(([field, value]) => `${fieldFriendlyLabels[field as PointsField]}=${value}`);
        const note = collectNote(entry);
        const summary = `Updated ${matchedDepartment} → ${priorityLabels[priority]} (${summaryParts.join(', ')})${note ? ` — ${note}` : ''}`;
        messages.push(summary);
    };

    if (Array.isArray(payload)) {
        let appliedCount = 0;
        for (const item of payload) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                processEntry(item as Record<string, unknown>);
                appliedCount += 1;
            }
        }
        if (appliedCount === 0) {
            messages.push('AI returned a list without any usable entries.');
        }
    } else if (payload && typeof payload === 'object') {
        processEntry(payload as Record<string, unknown>);
    } else {
        messages.push('AI response was not valid JSON data for updates.');
    }

    return { config: working, messages };
};

interface BannerState {
    tone: 'success' | 'error' | 'info';
    text: string;
}

const PointsTableSettings: React.FC = () => {
    const [config, setConfig] = useState<PointsConfig>(() => loadPointsConfig());
    const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveBanner, setSaveBanner] = useState<BannerState | null>(null);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiBanner, setAiBanner] = useState<BannerState | null>(null);
    const [aiRawReply, setAiRawReply] = useState<string | null>(null);
    const [aiBusy, setAiBusy] = useState(false);
    const aiInputRef = useRef<HTMLTextAreaElement>(null);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const tableDragState = useRef({ active: false, startX: 0, scrollLeft: 0 });
    const [taskCreationPoints, setTaskCreationPoints] = useState<number>(() => loadTaskCreationPoints());
    const [clarityPointsPerStar, setClarityPointsPerStar] = useState<number>(() => loadClarityPointsPerStar());
    const [managerOverduePenalty, setManagerOverduePenalty] = useState<number>(() => loadManagerOverduePenalty());
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isDraggingTable, setIsDraggingTable] = useState(false);

    const defaultConfig = useMemo(() => getDefaultPointsConfig(), []);
    const fallbackDepartmentConfig = useMemo(() => resolveFallbackDepartmentConfig(defaultConfig), [defaultConfig]);
    const samplePrompts = useMemo(
        () => [
            'Set Sales Team urgent base to 85, early bonus 30, and overdue penalty -35.',
            'For Marketing Team medium priority, base 30 and bonus 12.',
            'All priorities for IT Support: base 20, bonus 8, penalty -12.',
            'Set Client low priority points to 12 and overdue penalty -6.',
            'For Hyper Automation high priority, base 60 and before due bonus 22.',
        ],
        [],
    );

    const departments = useMemo(() => {
        if (availableDepartments.length > 0) {
            return availableDepartments;
        }
        return getConfiguredDepartments(config);
    }, [availableDepartments, config]);

    const updateScrollControls = useCallback(() => {
        const container = tableScrollRef.current;
        if (!container) {
            setCanScrollLeft(false);
            setCanScrollRight(false);
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } = container;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }, []);

    const scrollTableBy = useCallback((direction: 'left' | 'right') => {
        const container = tableScrollRef.current;
        if (!container) {
            return;
        }
        const amount = Math.max(220, Math.round(container.clientWidth * 0.75));
        const delta = direction === 'left' ? -amount : amount;
        container.scrollBy({ left: delta, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadDepartments = async () => {
            try {
                const deptData = await api.getDepartments();
                if (!isMounted) {
                    return;
                }
                const names = (deptData ?? [])
                    .map((dept) => dept.name)
                    .filter((name): name is string => Boolean(name));
                names.sort((a, b) => a.localeCompare(b));
                setAvailableDepartments(names);
            } catch (error) {
                console.error('Failed to load departments for points table', error);
            }
        };
        loadDepartments();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadPointsConfigFromServer = async () => {
            try {
                const remote = await api.getPointsTableConfig();
                if (!isMounted || !remote) {
                    return;
                }
                if (remote.pointsConfig) {
                    savePointsConfig(remote.pointsConfig);
                    setConfig(loadPointsConfig());
                }
                if (remote.taskCreationPoints !== null && remote.taskCreationPoints !== undefined) {
                    saveTaskCreationPoints(remote.taskCreationPoints);
                    setTaskCreationPoints(loadTaskCreationPoints());
                }
                if (remote.clarityPointsPerStar !== null && remote.clarityPointsPerStar !== undefined) {
                    saveClarityPointsPerStar(remote.clarityPointsPerStar);
                    setClarityPointsPerStar(loadClarityPointsPerStar());
                }
                if (remote.managerOverduePenalty !== null && remote.managerOverduePenalty !== undefined) {
                    saveManagerOverduePenalty(remote.managerOverduePenalty);
                    setManagerOverduePenalty(loadManagerOverduePenalty());
                }
            } catch (error) {
                console.error('Failed to load points table config from server', error);
            }
        };
        loadPointsConfigFromServer();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const container = tableScrollRef.current;
        if (!container || typeof window === 'undefined') {
            return;
        }
        updateScrollControls();

        const handleScroll = () => updateScrollControls();
        container.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', updateScrollControls);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateScrollControls);
            resizeObserver.observe(container);
        }

        return () => {
            container.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', updateScrollControls);
            resizeObserver?.disconnect();
        };
    }, [departments.length, updateScrollControls]);

    useEffect(() => {
        if (availableDepartments.length === 0) {
            return;
        }
        setConfig((previous) => {
            let changed = false;
            const next = { ...previous };
            const normalizedKeys = new Map<string, string>();
            Object.keys(next).forEach((key) => {
                const normalized = normalizeDepartmentKey(key);
                if (!normalizedKeys.has(normalized)) {
                    normalizedKeys.set(normalized, key);
                }
            });
            availableDepartments.forEach((department) => {
                const normalized = normalizeDepartmentKey(department);
                const existingKey = normalizedKeys.get(normalized);
                if (!existingKey) {
                    next[department] = cloneDepartmentConfig(fallbackDepartmentConfig);
                    normalizedKeys.set(normalized, department);
                    changed = true;
                    return;
                }
                if (existingKey !== department) {
                    if (!next[department]) {
                        next[department] = cloneDepartmentConfig(next[existingKey]);
                        changed = true;
                    }
                    delete next[existingKey];
                    normalizedKeys.set(normalized, department);
                    changed = true;
                }
            });
            return changed ? next : previous;
        });
    }, [availableDepartments, fallbackDepartmentConfig]);

    useEffect(() => {
        if (!saveBanner) {
            return;
        }
        const timer = window.setTimeout(() => setSaveBanner(null), 4000);
        return () => window.clearTimeout(timer);
    }, [saveBanner]);

    useEffect(() => {
        if (!aiBanner) {
            return;
        }
        const timer = window.setTimeout(() => setAiBanner(null), 5000);
        return () => window.clearTimeout(timer);
    }, [aiBanner]);

    const handleValueChange = (department: string, priority: TaskPriority, field: PointsField) => (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const numericValue = event.target.value === '' ? 0 : Number(event.target.value);
        if (Number.isNaN(numericValue)) {
            return;
        }
        const sanitized = field === 'overduePenalty' ? coercePenalty(numericValue) : numericValue;

        setConfig((previous) => {
            const next = { ...previous };
            const existingDepartment = previous[department];
            const sourceDepartment = existingDepartment
                ? cloneDepartmentConfig(existingDepartment)
                : defaultConfig[department]
                    ? cloneDepartmentConfig(defaultConfig[department])
                    : cloneDepartmentConfig(fallbackDepartmentConfig);

            const updatedPriority = { ...sourceDepartment[priority], [field]: sanitized };
            sourceDepartment[priority] = updatedPriority;
            next[department] = sourceDepartment;
            return next;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.updatePointsTableConfig({
                pointsConfig: config,
                taskCreationPoints,
                clarityPointsPerStar,
                managerOverduePenalty,
            });
            savePointsConfig(config);
            saveTaskCreationPoints(taskCreationPoints);
            saveClarityPointsPerStar(clarityPointsPerStar);
            saveManagerOverduePenalty(managerOverduePenalty);
            setSaveBanner({ tone: 'success', text: 'Points table saved successfully.' });
        } catch (error) {
            console.error('Failed to save points configuration', error);
            savePointsConfig(config);
            saveTaskCreationPoints(taskCreationPoints);
            saveClarityPointsPerStar(clarityPointsPerStar);
            saveManagerOverduePenalty(managerOverduePenalty);
            setSaveBanner({ tone: 'error', text: 'Failed to sync points table. Changes were saved locally.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        const defaults = resetPointsConfig();
        setConfig(defaults);
        setTaskCreationPoints(resetTaskCreationPoints());
        setClarityPointsPerStar(resetClarityPointsPerStar());
        setManagerOverduePenalty(resetManagerOverduePenalty());
        setSaveBanner({ tone: 'info', text: 'Reverted to default points. Remember to save if you want to keep this change.' });
    };

    const handleSaveAdditionalPoints = async () => {
        setIsSaving(true);
        try {
            await api.updatePointsTableConfig({
                taskCreationPoints,
                clarityPointsPerStar,
                managerOverduePenalty,
            });
            saveTaskCreationPoints(taskCreationPoints);
            saveClarityPointsPerStar(clarityPointsPerStar);
            saveManagerOverduePenalty(managerOverduePenalty);
            setSaveBanner({ tone: 'success', text: 'Additional points saved successfully.' });
        } catch (error) {
            console.error('Failed to save additional points', error);
            saveTaskCreationPoints(taskCreationPoints);
            saveClarityPointsPerStar(clarityPointsPerStar);
            saveManagerOverduePenalty(managerOverduePenalty);
            setSaveBanner({ tone: 'error', text: 'Failed to sync additional points. Changes were saved locally.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAiAssist = async () => {
        if (!aiInstruction.trim()) {
            setAiBanner({ tone: 'error', text: 'Please provide an instruction for the AI.' });
            return;
        }

        setAiBusy(true);
        setAiBanner(null);

        const tryApplyLocal = (reason: string, sourceInstruction: string): boolean => {
            const local = parseLocalInstruction(sourceInstruction, departments);
            if (!local) {
                return false;
            }
            const { config: updatedConfig, messages } = applyAiPayload(config, departments, local.payload, defaultConfig);
            setConfig(updatedConfig);
            if (messages.length > 0) {
                setAiBanner({ tone: 'success', text: `${reason} ${messages.join(' ')} Save to persist.` });
            } else {
                setAiBanner({ tone: 'info', text: `${reason} No changes were applied.` });
            }
            return true;
        };

        try {
            const prompt = [
                'You maintain a task points matrix. Respond ONLY with JSON.',
                'Keys: department, priority, base?, beforeDueBonus?, overduePenalty?, notes?.',
                'Priority must be LOW, MEDIUM, HIGH, or URGENT. Use negative numbers for penalties.',
                'If a user says "points", treat it as the base value.',
                'If you cannot comply, respond with {"error": "reason"}.',
                `Instruction: ${aiInstruction.trim()}`,
            ].join('\n');

            const reply = await sendAiMessage({ message: prompt });
            setAiRawReply(reply);

            const parsed = parseAiJsonReply(reply);
            if (!parsed) {
                const applied = tryApplyLocal('Applied from your prompt.', aiInstruction);
                if (!applied) {
                    setAiBanner({ tone: 'info', text: `AI response: ${reply}` });
                }
                return;
            }

            const { config: updatedConfig, messages } = applyAiPayload(config, departments, parsed, defaultConfig);
            setConfig(updatedConfig);

            if (messages.length > 0) {
                setAiBanner({ tone: 'success', text: `${messages.join(' ')} Save to persist.` });
            } else {
                setAiBanner({ tone: 'info', text: 'AI response received but no changes were applied.' });
            }
        } catch (error) {
            console.error('AI request failed', error);
            const applied = tryApplyLocal('Applied locally because AI was unavailable.', aiInstruction);
            if (!applied) {
                setAiBanner({ tone: 'error', text: BOT_ERROR_MESSAGE });
            }
        } finally {
            setAiBusy(false);
        }
    };

    const handleSampleClick = (prompt: string) => {
        setAiInstruction(prompt);
        requestAnimationFrame(() => {
            aiInputRef.current?.focus();
            const length = prompt.length;
            aiInputRef.current?.setSelectionRange(length, length);
        });
    };

    const renderBanner = (banner: BannerState | null) => {
        if (!banner) {
            return null;
        }
        const tones: Record<typeof banner.tone, string> = {
            success: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200',
            error: 'bg-rose-500/10 border-rose-500/50 text-rose-200',
            info: 'bg-sky-500/10 border-sky-500/50 text-sky-200',
        };
        return (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-medium ${tones[banner.tone]}`}>
                {banner.text}
            </div>
        );
    };

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof HTMLElement)) {
            return false;
        }
        return Boolean(target.closest('input, textarea, select, button, label'));
    };

    const handleTablePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || isInteractiveTarget(event.target)) {
            return;
        }
        const container = tableScrollRef.current;
        if (!container) {
            return;
        }
        tableDragState.current = {
            active: true,
            startX: event.clientX,
            scrollLeft: container.scrollLeft,
        };
        container.setPointerCapture(event.pointerId);
        setIsDraggingTable(true);
    };

    const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const container = tableScrollRef.current;
        if (!container || !tableDragState.current.active) {
            return;
        }
        const delta = event.clientX - tableDragState.current.startX;
        container.scrollLeft = tableDragState.current.scrollLeft - delta;
    };

    const endTableDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
        if (!tableDragState.current.active) {
            return;
        }
        tableDragState.current.active = false;
        setIsDraggingTable(false);
        const container = tableScrollRef.current;
        if (container && event) {
            try {
                container.releasePointerCapture(event.pointerId);
            } catch {
                // Ignore if pointer capture isn't active anymore.
            }
        }
    };

    return (
        <div className="space-y-8">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-text-primary">Task Points Table</h1>
                <p className="text-text-secondary max-w-3xl">
                    Adjust the base points, early completion bonuses, and overdue penalties for each department and priority level.
                    Changes are stored locally until you save them. Only workspace owners can access this page.
                </p>
            </header>

            <section className="bg-surface border border-border-color rounded-xl shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-color px-6 py-3 text-xs text-text-secondary">
                    <span>Drag the table or use arrows to scroll horizontally.</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => scrollTableBy('left')}
                            disabled={!canScrollLeft}
                            aria-label="Scroll table left"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-color bg-background text-text-secondary transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <ArrowRightIcon className="h-4 w-4 rotate-180" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollTableBy('right')}
                            disabled={!canScrollRight}
                            aria-label="Scroll table right"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-color bg-background text-text-secondary transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <ArrowRightIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div
                    ref={tableScrollRef}
                    onPointerDown={handleTablePointerDown}
                    onPointerMove={handleTablePointerMove}
                    onPointerUp={endTableDrag}
                    onPointerLeave={endTableDrag}
                    onPointerCancel={endTableDrag}
                    className={`overflow-x-auto px-2 pb-3 ${isDraggingTable ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
                >
                    <table className="min-w-max w-full divide-y divide-border-color">
                        <thead className="bg-gray-800/60">
                            <tr>
                                <th className="sticky left-0 z-20 bg-[color:var(--color-background)] px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary min-w-[200px] shadow-[4px_0_10px_rgba(0,0,0,0.25)]">
                                    Priority / Department
                                </th>
                                {departments.map((department) => (
                                    <th
                                        key={department}
                                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary min-w-[140px]"
                                    >
                                        {department}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color">
                            {rowDescriptors.map((row) => {
                                const rowBgClass =
                                    row.tone === 'bonus'
                                        ? 'bg-emerald-500/5'
                                        : row.tone === 'penalty'
                                            ? 'bg-rose-500/5'
                                            : 'bg-surface';
                                const stickyToneClass =
                                    row.tone === 'bonus'
                                        ? 'border-l-4 border-emerald-400/60'
                                        : row.tone === 'penalty'
                                            ? 'border-l-4 border-rose-400/60'
                                            : 'border-l-4 border-transparent';
                                return (
                                <tr key={row.id} className={rowBgClass}>
                                    <th
                                        scope="row"
                                        className={`sticky left-0 z-10 bg-[color:var(--color-background)] px-6 py-4 text-sm font-semibold text-text-primary min-w-[200px] shadow-[4px_0_10px_rgba(0,0,0,0.2)] ${stickyToneClass}`}
                                    >
                                        {row.label}
                                    </th>
                                    {departments.map((department) => {
                                        const fallbackConfig = defaultConfig[department] ?? fallbackDepartmentConfig;
                                        const departmentConfig = config[department] ?? fallbackConfig;
                                        const priorityConfig = departmentConfig ? departmentConfig[row.priority] : undefined;
                                        const value = priorityConfig ? priorityConfig[row.field] : 0;

                                        return (
                                            <td key={`${department}-${row.id}`} className="px-6 py-3 min-w-[140px]">
                                                <input
                                                    type="number"
                                                    className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-center text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                                    value={value}
                                                    onChange={handleValueChange(department, row.priority, row.field)}
                                                    step={1}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-color px-6 py-4">
                    <div className="flex gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-dark disabled:opacity-60"
                        >
                            {isSaving ? 'Saving…' : 'Save Points'}
                        </button>
                        <button
                            onClick={handleReset}
                            className="rounded-lg border border-border-color px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary"
                        >
                            Reset to Defaults
                        </button>
                    </div>
                    <p className="text-xs text-text-secondary">
                        Tip: Penalties are stored as negative values. Positive numbers will be converted automatically.
                    </p>
                </div>
                {renderBanner(saveBanner)}
            </section>

            <section className="grid gap-4 rounded-xl border border-border-color bg-surface p-6 shadow-lg">
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-text-primary">Additional Points</h2>
                    <p className="text-sm text-text-secondary">
                        Configure bonus points awarded for creating tasks, clarity ratings, and manager penalties.
                    </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-text-primary">
                        Task creation points
                        <input
                            type="number"
                            min={0}
                            value={taskCreationPoints}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (Number.isNaN(nextValue)) {
                                    return;
                                }
                                setTaskCreationPoints(nextValue < 0 ? 0 : nextValue);
                            }}
                            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-text-primary">
                        Clarity rating points per star
                        <input
                            type="number"
                            min={0}
                            value={clarityPointsPerStar}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (Number.isNaN(nextValue)) {
                                    return;
                                }
                                setClarityPointsPerStar(nextValue < 0 ? 0 : nextValue);
                            }}
                            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-xs text-text-secondary">
                            5-star rating awards {clarityPointsPerStar * 5} points.
                        </p>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-text-primary">
                        Manager overdue penalty (same department)
                        <input
                            type="number"
                            value={managerOverduePenalty}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (Number.isNaN(nextValue)) {
                                    return;
                                }
                                setManagerOverduePenalty(nextValue > 0 ? -nextValue : nextValue);
                            }}
                            className="w-full rounded-lg border border-border-color bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-xs text-text-secondary">
                            Applies when a manager assigns a task to their own team and it is completed late or overdue.
                        </p>
                    </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-color pt-4">
                    <button
                        onClick={handleSaveAdditionalPoints}
                        disabled={isSaving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-dark disabled:opacity-60"
                    >
                        {isSaving ? 'Saving.' : 'Save Additional Points'}
                    </button>
                    <p className="text-xs text-text-secondary">
                        Tip: Penalties are stored as negative values. Positive numbers will be converted automatically.
                    </p>
                </div>
            </section>

            <section className="grid gap-4 rounded-xl border border-border-color bg-surface p-6 shadow-lg">
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-text-primary">AI Assisted Updates</h2>
                    <p className="text-sm text-text-secondary">
                        Ask the Zea AI assistant to update one or more point values. Describe the department, priority, and the numbers you
                        want. The AI will respond with structured data that is applied automatically when possible.
                    </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                    <textarea
                        ref={aiInputRef}
                        value={aiInstruction}
                        onChange={(event) => setAiInstruction(event.target.value)}
                        placeholder="e.g. Set Sales Team urgent base to 85 and early bonus to 30. If you say 'points', it maps to base."
                        className="min-h-[120px] w-full resize-y rounded-lg border border-border-color bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleAiAssist}
                            disabled={aiBusy}
                            className="h-11 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-semibold text-white shadow hover:from-purple-400 hover:to-pink-400 disabled:opacity-60"
                        >
                            {aiBusy ? 'Contacting AI…' : 'Ask AI to Apply'}
                        </button>
                        <div className="rounded-lg border border-dashed border-border-color p-3 text-xs text-text-secondary">
                            <p className="font-semibold text-text-primary">Sample prompts</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {samplePrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => handleSampleClick(prompt)}
                                        className="rounded-full border border-border-color px-3 py-1 text-xs text-text-secondary hover:border-primary hover:text-primary"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                {aiRawReply && (
                    <div className="rounded-lg border border-border-color bg-background px-4 py-3 text-xs text-text-secondary">
                        <p className="mb-1 font-semibold text-text-primary">Last AI response</p>
                        <pre className="whitespace-pre-wrap break-words">{aiRawReply}</pre>
                    </div>
                )}
                {renderBanner(aiBanner)}
            </section>
        </div>
    );
};

export default PointsTableSettings;
