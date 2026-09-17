# Task Pages - Implementation Details & Code Examples

**Actual code patterns, API responses, and component implementations**

---

## Part 1: Tasks Page (Tasks.tsx) - Implementation

### 1.1 Core Component Structure

```typescript
// Tasks.tsx - Main Component
export default function Tasks() {
    // State variables
    const [tasks, setTasks] = useState<Task[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    
    // Pagination
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
    const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([]);
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
    const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
    
    // Sort
    const [sortField, setSortField] = useState<'title' | 'priority' | 'status' | 'dueDate'>('title');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    
    // Hooks
    const { currentUser, hasPermission } = useAuth();
    const { theme } = useTheme();
    const { debouncedValue: debouncedSearch } = useSearch(searchQuery, 300);
    
    // Update debounced search
    useEffect(() => {
        setDebouncedSearchQuery(debouncedSearch);
    }, [debouncedSearch]);
    
    // Fetch tasks on mount and when filters change
    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/tasks/page', {
                    params: {
                        page: pageNumber,
                        pageSize,
                        search: debouncedSearchQuery,
                        statuses: selectedStatuses.join(','),
                        priorities: selectedPriorities.join(','),
                        assignees: selectedAssignees.join(','),
                        teams: selectedTeams.join(','),
                        sort: sortField,
                        direction: sortDirection
                    }
                });
                
                const data = response.data;
                setTasks(data.items.map(mapTask));
                setTotalCount(data.total);
                setAllTasks(data.items);
            } catch (error) {
                console.error('Failed to fetch tasks:', error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchTasks();
    }, [pageNumber, pageSize, debouncedSearchQuery, selectedStatuses, selectedPriorities, 
        selectedAssignees, selectedTeams, sortField, sortDirection]);
    
    // WebSocket real-time updates
    useEffect(() => {
        const handleTaskUpdate = () => {
            // Refetch tasks
        };
        
        eventBus.on('task:update', handleTaskUpdate);
        return () => eventBus.off('task:update', handleTaskUpdate);
    }, []);
    
    // Calculate pages
    const totalPages = Math.ceil(totalCount / pageSize);
    
    return (
        <div className="p-4 space-y-4">
            {/* Toolbar */}
            <TasksToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedStatuses={selectedStatuses}
                onStatusChange={setSelectedStatuses}
                selectedPriorities={selectedPriorities}
                onPriorityChange={setSelectedPriorities}
                sortField={sortField}
                onSortChange={setSortField}
            />
            
            {/* Loading */}
            {loading && <LoadingSpinner />}
            
            {/* Table */}
            {!loading && (
                <>
                    <TaskTable
                        tasks={tasks}
                        selectedTasks={selectedTasks}
                        onSelectTask={(id) => {
                            const updated = new Set(selectedTasks);
                            updated.has(id) ? updated.delete(id) : updated.add(id);
                            setSelectedTasks(updated);
                        }}
                        onTaskClick={setSelectedTaskId}
                        onSort={(field) => {
                            if (sortField === field) {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                                setSortField(field);
                                setSortDirection('asc');
                            }
                        }}
                    />
                    
                    {/* Pagination */}
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                            Showing {(pageNumber - 1) * pageSize + 1} to{' '}
                            {Math.min(pageNumber * pageSize, totalCount)} of {totalCount}
                        </span>
                        <Pagination
                            current={pageNumber}
                            total={totalPages}
                            onChange={setPageNumber}
                        />
                    </div>
                </>
            )}
            
            {/* Modals */}
            {selectedTaskId && (
                <TaskDetailModal
                    taskId={selectedTaskId}
                    onClose={() => setSelectedTaskId(null)}
                />
            )}
        </div>
    );
}
```

### 1.2 Task Row Component

```typescript
interface TaskRowProps {
    task: Task;
    selected: boolean;
    onSelect: () => void;
    onClick: () => void;
}

function TaskRow({ task, selected, onSelect, onClick }: TaskRowProps) {
    const { theme } = useTheme();
    const statusTheme = taskStatusThemes[theme][task.status];
    const priorityBg = priorityColors[task.priority];
    
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800 border-b">
            {/* Checkbox */}
            <td className="px-4 py-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onSelect}
                    className="w-4 h-4"
                />
            </td>
            
            {/* Title */}
            <td className="px-4 py-3">
                <button
                    onClick={onClick}
                    className="text-blue-600 hover:underline font-medium"
                >
                    {task.title}
                </button>
            </td>
            
            {/* Priority Badge */}
            <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded text-xs font-bold ${priorityBg}`}>
                    {task.priority}
                </span>
            </td>
            
            {/* Status Badge */}
            <td className="px-4 py-3">
                <div
                    className="px-3 py-1 rounded-full text-xs font-bold inline-block"
                    style={{
                        background: statusTheme.gradient,
                        color: statusTheme.textColor,
                        border: `1px solid ${statusTheme.borderColor}`
                    }}
                >
                    {statusTheme.label}
                </div>
            </td>
            
            {/* Assignee */}
            <td className="px-4 py-3">
                {task.assignedTo ? (
                    <AvatarWithName userId={task.assignedTo} />
                ) : (
                    <span className="text-gray-400">Unassigned</span>
                )}
            </td>
            
            {/* Due Date */}
            <td className="px-4 py-3">
                {task.dueAt && (
                    <span className={isOverdue(task) ? 'text-red-600 font-bold' : ''}>
                        {formatDate(task.dueAt)}
                    </span>
                )}
            </td>
            
            {/* Points */}
            <td className="px-4 py-3">
                <span className="text-yellow-600 font-bold">
                    {task.points || 0} pts
                </span>
            </td>
            
            {/* Team */}
            <td className="px-4 py-3">
                <TeamBadge teamId={task.teamId} />
            </td>
            
            {/* Actions */}
            <td className="px-4 py-3">
                <button onClick={onClick} className="text-gray-500 hover:text-gray-700">
                    ⋯
                </button>
            </td>
        </tr>
    );
}
```

### 1.3 API Response Example

```typescript
// GET /api/tasks/page?page=1&pageSize=10&search=&statuses=TODO,IN_PROGRESS

interface PaginatedTasksResponse {
    items: Task[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// Example response:
{
    "items": [
        {
            "id": "task-123",
            "title": "Implement User Authentication",
            "description": "Add OAuth2 support to the platform",
            "status": "IN_PROGRESS",
            "priority": "HIGH",
            "assignedTo": "user-456",
            "createdBy": "user-789",
            "createdAt": "2025-02-10T10:30:00Z",
            "dueAt": "2025-02-20T17:00:00Z",
            "startedAt": "2025-02-15T09:00:00Z",
            "completedAt": null,
            "points": 150,
            "teamId": "team-101",
            "tags": ["security", "auth", "backend"],
            "recurrenceRule": "NONE",
            "parentTaskId": null,
            "subtasks": [
                {
                    "id": "subtask-1",
                    "title": "Create OAuth endpoints",
                    "completed": true,
                    "order": 1
                },
                {
                    "id": "subtask-2",
                    "title": "Add token refresh logic",
                    "completed": false,
                    "order": 2
                }
            ],
            "xpValue": 250
        },
        {
            "id": "task-124",
            "title": "Fix login button styling",
            "description": "Button not responsive on mobile",
            "status": "TODO",
            "priority": "MEDIUM",
            "assignedTo": null,
            "createdBy": "user-123",
            "createdAt": "2025-02-18T14:20:00Z",
            "dueAt": "2025-02-25T17:00:00Z",
            "startedAt": null,
            "completedAt": null,
            "points": 80,
            "teamId": "team-102",
            "tags": ["ui", "frontend", "bug"],
            "recurrenceRule": "NONE",
            "parentTaskId": "task-123",
            "subtasks": [],
            "xpValue": 150
        }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
}
```

### 1.4 Task Status Themes

```typescript
// taskStatusThemes.ts
const taskStatusThemes = {
    light: {
        'WAITING_FOR_REQUIREMENT': {
            label: 'Battle Plan',
            legend: 'New/Ready',
            gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            textColor: '#fff',
            borderColor: '#667eea',
            icon: '⚔️'
        },
        'TODO': {
            label: 'Queue',
            legend: 'In Queue',
            gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            textColor: '#fff',
            borderColor: '#f5576c',
            icon: '📋'
        },
        'IN_PROGRESS': {
            label: 'Battle',
            legend: 'Attacking',
            gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            textColor: '#fff',
            borderColor: '#00f2fe',
            icon: '⚡'
        },
        'IN_REVIEW': {
            label: 'War Room',
            legend: 'Being Discussed',
            gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            textColor: '#333',
            borderColor: '#fa709a',
            icon: '🔍'
        },
        'DONE': {
            label: 'Victory',
            legend: 'Won Battle',
            gradient: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
            textColor: '#fff',
            borderColor: '#30cfd0',
            icon: '✅'
        },
        'FAILED': {
            label: 'Defeat',
            legend: 'Lost Battle',
            gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            textColor: '#333',
            borderColor: '#ff6b6b',
            icon: '❌'
        }
    },
    dark: {
        // Similar structure with adjusted colors
    }
};
```

---

## Part 2: KanbanBoard.tsx - Implementation

### 2.1 Core Component Structure

```typescript
// KanbanBoard.tsx - Main Component
export default function KanbanBoard() {
    const [columns, setColumns] = useState<KanbanColumn[]>([]);
    const [loading, setLoading] = useState(true);
    const [dragState, setDragState] = useState<DragState>({
        taskId: null,
        sourceColumn: null
    });
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [filters, setFilters] = useState<KanbanFilters>({});
    
    const { theme } = useTheme();
    const { currentUser } = useAuth();
    
    // Fetch kanban data
    useEffect(() => {
        const fetchKanban = async () => {
            try {
                const response = await fetch('/api/tasks/kanban', {
                    params: { filters }
                });
                
                const data: TaskKanbanResponse = response.data;
                setColumns(data.columns);
            } catch (error) {
                console.error('Failed to fetch kanban:', error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchKanban();
    }, [filters]);
    
    // Drag handlers
    const handleDragStart = (e: React.DragEvent, taskId: string, columnId: string) => {
        setDragState({ taskId, sourceColumn: columnId });
        e.dataTransfer.effectAllowed = 'move';
        const dragImg = new Image();
        dragImg.src = 'data:image/gif;base64,R0lGOD...';
        e.dataTransfer.setDragImage(dragImg, 0, 0);
    };
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    
    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        
        if (!dragState.taskId || !dragState.sourceColumn) return;
        
        // If same column, don't update
        if (dragState.sourceColumn === targetColumnId) {
            setDragState({ taskId: null, sourceColumn: null });
            return;
        }
        
        try {
            // Update task status
            await fetch(`/api/tasks/${dragState.taskId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: targetColumnId
                })
            });
            
            // Refresh board
            const response = await fetch('/api/tasks/kanban', { params: { filters } });
            const data: TaskKanbanResponse = response.data;
            setColumns(data.columns);
        } catch (error) {
            console.error('Failed to update task:', error);
            toast.error('Failed to move task');
        } finally {
            setDragState({ taskId: null, sourceColumn: null });
        }
    };
    
    if (loading) return <LoadingSpinner />;
    
    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Kanban Board</h1>
                <button
                    onClick={() => setIsColumnModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                >
                    + New Column
                </button>
            </div>
            
            {/* Board */}
            <div className="flex gap-4 overflow-x-auto pb-4">
                {columns.map((column) => (
                    <KanbanColumnComponent
                        key={column.status}
                        column={column}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onTaskClick={setSelectedTaskId}
                    />
                ))}
            </div>
            
            {/* Modals */}
            {selectedTaskId && (
                <TaskDetailModal
                    taskId={selectedTaskId}
                    onClose={() => setSelectedTaskId(null)}
                />
            )}
        </div>
    );
}
```

### 2.2 Kanban Column Component

```typescript
interface KanbanColumnProps {
    column: KanbanColumn;
    onDragStart: (e: React.DragEvent, taskId: string, columnId: string) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, columnId: string) => void;
    onTaskClick: (taskId: string) => void;
}

function KanbanColumnComponent({
    column,
    onDragStart,
    onDragOver,
    onDrop,
    onTaskClick
}: KanbanColumnProps) {
    const statusDetail = statusDetails[column.status];
    
    return (
        <div
            className="w-80 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden flex flex-col"
            style={{
                borderTop: `4px solid ${statusDetail.accent}`
            }}
        >
            {/* Column Header */}
            <div className="p-4 bg-gradient-to-r" style={{
                backgroundImage: statusDetail.gradient
            }}>
                <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{statusDetail.icon}</span>
                        <div>
                            <h3 className="font-bold text-lg">{statusDetail.label}</h3>
                            <p className="text-xs opacity-80">{statusDetail.legend}</p>
                        </div>
                    </div>
                    <span className="bg-white bg-opacity-20 px-2 py-1 rounded text-sm font-bold">
                        {column.count}
                    </span>
                </div>
            </div>
            
            {/* Tasks Container */}
            <div
                className="flex-1 p-3 overflow-y-auto space-y-2"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, column.status)}
            >
                {column.items.map((task) => (
                    <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id, column.status)}
                        onClick={() => onTaskClick(task.id)}
                        className="bg-white dark:bg-gray-800 p-3 rounded border-l-4 cursor-move hover:shadow-md transition-shadow"
                        style={{ borderLeftColor: statusDetail.accent }}
                    >
                        {/* Priority Badge */}
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold px-2 py-1 rounded"
                                style={{
                                    background: priorityColors[task.priority].bg,
                                    color: priorityColors[task.priority].text
                                }}
                            >
                                {task.priority}
                            </span>
                            {task.points && (
                                <span className="text-xs font-bold text-yellow-600">
                                    {task.points} pts
                                </span>
                            )}
                        </div>
                        
                        {/* Title */}
                        <h4 className="font-bold text-sm mb-2 line-clamp-2">
                            {task.title}
                        </h4>
                        
                        {/* Description */}
                        {task.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                {task.description}
                            </p>
                        )}
                        
                        {/* Footer */}
                        <div className="flex items-center justify-between text-xs">
                            {task.assignedTo && (
                                <AvatarWithName userId={task.assignedTo} size="sm" />
                            )}
                            {task.dueAt && (
                                <span className={isOverdue(task) ? 'text-red-600 font-bold' : 'text-gray-500'}>
                                    {formatDate(task.dueAt, 'short')}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Add Task Button */}
            <button
                className="p-3 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 text-center"
            >
                + Add task
            </button>
        </div>
    );
}
```

### 2.3 API Response Example

```typescript
// GET /api/tasks/kanban

interface TaskKanbanResponse {
    columns: KanbanColumn[];
}

interface KanbanColumn {
    status: TaskStatus;
    title: string;
    order: number;
    count: number;
    items: Task[];
}

// Example response:
{
    "columns": [
        {
            "status": "WAITING_FOR_REQUIREMENT",
            "title": "Battle Plan",
            "order": 1,
            "count": 5,
            "items": [
                {
                    "id": "task-201",
                    "title": "Design system specifications",
                    "description": "Create comprehensive design guidelines",
                    "priority": "HIGH",
                    "points": 200,
                    "assignedTo": "user-456",
                    "dueAt": "2025-02-28T17:00:00Z",
                    "tags": ["design", "documentation"]
                }
            ]
        },
        {
            "status": "TODO",
            "title": "Queue",
            "order": 2,
            "count": 8,
            "items": [
                {
                    "id": "task-202",
                    "title": "Implement text input component",
                    "description": null,
                    "priority": "MEDIUM",
                    "points": 100,
                    "assignedTo": null,
                    "dueAt": "2025-03-05T17:00:00Z",
                    "tags": ["component", "ui"]
                }
            ]
        },
        {
            "status": "IN_PROGRESS",
            "title": "Battle",
            "order": 3,
            "count": 12,
            "items": [
                {
                    "id": "task-203",
                    "title": "Refactor task service",
                    "description": "Improve performance and cache strategy",
                    "priority": "MEDIUM",
                    "points": 150,
                    "assignedTo": "user-789",
                    "dueAt": "2025-02-22T17:00:00Z",
                    "tags": ["refactor", "backend"]
                }
            ]
        },
        {
            "status": "DONE",
            "title": "Victories",
            "order": 4,
            "count": 18,
            "items": []
        }
    ]
}
```

---

## Part 3: CalendarView.tsx - Implementation

### 3.1 Core Component Structure

```typescript
// CalendarView.tsx - Main Component
export default function CalendarView() {
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState<Map<string, CalendarNote>>(new Map());
    const [reminders, setReminders] = useState<Map<string, CalendarReminder>>(new Map());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    
    const { theme } = useTheme();
    const { currentUser } = useAuth();
    
    // Calculate date range based on view mode
    const dateRange = useMemo(() => {
        if (viewMode === 'day') {
            return [new Date(referenceDate.setHours(0, 0, 0, 0))];
        } else if (viewMode === 'week') {
            const start = startOfWeek(referenceDate);
            const range: Date[] = [];
            for (let i = 0; i < 7; i++) {
                range.push(new Date(start));
                start.setDate(start.getDate() + 1);
            }
            return range;
        } else { // month
            const start = startOfMonth(referenceDate);
            const dayOfWeek = start.getDay();
            const prefixStart = new Date(start);
            prefixStart.setDate(prefixStart.getDate() - dayOfWeek);
            
            const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
            const dayOfWeekEnd = end.getDay();
            const suffixEnd = new Date(end);
            suffixEnd.setDate(suffixEnd.getDate() + (6 - dayOfWeekEnd));
            
            const range: Date[] = [];
            const iterator = new Date(prefixStart);
            while (iterator <= suffixEnd) {
                range.push(new Date(iterator));
                iterator.setDate(iterator.getDate() + 1);
            }
            return range;
        }
    }, [viewMode, referenceDate]);
    
    // Fetch tasks
    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const response = await fetch('/api/tasks');
                const data = response.data;
                setTasks(data.map(mapTask));
            } catch (error) {
                console.error('Failed to fetch tasks:', error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchTasks();
    }, []);
    
    // Group tasks by date
    const tasksByDate = useMemo(() => {
        const grouped = new Map<string, Task[]>();
        
        tasks.forEach(task => {
            if (!task.dueAt) return;
            
            const dueDate = new Date(task.dueAt);
            const dateKey = getDateKey(dueDate);
            
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, []);
            }
            
            // Handle recurring tasks
            if (task.recurrenceRule !== 'NONE' && task.recurrenceRule) {
                const occurrences = calculateOccurrences(
                    task.recurrenceRule,
                    dueDate,
                    dateRange[dateRange.length - 1]
                );
                
                occurrences.forEach(occurrence => {
                    const occDate = new Date(occurrence);
                    if (dateRange.some(d => isSameDay(d, occDate))) {
                        const occKey = getDateKey(occDate);
                        if (!grouped.has(occKey)) {
                            grouped.set(occKey, []);
                        }
                        grouped.get(occKey)!.push({
                            ...task,
                            id: `${task.id}-${occDate.toISOString()}`,
                            dueAt: occDate.toISOString()
                        });
                    }
                });
            } else {
                grouped.get(dateKey)!.push(task);
            }
        });
        
        return grouped;
    }, [tasks, dateRange]);
    
    const handleAddNote = async (date: Date, content: string) => {
        const note: CalendarNote = {
            id: generateId(),
            content,
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.id || null
        };
        
        const dateKey = getDateKey(date);
        const updatedNotes = new Map(notes);
        updatedNotes.set(dateKey, note);
        setNotes(updatedNotes);
    };
    
    const handleAddReminder = async (date: Date, message: string) => {
        const reminder: CalendarReminder = {
            id: generateId(),
            message,
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.id || null
        };
        
        const dateKey = getDateKey(date);
        const updatedReminders = new Map(reminders);
        updatedReminders.set(dateKey, reminder);
        setReminders(updatedReminders);
        
        // Schedule notification
        scheduleNotification(date, message);
    };
    
    if (loading) return <LoadingSpinner />;
    
    return (
        <div className="p-4 space-y-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <button onClick={() => setViewMode('month')} 
                        className={`px-4 py-2 rounded ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                        Month
                    </button>
                    <button onClick={() => setViewMode('week')} 
                        className={`px-4 py-2 rounded ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                        Week
                    </button>
                    <button onClick={() => setViewMode('day')} 
                        className={`px-4 py-2 rounded ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                        Day
                    </button>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={() => {
                        const prev = new Date(referenceDate);
                        prev.setMonth(prev.getMonth() - 1);
                        setReferenceDate(prev);
                    }}>
                        ← Previous
                    </button>
                    <span className="text-lg font-bold">
                        {formatDate(referenceDate, 'MMMM YYYY')}
                    </span>
                    <button onClick={() => {
                        const next = new Date(referenceDate);
                        next.setMonth(next.getMonth() + 1);
                        setReferenceDate(next);
                    }}>
                        Next →
                    </button>
                </div>
            </div>
            
            {/* Calendar View */}
            {viewMode === 'month' && (
                <MonthCalendarView
                    dateRange={dateRange}
                    tasksByDate={tasksByDate}
                    notes={notes}
                    reminders={reminders}
                    onSelectDate={setSelectedDate}
                    onAddNote={handleAddNote}
                    onAddReminder={handleAddReminder}
                />
            )}
            
            {viewMode === 'week' && (
                <WeekCalendarView
                    dateRange={dateRange}
                    tasksByDate={tasksByDate}
                    notes={notes}
                    reminders={reminders}
                    onSelectDate={setSelectedDate}
                />
            )}
            
            {viewMode === 'day' && (
                <DayCalendarView
                    date={referenceDate}
                    tasks={tasksByDate.get(getDateKey(referenceDate)) || []}
                    notes={notes.get(getDateKey(referenceDate))}
                    reminders={reminders.get(getDateKey(referenceDate))}
                />
            )}
        </div>
    );
}

// Helper functions
function getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

function calculateOccurrences(rule: string, startDate: Date, endDate: Date): Date[] {
    const occurrences: Date[] = [];
    const current = new Date(startDate);
    
    const parts = rule.split(';');
    const freq = parts[0].split('=')[1]; // DAILY, WEEKLY, MONTHLY, YEARLY
    
    while (current <= endDate) {
        occurrences.push(new Date(current));
        
        if (freq === 'DAILY') {
            current.setDate(current.getDate() + 1);
        } else if (freq === 'WEEKLY') {
            current.setDate(current.getDate() + 7);
        } else if (freq === 'MONTHLY') {
            current.setMonth(current.getMonth() + 1);
        } else if (freq === 'YEARLY') {
            current.setFullYear(current.getFullYear() + 1);
        }
    }
    
    return occurrences;
}
```

### 3.2 Month Calendar View Component

```typescript
interface MonthCalendarViewProps {
    dateRange: Date[];
    tasksByDate: Map<string, Task[]>;
    notes: Map<string, CalendarNote>;
    reminders: Map<string, CalendarReminder>;
    onSelectDate: (date: Date) => void;
    onAddNote: (date: Date, content: string) => void;
    onAddReminder: (date: Date, message: string) => void;
}

function MonthCalendarView({
    dateRange,
    tasksByDate,
    notes,
    reminders,
    onSelectDate,
    onAddNote,
    onAddReminder
}: MonthCalendarViewProps) {
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
        <div className="grid grid-cols-7 gap-1">
            {/* Header */}
            {weekDays.map(day => (
                <div key={day} className="text-center font-bold p-2 text-gray-600">
                    {day}
                </div>
            ))}
            
            {/* Cells */}
            {dateRange.map(date => {
                const dateKey = getDateKey(date);
                const tasksOnDate = tasksByDate.get(dateKey) || [];
                const note = notes.get(dateKey);
                const reminder = reminders.get(dateKey);
                
                return (
                    <div
                        key={dateKey}
                        className="min-h-24 border rounded p-1 cursor-pointer hover:bg-blue-100"
                        onClick={() => onSelectDate(date)}
                    >
                        {/* Date number */}
                        <div className="text-sm font-bold mb-1">
                            {date.getDate()}
                        </div>
                        
                        {/* Tasks */}
                        <div className="space-y-0.5 text-xs">
                            {tasksOnDate.slice(0, 2).map(task => (
                                <div
                                    key={task.id}
                                    className="bg-blue-200 text-blue-900 px-1 py-0.5 rounded truncate"
                                >
                                    {task.title}
                                </div>
                            ))}
                            {tasksOnDate.length > 2 && (
                                <div className="text-gray-500">
                                    +{tasksOnDate.length - 2} more
                                </div>
                            )}
                        </div>
                        
                        {/* Note/Reminder indicators */}
                        <div className="flex gap-0.5 mt-1">
                            {note && <span className="text-lg">📝</span>}
                            {reminder && <span className="text-lg">🔔</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
```

---

## Part 4: GanttView.tsx - Implementation

### 4.1 Core Component Structure

```typescript
// GanttView.tsx - Main Component
export default function GanttView() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [rangeFilter, setRangeFilter] = useState<'30' | '60' | '90' | 'ALL'>('90');
    const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
    const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    const { theme } = useTheme();
    const { currentUser } = useAuth();
    
    // Fetch tasks
    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const daysBack = rangeFilter === 'ALL' ? 999999 : parseInt(rangeFilter);
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysBack);
                
                const response = await fetch('/api/tasks', {
                    params: {
                        startDate: startDate.toISOString(),
                        status: statusFilter !== 'ALL' ? statusFilter : undefined
                    }
                });
                
                let data = response.data;
                
                // Filter by assignee
                if (assigneeFilter.length > 0) {
                    data = data.filter(t => assigneeFilter.includes(t.assignedTo));
                }
                
                // Filter by search
                if (searchQuery) {
                    data = data.filter(t =>
                        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                }
                
                setTasks(data);
            } catch (error) {
                console.error('Failed to fetch tasks:', error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchTasks();
    }, [rangeFilter, statusFilter, assigneeFilter, searchQuery]);
    
    // Calculate timeline
    const timelineStart = useMemo(() => {
        const now = new Date();
        const daysBack = rangeFilter === 'ALL' ? 365 : parseInt(rangeFilter);
        now.setDate(now.getDate() - daysBack);
        return now;
    }, [rangeFilter]);
    
    const timelineEnd = useMemo(() => {
        const end = new Date();
        end.setMonth(end.getMonth() + 3);
        return end;
    }, []);
    
    // Calculate statistics
    const stats = useMemo(() => {
        const total = tasks.length;
        const active = tasks.filter(t => 
            ['TODO', 'IN_PROGRESS', 'IN_REVIEW'].includes(t.status)
        ).length;
        const completed = tasks.filter(t => t.status === 'DONE').length;
        const failed = tasks.filter(t => t.status === 'FAILED').length;
        
        return {
            totalTasks: total,
            activeTasks: active,
            completedTasks: completed,
            failedTasks: failed,
            completionRate: total > 0 ? (completed / total) * 100 : 0,
            onTimeRate: completed > 0 
                ? (tasks.filter(t => t.status === 'DONE' && !isOverdue(t)).length / completed) * 100
                : 0
        };
    }, [tasks]);
    
    if (loading) return <LoadingSpinner />;
    
    return (
        <div className="p-4 space-y-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard
                    label="Total Tasks"
                    value={stats.totalTasks}
                    icon="📊"
                    color="blue"
                />
                <StatCard
                    label="Active"
                    value={stats.activeTasks}
                    icon="⚡"
                    color="yellow"
                />
                <StatCard
                    label="Completion"
                    value={`${stats.completionRate.toFixed(0)}%`}
                    icon="✅"
                    color="green"
                />
                <StatCard
                    label="On-Time"
                    value={`${stats.onTimeRate.toFixed(0)}%`}
                    icon="🎯"
                    color="purple"
                />
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 flex-wrap items-center">
                <div className="flex gap-2">
                    {['30', '60', '90', 'ALL'].map(range => (
                        <button
                            key={range}
                            onClick={() => setRangeFilter(range as any)}
                            className={`px-3 py-1 rounded font-bold text-sm transition ${
                                rangeFilter === range
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700'
                            }`}
                        >
                            {range}d
                        </button>
                    ))}
                </div>
                
                {/* Status Filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-3 py-1 rounded border"
                >
                    <option value="ALL">All Status</option>
                    <option value="TODO">Todo</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                </select>
                
                {/* Search */}
                <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1 rounded border flex-1"
                />
            </div>
            
            {/* Gantt Chart */}
            <GanttChart
                tasks={tasks}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
            />
        </div>
    );
}
```

### 4.2 Gantt Chart Component

```typescript
interface GanttChartProps {
    tasks: Task[];
    timelineStart: Date;
    timelineEnd: Date;
}

function GanttChart({ tasks, timelineStart, timelineEnd }: GanttChartProps) {
    const monthDays = generateMonthLabels(timelineStart, timelineEnd);
    const totalDays = Math.ceil(
        (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    return (
        <div className="overflow-x-auto border rounded-lg shadow-lg">
            {/* Header with months */}
            <div className="flex sticky top-0 z-10 bg-white dark:bg-gray-800 border-b">
                <div className="w-48 flex-shrink-0 border-r p-2 font-bold">Task</div>
                <div className="flex">
                    {monthDays.map((month, idx) => (
                        <div
                            key={idx}
                            className="border-r p-2 text-center font-bold text-sm"
                            style={{ width: `${(month.days / totalDays) * 100}%` }}
                        >
                            {month.label}
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Task bars */}
            {tasks.map((task) => {
                const position = calculateTaskBarPosition(task, timelineStart, timelineEnd);
                
                return (
                    <div key={task.id} className="flex border-b hover:bg-blue-50">
                        {/* Task name */}
                        <div className="w-48 flex-shrink-0 border-r p-2 text-sm truncate">
                            <div className="font-bold">{task.title}</div>
                            <div className="text-xs text-gray-500">
                                {task.assignedTo && <AvatarWithName userId={task.assignedTo} />}
                            </div>
                        </div>
                        
                        {/* Timeline */}
                        <div className="flex-1 relative" style={{ height: '60px' }}>
                            {/* Background grid */}
                            <div className="flex h-full">
                                {monthDays.map((month, idx) => (
                                    <div
                                        key={idx}
                                        className="border-r bg-gray-50 dark:bg-gray-900"
                                        style={{
                                            width: `${(month.days / totalDays) * 100}%`
                                        }}
                                    />
                                ))}
                            </div>
                            
                            {/* Task bar */}
                            <div
                                className="absolute top-2 h-12 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow flex items-center px-2 text-white text-xs font-bold overflow-hidden"
                                style={{
                                    left: `${position.left}%`,
                                    width: `${position.width}%`,
                                    background: taskStatusThemes.gantt[task.status].gradient
                                }}
                            >
                                {/* Progress bar */}
                                <div
                                    className="absolute top-0 left-0 h-full rounded-lg opacity-50"
                                    style={{
                                        width: `${position.progress}%`,
                                        background: 'rgba(255,255,255,0.5)'
                                    }}
                                />
                                
                                {/* Label */}
                                <span className="relative z-10 truncate">
                                    {task.title}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Helper function
function calculateTaskBarPosition(
    task: Task,
    timelineStart: Date,
    timelineEnd: Date
): { left: number; width: number; progress: number } {
    const start = new Date(task.createdAt);
    const end = task.dueAt ? new Date(task.dueAt) : new Date();
    
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    const startMs = start.getTime() - timelineStart.getTime();
    const durationMs = end.getTime() - start.getTime();
    
    let progress = 0;
    if (task.status === 'DONE') progress = 100;
    else if (task.status === 'IN_PROGRESS') progress = 50;
    else progress = 0;
    
    return {
        left: Math.max(0, (startMs / totalMs) * 100),
        width: Math.max(2, (durationMs / totalMs) * 100),
        progress
    };
}
```

---

## Part 5: Shared Utilities & Type Definitions

### 5.1 Type Definitions

```typescript
// types.ts
export type TaskStatus =
    | 'WAITING_FOR_REQUIREMENT'
    | 'TODO'
    | 'IN_PROGRESS'
    | 'IN_REVIEW'
    | 'DONE'
    | 'FAILED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignedTo?: string;
    createdBy: string;
    createdAt: string;
    dueAt?: string;
    startedAt?: string;
    completedAt?: string;
    points: number;
    teamId: string;
    tags: string[];
    recurrenceRule: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    parentTaskId?: string;
    subtasks: Subtask[];
    xpValue: number;
}

export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
    order: number;
}

export interface DragState {
    taskId: string | null;
    sourceColumn: string | null;
}

export interface KanbanColumn {
    status: TaskStatus;
    title: string;
    order: number;
    count: number;
    items: Task[];
}

export interface CalendarNote {
    id: string;
    content: string;
    createdAt: string;
    createdBy?: string;
}

export interface CalendarReminder {
    id: string;
    message: string;
    createdAt: string;
    createdBy?: string;
}
```

### 5.2 Helper Utilities

```typescript
// utils.ts
export function mapTask(apiTask: any): Task {
    return {
        id: apiTask.id,
        title: apiTask.title,
        description: apiTask.description,
        status: apiTask.status,
        priority: apiTask.priority,
        assignedTo: apiTask.assignedTo,
        createdBy: apiTask.createdBy,
        createdAt: apiTask.createdAt,
        dueAt: apiTask.dueAt,
        points: apiTask.points || 0,
        teamId: apiTask.teamId,
        tags: apiTask.tags || [],
        recurrenceRule: apiTask.recurrenceRule || 'NONE',
        parentTaskId: apiTask.parentTaskId,
        subtasks: apiTask.subtasks || [],
        xpValue: calculateXP(apiTask)
    };
}

export function calculateXP(task: Task): number {
    let baseXP = 50;
    
    // Adjust based on priority
    if (task.priority === 'URGENT') baseXP = 200;
    else if (task.priority === 'HIGH') baseXP = 150;
    else if (task.priority === 'MEDIUM') baseXP = 100;
    
    // Adjust based on points
    baseXP += task.points * 2;
    
    return baseXP;
}

export function isOverdue(task: Task): boolean {
    if (!task.dueAt || task.status === 'DONE') return false;
    return new Date(task.dueAt) < new Date();
}

export function formatDate(date: string | Date, format: string = 'MMM dd, yyyy'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Implementation using date-fns or similar
    return d.toLocaleDateString();
}
```

---

**End of Implementation Details Report**

---

## Quick Reference: API Endpoints

```
BASE: /api

Tasks CRUD:
  GET    /tasks              - List all
  GET    /tasks/page         - Paginated list
  GET    /tasks/kanban       - Kanban response
  GET    /tasks/{id}         - Single task
  POST   /tasks              - Create
  PATCH  /tasks/{id}         - Update
  DELETE /tasks/{id}         - Delete

Kanban:
  GET    /kanban-columns     - List columns
  POST   /kanban-columns     - Create column
  PATCH  /kanban-columns/{id} - Update column
  DELETE /kanban-columns/{id} - Delete column

Support:
  GET    /users              - User list
  GET    /user-progress      - XP/stats
  GET    /teams              - Team list
```

---

**Total Implementation Guide Completed**
