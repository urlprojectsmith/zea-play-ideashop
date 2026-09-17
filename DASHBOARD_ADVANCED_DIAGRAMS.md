# Dashboard - Advanced Architecture Diagrams & Deep Dive

**Supplementary Report with Extended Mermaid Visualizations**

---

## 1. Complete System Architecture

```mermaid
graph TB
    subgraph UserLayer["🎯 User Layer"]
        User["Web Browser<br/>User Session"]
    end
    
    subgraph FrontendLayer["React Frontend Layer"]
        AppRouter["App.tsx (Router)<br/>- Route: /dashboard<br/>- Protected Route"]
        Dashboard["Dashboard.tsx<br/>Main Component"]
        AuthProvider["AuthProvider<br/>JWT Token Management"]
        SearchProvider["SearchProvider<br/>Query Debounce"]
        ThemeProvider["ThemeProvider<br/>Theme State"]
        
        Components["UI Components<br/>- TaskDetailModal<br/>- TaskStatusBadge<br/>- TaskPriorityBadge<br/>- Sidebar<br/>- Layout"]
        
        Hooks["Custom Hooks<br/>- useAuth<br/>- useSearch<br/>- useTheme<br/>- useTaskCache"]
        
        Services["Service Layer<br/>mockApi.ts<br/>- HTTP Client<br/>- Data Mapping<br/>- Cache Management"]
    end
    
    subgraph StorageLayer["Browser Storage"]
        LocalStorage["LocalStorage<br/>- JWT Token<br/>- Theme Preference<br/>- Points Config<br/>- Levels Config"]
        SessionStorage["Session Cache<br/>- Tasks Data<br/>- Users Map<br/>- Computed Values"]
    end
    
    subgraph NetworkLayer["Network & Cache"]
        HTTPClient["Axios HTTP Client<br/>- Base URL: API<br/>- Interceptors"]
        ClientCache["In-Memory Cache<br/>- buildCacheKey()<br/>- getCached()<br/>- setCached()"]
        ServerCache["Server Cache<br/>(Redis)<br/>- tasks:list:<br/>- users:<br/>- TTL: 5-15min"]
    end
    
    subgraph BackendLayer["FastAPI Backend"]
        Router["API Router (FastAPI)<br/>- /tasks<br/>- /users<br/>- /user-progress<br/>- /achievements"]
        
        Middleware["Middleware Pipeline<br/>- Authentication<br/>- Authorization<br/>- Rate Limiting<br/>- Logging<br/>- Error Handling"]
        
        Services["Business Logic<br/>- Task Service<br/>- Gamification Service<br/>- Achievement Service<br/>- Points Calculator"]
        
        DataAccess["Data Access Layer<br/>- Task Repository<br/>- User Repository<br/>- Progress Repository"]
    end
    
    subgraph DatabaseLayer["Database Layer"]
        PostgreSQL["PostgreSQL<br/>- Tasks Table<br/>- Users Table<br/>- UserProgress<br/>- Achievements<br/>- Subtasks"]
        
        Indexing["Database Indexes<br/>- tasks.assigned_to_id<br/>- tasks.created_by_id<br/>- tasks.status<br/>- tasks.created_at"]
    end
    
    User -->|HTTPS| AppRouter
    AppRouter -->|Route| Dashboard
    Dashboard -->|Context| AuthProvider
    Dashboard -->|Context| SearchProvider
    Dashboard -->|Context| ThemeProvider
    Dashboard -->|Render| Components
    Dashboard -->|Custom| Hooks
    Dashboard -->|APIs| Services
    
    Services -->|HTTP| HTTPClient
    HTTPClient -->|Check| ClientCache
    ClientCache -->|Miss| ServerCache
    ServerCache -->|Miss| Router
    
    Hooks -->|useAuth| AuthProvider
    Hooks -->|useSearch| SearchProvider
    Hooks -->|useTheme| ThemeProvider
    
    LocalStorage -.->|Persist| AuthProvider
    LocalStorage -.->|Persist| ThemeProvider
    SessionStorage -.->|Cache| Dashboard
    
    Router -->|Auth| Middleware
    Middleware -->|Filtered| Services
    Services -->|Queries| DataAccess
    DataAccess -->|SQL| PostgreSQL
    PostgreSQL -->|Indexes| Indexing
```

---

## 2. Detailed Component Rendering Flow

```mermaid
graph TD
    Start["Dashboard.tsx Mount"]
    
    Start -->|Step 1| EffectCheck["useEffect Synchronization<br/>Dependencies: [fetchDashboardData]"]
    
    EffectCheck -->|Step 2| FetchLogic["fetchDashboardData() Logic"]
    
    FetchLogic -->|Check| UserExists["user !== null?"]
    UserExists -->|No| Exit["Return Early"]
    UserExists -->|Yes| SetLoading["setLoading(true)"]
    
    SetLoading -->|Step 3| ParallelFetch["Promise.all([])"]
    ParallelFetch -->|API 1| GetTasksCall["api.getTasks(user.id, user.role)"]
    ParallelFetch -->|API 2| GetUsersCall["api.getUsers()"]
    
    GetTasksCall -->|HTTP| GetTasksAPI["GET /tasks?skip_overdue..."]
    GetUsersCall -->|HTTP| GetUsersAPI["GET /users"]
    
    GetTasksAPI -->|Cache Check| TasksCache["buildCacheKey<br/>tasks:{userId,role}"]
    TasksCache -->|HIT| ReturnCached["Return Cached[]"]
    TasksCache -->|MISS| QueryDB["Query DB<br/>Filter by role"]
    QueryDB -->|Return| SerializeData["Serialize TaskRead[]"]
    
    GetUsersAPI -->|Cache| UsersCache["buildCacheKey<br/>users"]
    UsersCache -->|Hit/Miss| ReturnUsers["User[]"]
    
    ReturnCached -->|Received| TransformTasks["Received in Frontend"]
    SerializeData -->|Received| TransformTasks
    ReturnUsers -->|Received| TransformUsers["Received in Frontend"]
    
    TransformTasks -->|Step 4| MapStep["mapTask()<br/>Transform ApiTask → Task<br/>- Parse dates<br/>- Map enums<br/>- Extract fields"]
    
    MapStep -->|Step 5| PointsStep["augmentTasksWithPoints()<br/>- Load Points Config<br/>- Calculate XP per task<br/>- Sum total XP"]
    
    PointsStep -->|Step 6| StateUpdate["Update State:<br/>setAllTasks(tasksWithPoints)<br/>setTasks(myTasks)<br/>setUsersMap(map)"]
    
    TransformUsers -->|Step 6| StateUpdate
    
    StateUpdate -->|Step 7| Rerender["Component Re-renders<br/>Component Lifecycle"]
    
    Rerender -->|Trigger| MemoCompute["Run useMemo Hooks"]
    
    MemoCompute -->|Compute 1| FilteredCalc["filteredTasks = useMemo<br/>Filter by search query<br/>- title, description, team<br/>- priority, status"]
    
    MemoCompute -->|Compute 2| FocusCalc["focusQueueTasks = useMemo<br/>Sort by creator role +<br/>priority + due date<br/>Slice top 5"]
    
    MemoCompute -->|Compute 3| StatusCalc["tasksByStatus = useMemo<br/>Group by status<br/>Reduce into object"]
    
    MemoCompute -->|Compute 4| StatsCalc["Statistics = useMemo<br/>- totalTasks<br/>- completedCount<br/>- focusCount<br/>- blockedCount<br/>- momentum%<br/>- streakLength"]
    
    MemoCompute -->|Compute 5| LevelCalc["levelProgressData = useMemo<br/>getLevelProgress(xpScore)<br/>- Current level<br/>- XP in level<br/>- Progress %<br/>- XP to next level"]
    
    FilteredCalc --> CalcComplete["All Computations Complete"]
    FocusCalc --> CalcComplete
    StatusCalc --> CalcComplete
    StatsCalc --> CalcComplete
    LevelCalc --> CalcComplete
    
    CalcComplete -->|Step 8| JSXBuild["JSX Build & Render"]
    
    JSXBuild -->|Render Section 1| HeroRender["Hero Section<br/>- Level Card<br/>- Momentum Card<br/>- Stats Grid 2x2<br/>- Animations triggered"]
    
    JSXBuild -->|Render Section 2| PipelineRender["Quest Pipeline Section<br/>- statusOrder.map() → StatusCard<br/>- Each shows top 3 tasks<br/>- Progress bars"]
    
    JSXBuild -->|Render Section 3| SidebarRender["Right Sidebar<br/>- Reporting Card<br/>- Focus Queue Card<br/>- Task items clickable"]
    
    JSXBuild -->|Render Section 4| ModalRender["Conditional Modal<br/>if (selectedTaskId)<br/>→ TaskDetailModal"]
    
    HeroRender --> DOMUpdate["Update DOM<br/>React Reconciliation"]
    PipelineRender --> DOMUpdate
    SidebarRender --> DOMUpdate
    ModalRender --> DOMUpdate
    
    DOMUpdate -->|Paint| Browser["Browser Paint<br/>- Layout<br/>- Paint<br/>- Composite"]
    
    Browser -->|Display| UserView["User Sees Dashboard<br/>with All Data"]
    
    UserView -->|Finally| SetLoadingFalse["setLoading(false)"]
    
    SetLoadingFalse --> Ready["Dashboard Ready<br/>for Interaction"]
```

---

## 3. State Management & Event Flow

```mermaid
graph LR
    subgraph StateVars["Component State Variables"]
        ST1["tasks<br/>Task[]"]
        ST2["allTasks<br/>Task[]"]
        ST3["loading<br/>boolean"]
        ST4["selectedTaskId<br/>string|null"]
        ST5["usersMap<br/>Map"]
        ST6["levelsConfig<br/>Level[]"]
    end
    
    subgraph ContextState["Context State"]
        CT1["user<br/>User|null"]
        CT2["searchQuery<br/>string"]
        CT3["debouncedSearchQuery<br/>string"]
        CT4["theme<br/>Theme"]
    end
    
    subgraph EventSources["Event Sources"]
        API["API Responses"]
        CustomEvents["Window Events<br/>POINTS_CONFIG<br/>LEVELS_CONFIG"]
        UserInteraction["User Clicks<br/>Search Input<br/>Theme Selection"]
        LocalStorage["Storage Changes"]
    end
    
    subgraph Listeners["Event Listeners"]
        EL1["useEffect 1<br/>fetchDashboardData"]
        EL2["useEffect 2<br/>Points Config"]
        EL3["useEffect 3<br/>Levels Config"]
        EL4["useEffect 4<br/>Search Debounce"]
        EL5["useEffect 5<br/>Theme System"]
    end
    
    API -->|Task Data| EL1
    CustomEvents -->|Config| EL2
    CustomEvents -->|Config| EL3
    UserInteraction -->|Query| EL4
    LocalStorage -->|Theme| EL5
    
    EL1 -->|setState| ST1
    EL1 -->|setState| ST2
    EL1 -->|setState| ST5
    EL2 -->|Recalc| ST1
    EL3 -->|Recalc| ST6
    EL4 -->|Update| CT3
    EL5 -->|Update| CT4
    
    CT1 -->|useAuth| EL1
    CT2 -->|useSearch| EL4
    CT4 -->|useTheme| EL5
    
    ST1 -->|useMemo Dep| MemoCalc["useMemo Computations"]
    ST2 -->|useMemo Dep| MemoCalc
    CT3 -->|useMemo Dep| MemoCalc
    ST5 -->|useMemo Dep| MemoCalc
    
    MemoCalc -->|Result| Render["Component Render<br/>JSX Creation"]
    
    Render -->|Display| DOM["DOM Update<br/>UI Changes"]
```

---

## 4. Data Transformation Pipeline

```mermaid
graph TD
    subgraph Input["Backend API Response"]
        Raw["GET /tasks Response<br/>⬇️<br/>JSON Array<br/>[TaskRead]"]
    end
    
    subgraph Step1["Step 1: HTTP + Cache"]
        Fetch["fetch via mockApi.ts<br/>- Axios GET request<br/>- Handle headers<br/>- Error mapping"]
        Cache1["Cache Check<br/>- buildCacheKey()<br/>- getCached()<br/>- Return if HIT"]
        Fetch -->|Cache MISS| APICall["Make HTTP Call<br/>GET /tasks"]
        APICall -->|Response| Serialize["Response arrives as<br/>JSON[]"]
        Serialize -->|Cache SET| Store["setCached(key, data)"]
    end
    
    subgraph Step2["Step 2: Data Mapping"]
        MapFunc["mapTask() Function<br/>Transform each item:<br/>ApiTask → Task<br/><br/>Conversions:<br/>- status: string → Enum<br/>- priority: string → Enum<br/>- dates: string → Date<br/>- assignedTo: id → id[]<br/>- Extract: pointsBreakdown"]
        RawArray["Raw API Array<br/>type: ApiTask[]"]
        MappedArray["Mapped Array<br/>type: Task[]"]
        RawArray -->|mapTask()| MapFunc
        MapFunc -->|Result| MappedArray
    end
    
    subgraph Step3["Step 3: Points Augmentation"]
        Config["Load Points Config<br/>from localStorage:<br/>- basePoints<br/>- priority multipliers<br/>- status bonuses<br/>- clarity multipliers"]
        AugFunc["augmentTasksWithPoints()<br/>For each Task:<br/>1. Calculate base points<br/>2. Apply priority * multiplier<br/>3. Apply clarity * multiplier<br/>4. Add to task object"]
        Augmented["Augmented Tasks<br/>Each task now has<br/>pointsBreakdown:<br/>- basePoints<br/>- priorityBonus<br/>- clarityBonus<br/>- totalPoints"]
        MappedArray -->|Points Config| Config
        Config -->|Execute| AugFunc
        AugFunc -->|Output| Augmented
    end
    
    subgraph Step4["Step 4: Filtering & Grouping"]
        Filter["Filter Logic:<br/>onlyMyTasks = ALL.filter(<br/>  task => assignedTo.includes(userId)<br/>)"]
        GroupLogic["Group by Status:<br/>tasksByStatus = tasks.reduce(<br/>  (acc, task) => {<br/>    acc[task.status].push(task)<br/>    return acc<br/>  }<br/>)"]
        Augmented -->|userId| Filter
        Filter -->|Filtered Array| MyTasks["My Tasks Array"]
        MyTasks -->|Status Key| GroupLogic
        GroupLogic -->|Result| StatusGroups["Tasks by Status<br/>Object<br/>{<br/>  'TODO': [Task, Task],<br/>  'IN_PROGRESS': [Task],<br/>  'DONE': [Task, Task, Task]<br/>}"]
    end
    
    subgraph Step5["Step 5: Memoized Computations"]
        Memo1["filteredTasks = useMemo<br/>Filter by debouncedSearchQuery<br/>- Match title<br/>- Match description<br/>- Match team<br/>Deps: [tasks, searched]"]
        Memo2["focusQueueTasks = useMemo<br/>- Filter: focusQueueStatusSet<br/>- Sort: creator role + priority + due<br/>- Slice: [0:5]<br/>Deps: [filteredTasks, usersMap]"]
        Memo3["tasksByStatus = useMemo<br/>Reduce filtered tasks<br/>by status<br/>Deps: [filteredTasks]"]
        Memo4["Statistics = useMemo<br/>- totalTasks = length<br/>- completedCount = count DONE|FAILED<br/>- focusCount = count in focusStatuses<br/>- blockedCount = count BLOCKED<br/>- momentum = (completed+focus)/total*100<br/>Deps: [filteredTasks]"]
        Memo5["levelProgressData = useMemo<br/>getLevelProgress(xpScore, config)<br/>- Current level<br/>- XP into level<br/>- Progress %<br/>- Points to next<br/>Deps: [xpScore, levelsConfig]"]
        
        MyTasks -->|Deps| Memo1
        Memo1 -->|Output| FilteredTasks["filteredTasks<br/>Searched & Filtered"]
        FilteredTasks -->|Deps| Memo2
        Memo2 -->|Output| FocusQueue["focusQueueTasks<br/>Top 5 Urgent"]
        FilteredTasks -->|Deps| Memo3
        Memo3 -->|Output| StatusGroups
        FilteredTasks -->|Deps| Memo4
        Memo4 -->|Output| Stats["Statistics<br/>Object"]
        
        Augmented -->|XP Calc| xpScore["xpScore<br/>= sum of all<br/>task points"]
        xpScore -->|Deps| Memo5
        Memo5 -->|Output| LevelData["levelProgressData<br/>Level, Progress, XP"]
    end
    
    subgraph Output["Ready for Render"]
        Ready["All data computed<br/>ready for JSX"]
    end
    
    Raw -->|Step 1| Serialize
    Serialize -->|Step 2| MappedArray
    Augmented -->|Step 3→4| MyTasks
    Stats -->|Step 5| Ready
    FocusQueue -->|Step 5| Ready
    LevelData -->|Step 5| Ready
```

---

## 5. Focus Queue Sorting Algorithm

```mermaid
graph TD
    Input["focusQueueTasks Calculation"]
    
    Input -->|1. Filter| StatusFilter["Filter by Status<br/>Only include:<br/>- WAITING_FOR_REQUIREMENT<br/>- TODO<br/>- IN_PROGRESS<br/>Result: filtered[]"]
    
    StatusFilter -->|2. Spread| Spread["Spread into new array<br/>[...filtered]<br/>to avoid mutation"]
    
    Spread -->|3. Sort| Sort["Sort with .sort()<br/>comparator function"]
    
    Sort -->|Primary Key1| RoleWeight["Creator Role Weight<br/>OWNER = 3<br/>MANAGER = 2<br/>ADMIN = 1<br/>USER = 0<br/><br/>delta = bRole - aRole<br/>if delta ≠ 0 → return delta"]
    
    RoleWeight -->|Secondary Key2| PriorityWeight["Task Priority Weight<br/>URGENT = 3<br/>HIGH = 2<br/>MEDIUM = 1<br/>LOW = 0<br/><br/>delta = bPriority - aPriority<br/>if delta ≠ 0 → return delta"]
    
    PriorityWeight -->|Tertiary Key3| DueDate["Task Due Date<br/>Earlier due dates first<br/>No due date = MAX_SAFE_INT<br/><br/>aDue = a.dueAt ? getTime() : MAX<br/>bDue = b.dueAt ? getTime() : MAX<br/>return aDue - bDue"]
    
    DueDate -->|4. Slice| Slice["Slice first 5 items<br/>.slice(0, 5)<br/><br/>Max 5 tasks shown"]
    
    Slice -->|Result| Output["focusQueueTasks<br/>Top 5 sorted"]
    
    style RoleWeight fill:#e1f5ff
    style PriorityWeight fill:#fff3e0
    style DueDate fill:#f3e5f5
```

---

## 6. Theme Resolution System

```mermaid
graph TD
    ThemeMode["User Theme Setting<br/>localStorage: 'zenith-task-theme'<br/>Value: 'light|dark|colorful|system'"]
    
    ThemeMode -->|Check| IsColorful{"Is<br/>colorful?"}
    IsColorful -->|Yes| RetColorful["Return 'colorful'"]
    
    IsColorful -->|No| IsLight{"Is<br/>light?"}
    IsLight -->|Yes| RetLight["Return 'light'"]
    
    IsLight -->|No| IsDark{"Is<br/>dark?"}
    IsDark -->|Yes| RetDark["Return 'dark'"]
    
    IsDark -->|No| IsSystem{"Is<br/>system?"}
    IsSystem -->|Yes| DetectOS["Detect OS Theme<br/>window.matchMedia<br/>('prefers-color-scheme: dark')"]
    DetectOS -->|Dark Pref| RetOSDark["Return 'dark'"]
    DetectOS -->|Light Pref| RetOSLight["Return 'light'"]
    
    IsSystem -->|No| Default["Default to 'dark'"]
    
    RetColorful --> Resolved["Resolved Theme<br/>Type: 'light'|'dark'|'colorful'"]
    RetLight --> Resolved
    RetDark --> Resolved
    RetOSDark --> Resolved
    RetOSLight --> Resolved
    Default --> Resolved
    
    Resolved -->|light| LightScheme["Light Color Scheme<br/>bg: white<br/>border: slate-200<br/>text: slate-800"]
    Resolved -->|dark| DarkScheme["Dark Color Scheme<br/>bg: black/25<br/>border: white/15<br/>text: white/80"]
    Resolved -->|colorful| ColorfulScheme["Colorful Scheme<br/>bg: gradient<br/>border: white/60<br/>text: slate-900<br/>accent: pink/purple"]
    
    LightScheme -->|Apply| Dashboard["Apply Classes<br/>to Components"]
    DarkScheme -->|Apply| Dashboard
    ColorfulScheme -->|Apply| Dashboard
    
    Dashboard -->|Render| UI["Dashboard UI<br/>Fully Themed"]
```

---

## 7. Task Lifecycle in Dashboard

```mermaid
stateDiagram-v2
    [*] --> Created: Backend: Task Created
    
    Created --> Visible: Frontend: API /tasks called
    
    Visible --> Loaded: Task Loaded in Dashboard
    
    Loaded --> Displayed: Task Displayed in Column
    note right of Displayed
        Status determines column:
        TODO → Ready Queue
        IN_PROGRESS → Active Quest
        IN_REVIEW → Review Bay
        DONE → Completed
    end note
    
    Displayed --> UserAction: User Interacts
    note right of UserAction
        1. Click on task
        2. Modal opens
        3. Options available
    end note
    
    UserAction --> Edit: User Updates Task
    Edit --> Submit: PATCH /tasks/{id}
    
    Submit --> Backend: Backend Updates DB
    Backend --> CacheInvalidate: Invalidate Cache
    
    CacheInvalidate --> Refetch: Dashboard: fetchDashboardData()
    
    Refetch --> Reload: Task Data Reloaded
    Reload --> Displayed: Task Re-displayed
    
    Displayed --> UserAction
    
    UserAction --> Delete: User Deletes Task
    Delete --> API: DELETE /tasks/{id}
    API --> DBDelete: Backend Deletes
    DBDelete --> Removed: Task Removed from DB
    Removed --> [*]: Task Deleted
    
    Displayed --> Archived: Status → GRAVEYARD
    Archived --> LowPriority: Shown at bottom
    LowPriority --> [*]: Task Archived
```


## 8. Performance Optimization Strategy

```mermaid
graph TB
    Request["User Action<br/>Load Dashboard"]
    
    Request -->|Optimization 1| ClientCache["Check Client Cache<br/>buildCacheKey()<br/>Memory lookup<br/>⏱️ <1ms"]
    
    ClientCache -->|HIT| ReturnImmediate["Return Cached<br/>Instant render<br/>⏱️ <10ms"]
    
    ClientCache -->|MISS| ServerCache["Check Server Cache<br/>Redis lookup<br/>⏱️ 50ms"]
    
    ServerCache -->|HIT| ReturnServer["Return from Server<br/>Parse JSON<br/>Cache locally<br/>⏱️ 100ms"]
    
    ServerCache -->|MISS| DBQuery["Query Database<br/>With indexes<br/>Apply filters<br/>⏱️ 500ms-2s"]
    
    DBQuery -->|Result| CacheServer["Cache in Server<br/>TTL: 5-15 min"]
    CacheServer -->|Return| ParseAndCache["Parse & Cache<br/>Locally"]
    
    ReturnImmediate -->|Data| Render1["useMemo Optimization<br/>Only recompute if<br/>dependencies change"]
    ReturnServer -->|Data| Render1
    ParseAndCache -->|Data| Render1
    
    Render1 -->|Memoized Results| Render2["Component Renders<br/>JSX Creation<br/>⏱️ <50ms"]
    
    Render2 -->|Output| DOM["React Reconciliation<br/>Diff & Patch<br/>⏱️ <100ms"]
    
    DOM -->|Paint| Browser["Browser Paint<br/>Layout ↓ Paint ↓ Composite<br/>⏱️ <100ms"]
    
    Browser -->|Result| FinalUI["User Sees Dashboard<br/>Total: 10ms-3s"]
    
    style ClientCache fill:#90EE90
    style ServerCache fill:#FFD700
    style DBQuery fill:#FF6347
```

---

## 9. Component Render Tree with Props

```mermaid
graph TD
    Dashboard["<root><br/>Dashboard Component<br/>─────────────────"]
    
    Dashboard -->|No Props| HeroSection["<section><br/>Hero Banner Section"]
    Dashboard -->|No Props| PipelineSection["<section><br/>Quest Pipeline Section"]
    Dashboard -->|No Props| SidebarSection["<section><br/>Right Sidebar Section"]
    Dashboard -->|Conditional| Modal["<><br/>TaskDetailModal<br/>selectedTaskId && ..."]
    
    HeroSection -->|children| LevelCard["<div><br/>Level Card<br/>Props:<br/>- level<br/>- xpIntoLevel<br/>- levelSpan<br/>- levelProgress<br/>- xpToNextLevel"]
    
    HeroSection -->|children| MomentumCard["<div><br/>Momentum Card<br/>Props:<br/>- momentumScore<br/>- completedCount<br/>- focusCount<br/>- blockedCount<br/>- streakLength<br/>- dailyObjective"]
    
    HeroSection -->|children| StatsGrid["<div><br/>Stats Grid 2x2<br/>Children: 4 Stat Cards<br/>Props: [Array of<br/>label, value, accent, delay]"]
    
    PipelineSection -->|Header| PipeHeader["<div><br/>Pipeline Header<br/>Props:<br/>- totalTasks<br/>- completedCount"]
    
    PipelineSection -->|Content| PipeGrid["<div><br/>Grid Container<br/>statusOrder.length children"]
    
    PipeGrid -->|Maps| StatusCard["<div><br/>Status Column Card<br/>MANY INSTANCES<br/>Props:<br/>- status<br/>- detail (from statusDetails)<br/>- items (from tasksByStatus)<br/>- progressValue"]
    
    StatusCard -->|Maps| TaskItemP["<button><br/>Task Item<br/>Props:<br/>- task<br/>- onClick<br/>- className"]
    
    TaskItemP -->|Child| TaskPriority["<TaskPriorityBadge<br/>priority={task.priority}"]
    
    SidebarSection -->|Child 1| ReportingCard["<div><br/>Reporting Card<br/>Props: None<br/>Contains: Link to /reporting"]
    
    SidebarSection -->|Child 2| FocusQueueCard["<div><br/>Focus Queue Card<br/>Props: None<br/>Title, description"]
    
    FocusQueueCard -->|Maps| FocusTaskItem["<button><br/>Focus Task Item<br/>Maps: focusQueueTasks<br/>Props:<br/>- task<br/>- onClick"]
    
    FocusTaskItem -->|Child| StatusBadge["<TaskStatusBadge<br/>status={task.status}"]
    FocusTaskItem -->|Child| PriorityBadge["<TaskPriorityBadge<br/>priority={task.priority}"]
    
    Modal -->|If selectedTaskId| ModalComp["<TaskDetailModal<br/>taskId={selectedTaskId}<br/>isOpen={Boolean...}<br/>onClose={...}<br/>usersMap={usersMap}<br/>onTaskDeleted={...}"]
    
    style Dashboard fill:#e3f2fd
    style HeroSection fill:#f3e5f5
    style PipelineSection fill:#e8f5e9
    style SidebarSection fill:#fff3e0
```

---

## 10. Data Dependency Graph

```mermaid
graph TB
    Sources["Data Sources<br/>────────"]
    
    Sources -->|API| Tasks["tasks<br/>Task[]<br/>Assigned to user"]
    Sources -->|API| AllTasks["allTasks<br/>Task[]<br/>All tasks"]
    Sources -->|API| Users["usersMap<br/>Map<string, User>"]
    Sources -->|Context| CurrentUser["user<br/>User<br/>Current logged-in"]
    Sources -->|Context| SearchQ["debouncedSearchQuery<br/>string"]
    Sources -->|Local Storage| PointsConfig["pointsConfig<br/>PointsData"]
    Sources -->|Local Storage| LevelsConfig["levelsConfig<br/>Level[]"]
    
    Tasks -->|augmentTasksWithPoints| TasksWithPoints["tasks +<br/>pointsBreakdown"]
    AllTasks -->|XP Sum| XPScore["xpScore<br/>number"]
    
    TasksWithPoints -->|Filter search| Filtered["filteredTasks<br/>Task[]"]
    Users -->|Lookup| UsersMap
    Filtered -->|Creator role lookup| FocusQueue["focusQueueTasks<br/>Task[]<br/>Top 5"]
    Filtered -->|Group by status| TasksByStatus["tasksByStatus<br/>Record<Status, Task[]>"]
    
    Filtered -->|Count stats| Stats["Statistics<br/>- totalTasks<br/>- completedCount<br/>- focusCount<br/>- blockedCount"]
    
    XPScore -->|Calculate level| LevelData["levelProgressData<br/>- level<br/>- xpIntoLevel<br/>- progressPercent<br/>- levelSpan<br/>- xpToNextLevel"]
    LevelsConfig -->|Used by| LevelData
    PointsConfig -->|Used by| TasksWithPoints
    
    CurrentUser -->|Used in| Filtered
    CurrentUser -->|Used in| XPScore
    
    Stats -->|Calculate| MomentumScore["momentumScore<br/>number %"]
    Stats -->|Calculate| StreakLength["streakLength<br/>number"]
    Stats -->|Calculate| DailyObjective["dailyObjective<br/>number"]
    
    Filtered -->|Render Section| HeroSSR["Hero Section<br/>Render JSX"]
    TasksByStatus -->|Render Section| PipelineSSR["Pipeline Section<br/>Render JSX"]
    FocusQueue -->|Render Section| SidebarSSR["Sidebar Section<br/>Render JSX"]
    LevelData -->|Render| LevelDisplay["Level Card Display"]
    MomentumScore -->|Render| MomentumDisplay["Momentum Card Display"]
    
    HeroSSR --> FinalRender["Final JSX<br/>Passed to React"]
    PipelineSSR --> FinalRender
    SidebarSSR --> FinalRender
    
    FinalRender --> DOM["React Renders<br/>to DOM"]
```

---

## 11. Error Handling Flow

```mermaid
graph TD
    TryBlock["try {<br/>fetchDashboardData()<br/>}"]
    
    TryBlock -->|API Call 1| GetTasks["api.getTasks()"]
    TryBlock -->|API Call 2| GetUsers["api.getUsers()"]
    
    GetTasks -->|Success| TasksReceived["Tasks data arrives"]
    GetTasks -->|Error| TasksError["❌ Error thrown"]
    
    GetUsers -->|Success| UsersReceived["Users data arrives"]
    GetUsers -->|Error| UsersError["❌ Error thrown"]
    
    TasksError -->|Catch| ErrorHandler["catch (error) {<br/>console.error()"]
    UsersError -->|Catch| ErrorHandler
    
    ErrorHandler -->|Error Log| LogError["Log to console<br/>Failed to fetch..."]
    
    LogError -->|No state update| State["State remains<br/>loading = true<br/>tasks = []<br/>allTasks = []"]
    
    State -->|Finally| Finally["finally {<br/>setLoading(false)<br/>}"]
    
    Finally -->|Update state| LoadingFalse["loading = false"]
    
    LoadingFalse -->|UI shows| ErrorUI["<div><br/>Loading your quests...<br/></div><br/>OR<br/>Empty dashboard"]
    
    ErrorUI -->|User can| Retry["Refresh page<br/>to retry"]
    
    Retry -->|Triggers| TryBlock
    
    TasksReceived -->|Check| FilterLogic["Filter & transform<br/>tasks<br/>setTasks, setAllTasks"]
    UsersReceived -->|Check| BuildMap["Build usersMap<br/>setUsersMap"]
    
    FilterLogic -->|Success| StateDone["State updated<br/>loading = false"]
    BuildMap -->|Success| StateDone
    
    StateDone -->|No error| Render["Component renders<br/>with data"]
```

---

## 12. Search & Filter Pipeline

```
User Types in Search Bar
        ↓
SearchProvider captures input
        ↓
setSearchQuery(input)
        ↓ (300ms debounce timeout)
setDebouncedSearchQuery(query)
        ↓
Dashboard's useSearch() hook
returns { debouncedSearchQuery }
        ↓
useMemo dependency: [tasks, debouncedSearchQuery]
        ↓
Execute memoized calculation:
        ↓
if (!debouncedSearchQuery) return tasks
        ↓
const query = debouncedSearchQuery.toLowerCase()
        ↓
return tasks.filter(task => {
  const label = priorityLabel[task.priority]
  
  return (
    task.title.toLowerCase().includes(query) OR
    task.description.toLowerCase().includes(query) OR
    task.team.toLowerCase().includes(query) OR
    task.priority.toLowerCase().includes(query) OR
    label.toLowerCase().includes(query)
  )
})
        ↓
filteredTasks = result
        ↓
focusQueueTasks, tasksByStatus,
statistics, all recalculate
        ↓
Component re-renders
        ↓
User sees filtered results
```

---

## 13. Task Status Column Distribution

```
┌──────────────────────────────────────────────────────────────┐
│              Quest Pipeline - 9 Status Columns               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Column 1: WAITING_FOR_REQUIREMENT                          │
│  ├─ Legend: "Gather intel"                                  │
│  ├─ Color: from-slate-500/25 via-slate-600/25              │
│  ├─ Glow: shadow-slate                                      │
│  ├─ Show: First 3 tasks                                     │
│  └─ Badge: [Count] quest(s)                                 │
│                                                              │
│  Column 2: TODO                                             │
│  ├─ Legend: "Prep to launch"                                │
│  ├─ Color: from-indigo-500/25 via-sky-500/25               │
│  ├─ Glow: shadow-blue                                       │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 3: IN_PROGRESS                                      │
│  ├─ Legend: "Stay in the zone"                              │
│  ├─ Color: from-purple-500/25 via-fuchsia-500/25           │
│  ├─ Glow: shadow-purple                                     │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 4: IN_REVIEW                                        │
│  ├─ Legend: "Awaiting verdict"                              │
│  ├─ Color: from-emerald-500/25 via-teal-500/25             │
│  ├─ Glow: shadow-teal                                       │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 5: BLOCKED                                          │
│  ├─ Legend: "Needs assistance"                              │
│  ├─ Color: from-rose-500/25 via-red-500/25                 │
│  ├─ Glow: shadow-red                                        │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 6: ON_HOLD                                          │
│  ├─ Legend: "Resume later"                                  │
│  ├─ Color: from-slate-400/25 via-slate-500/25              │
│  ├─ Glow: shadow-gray                                       │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 7: DONE                                             │
│  ├─ Legend: "Claim your XP"                                 │
│  ├─ Color: from-emerald-400/25 via-lime-400/25             │
│  ├─ Glow: shadow-green                                      │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 8: FAILED                                           │
│  ├─ Legend: "Mission failed"                                │
│  ├─ Color: from-cyan-400/25 via-emerald-400/25             │
│  ├─ Glow: shadow-cyan                                       │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Column 9: GRAVEYARD                                        │
│  ├─ Legend: "Archived quests"                               │
│  ├─ Color: from-gray-400/25 via-gray-500/25                │
│  ├─ Glow: shadow-gray                                       │
│  └─ Show: First 3 tasks                                     │
│                                                              │
│  Note: Only columns with tasks are rendered                 │
│        statusOrder.filter(status => tasksByStatus[status]?.length)
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 14. Browser Cache Key Generation

```
buildCacheKey() Algorithm:

Function: buildCacheKey(resource, { userId, role }) → string

Steps:
1. Combine inputs:
   - settings.cache_prefix = "zea:"
   - resource = "tasks"
   - tenant_id = user.tenant_id or default
   - user_id = userId
   - path = request.url.path
   - params = request.query_params

2. Hash fingerprint:
   fingerprint = SHA256(JSON.stringify(params))

3. Build key:
   key = `${cache_prefix}:${resource}:tenant:${tenant_id}:user:${user_id}:q:${fingerprint}`

Example:
   Prefix:        zea
   Resource:      tasks:list
   Tenant:        tenant-123
   User:          user-456
   Hash:          a1b2c3d4...
   ─────────────────────────────────────────────
   Final Key:     zea:tasks:list:tenant:tenant-123:user:user-456:q:a1b2c3d4...

Frontend Implementation:
   const cacheKey = buildCacheKey('tasks', { userId: user.id, role: user.role })
   const cached = getCached<Task[]>(cacheKey)
   if (cached) return cached
   
   // Make HTTP call
   const { data } = await http.get<ApiTask[]>('/tasks')
   
   // Cache result
   setCached(cacheKey, data)
   
   return data
```

---

## 15. Real-time Sync Opportunities

```mermaid
graph TD
    Dashboard["Dashboard Currently<br/>Periodic Polling"]
    
    Dashboard -->|Current| Polling["useEffect<br/>fetchDashboardData()<br/>on mount only<br/>Manual refresh needed"]
    
    Polling -->|Problem| Stale["Stale Data<br/>- Other users<br/>  change tasks<br/>- Status updates<br/>- XP changes"]
    
    Polling -->|Latency| Manual["Manual Refresh<br/>User must click<br/>F5 to update"]
    
    Dashboard -->|Future| WebSocket["WebSocket<br/>Real-time Updates"]
    
    WebSocket -->|Events| Events1["Task Status Changed"]
    WebSocket -->|Events| Events2["Task Assigned to Me"]
    WebSocket -->|Events| Events3["XP Points Added"]
    WebSocket -->|Events| Events4["Achievement Unlocked"]
    
    Events1 -->|Update State| Sync1["Auto-update<br/>tasksByStatus"]
    Events2 -->|Update State| Sync2["Add to tasks<br/>Notify user"]
    Events3 -->|Update State| Sync3["Recalc XP<br/>Update level card"]
    Events4 -->|Update State| Sync4["Refresh<br/>achievements"]
    
    Sync1 -->|Result| RealTime["Real-time<br/>Responsive<br/>Collaborative"]
```

---

**End of Advanced Architectu Diagrams Report**
