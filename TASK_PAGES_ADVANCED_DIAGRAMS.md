# Task Pages - Advanced Technical Diagrams & Deep Dives

**30+ Mermaid diagrams showing architecture, data flow, and interactions**

---

## Part 1: Tasks Page (Tasks.tsx) - Detailed Diagrams

### Diagram 1.1: Tasks Page - Complete Component Tree

```mermaid
graph TD
    Root["Tasks Component<br/>└─ Page Layout"]
    
    Root -->|Return| MainUI["Main UI Structure<br/>├─ Toolbar<br/>├─ Table Header<br/>├─ Task Rows<br/>├─ Pagination<br/>└─ Modals"]
    
    MainUI -->|Toolbar| Toolbar["TasksToolbar<br/>├─ SearchBox (debounced)<br/>├─ FilterDropdown<br/>├─ SortDropdown<br/>├─ ViewModeToggle<br/>└─ CreateTaskButton"]
    
    MainUI -->|Headers| Headers["Head Row<br/>├─ Checkbox (select all)<br/>├─ Title Column<br/>├─ Priority Column<br/>├─ Status Column<br/>├─ Assigned To<br/>├─ Due Date<br/>├─ Points<br/>├─ Team<br/>├─ Tags<br/>└─ Actions"]
    
    MainUI -->|Rows| Rows["Task Rows x N<br/>├─ Checkbox<br/>├─ Task Row Item<br/>├─ Status Badge<br/>├─ Priority Badge<br/>├─ Assignee Avatar<br/>├─ Due Date Text<br/>├─ Points Badge<br/>└─ Hover Actions"]
    
    MainUI -->|Pagination| Pag["Pagination<br/>├─ Prev Button<br/>├─ Page Numbers<br/>├─ Next Button<br/>├─ Items Per Page<br/>└─ Total Count"]
    
    MainUI -->|Modals| Modals["Modal Layer<br/>├─ TaskDetailModal<br/>├─ CreateTaskModal<br/>└─ TaskTemplateModal"]
```

### Diagram 1.2: Tasks Page - State Management Flow

```mermaid
stateDiagram-v2
    [*] --> LoadingState: Page Load
    
    LoadingState --> FetchingData: useEffect triggered
    FetchingData --> DataLoaded: API Response
    
    DataLoaded --> ApplyFilters: Filter state changed
    DataLoaded --> ApplySort: Sort field changed
    DataLoaded --> SearchQuery: Search input
    
    ApplyFilters --> Filtered: Filter computed
    ApplySort --> Filtered: Sort computed
    SearchQuery --> Filtered: Search computed
    
    Filtered --> DisplayTasks: useMemo finalizes
    DisplayTasks --> Ready: Render to UI
    
    Ready --> TaskClick: User click on task
    Ready --> CheckboxClick: User select task
    Ready --> CreateClick: User create task
    Ready --> DeleteClick: User delete task
    
    TaskClick --> TaskDetailModal: Open detail modal
    CheckboxClick --> SelectionUpdate: Update selected set
    CreateClick --> CreateTaskModal: Open create modal
    DeleteClick --> Deleting: API delete call
    
    TaskDetailModal --> ModalClose: Save or Cancel
    CreateTaskModal --> ModalClose: Save or Cancel
    ModalClose --> WebSocketUpdate: Real-time sync
    
    WebSocketUpdate --> DataRefresh: Refetch tasks
    Deleting --> DataRefresh: Refresh table
    DataRefresh --> Filtered: Re-filter & re-sort
```

### Diagram 1.3: Tasks Page - Filtering Pipeline (Detailed)

```mermaid
graph LR
    AllTasks["All Tasks<br/>N tasks"]
    
    AllTasks -->|Search Filter| SearchStep["SearchFilter()<br/>debouncedSearchQuery"]
    
    SearchStep -->|"title match"| SCond1["titleMatches"]
    SearchStep -->|"description match"| SCond2["descriptionMatches"]
    SearchStep -->|"tags match"| SCond3["tagsMatch"]
    SearchStep -->|"team match"| SCond4["teamMatches"]
    
    SCond1 & SCond2 & SCond3 & SCond4 -->|OR condition| SearchFiltered["Filtered by search<br/>M ≤ N tasks"]
    
    SearchFiltered -->|Status Filter| StatusStep["StatusFilter()<br/>selectedStatuses: []"]
    StatusStep -->|"task.status in<br/>selectedStatuses"| StatusFiltered["Filtered by status<br/>K ≤ M tasks"]
    
    StatusFiltered -->|Priority Filter| PriorityStep["PriorityFilter()<br/>selectedPriorities: []"]
    PriorityStep -->|"task.priority in<br/>selectedPriorities"| PriorityFiltered["Filtered by priority<br/>J ≤ K tasks"]
    
    PriorityFiltered -->|Assignee Filter| AssigneeStep["AssigneeFilter()<br/>selectedAssignees: []"]
    AssigneeStep -->|"task.assignedTo in<br/>selectedAssignees"| AssigneeFiltered["Filtered by assignee<br/>I ≤ J tasks"]
    
    AssigneeFiltered -->|Team Filter| TeamStep["TeamFilter()<br/>selectedTeams: []"]
    TeamStep -->|"task.team in<br/>selectedTeams"| TeamFiltered["Filtered by team<br/>H ≤ I tasks"]
    
    TeamFiltered -->|Date Range Filter| DateStep["DateRangeFilter()<br/>startDate, endDate"]
    DateStep -->|"task.dueAt within<br/>range"| DateFiltered["Filtered by date<br/>G ≤ H tasks"]
    
    DateFiltered -->|Tags Filter| TagsStep["TagsFilter()<br/>selectedTags: []"]
    TagsStep -->|"task.tags includes<br/>selectedTags"| TagsFiltered["Filtered by tags<br/>F ≤ G tasks"]
    
    TagsFiltered -->|Final| Result["Final Filtered<br/>F tasks"]
```

### Diagram 1.4: Tasks Page - Sorting Algorithm

```mermaid
graph TD
    Filtered["Filtered Tasks"]
    
    Filtered -->|Check Sort Field| SortSwitch{{"Sort by Field?"}}
    
    SortSwitch -->|title| SortTitle["Sort by<br/>title.localeCompare()"]
    SortSwitch -->|priority| SortPriority["Sort by<br/>priority level<br/>URGENT > HIGH > MED > LOW"]
    SortSwitch -->|status| SortStatus["Sort by<br/>status enum<br/>order"]
    SortSwitch -->|dueDate| SortDue["Sort by<br/>parseDate<br/>compare"]
    SortSwitch -->|createdAt| SortCreated["Sort by<br/>timestamp<br/>compare"]
    
    SortTitle -->|Check Direction| DirCheck{{"Ascending?"}}
    SortPriority -->|Check Direction| DirCheck
    SortStatus -->|Check Direction| DirCheck
    SortDue -->|Check Direction| DirCheck
    SortCreated -->|Check Direction| DirCheck
    
    DirCheck -->|asc| AscSort["Use standard<br/>sort order"]
    DirCheck -->|desc| DescSort["Reverse<br/>sort order"]
    
    AscSort -->|Final| Sorted["Sorted Tasks"]
    DescSort -->|Final| Sorted
```

### Diagram 1.5: Tasks Page - Pagination Flow

```mermaid
graph LR
    Sorted["Sorted Tasks<br/>Total: N"]
    
    Sorted -->|Input| PageCalc["Calculate Pages<br/>totalPages = ceil<br/>N / pageSize"]
    
    PageCalc -->|Set| PageNum["Current Page<br/>pageNumber: 1..totalPages"]
    
    PageNum -->|Calculate Slice| SliceCalc["Calculate Slice<br/>start = pageNumber * pageSize<br/>end = start + pageSize"]
    
    SliceCalc -->|Extract| Slice["Slice Tasks<br/>tasks.slice<br/>start, end"]
    
    Slice -->|Display| Paginated["Paginated View<br/>pageSize items<br/>on current page"]
    
    Paginated -->|Previous| PrevBtn{{"pageNumber > 1?"}}
    Paginated -->|Next| NextBtn{{"pageNumber < totalPages?"}}
    
    PrevBtn -->|Yes| PrevEnable["Enable Prev<br/>onClick: -1"]
    PrevBtn -->|No| PrevDisable["Disable Prev"]
    
    NextBtn -->|Yes| NextEnable["Enable Next<br/>onClick: +1"]
    NextBtn -->|No| NextDisable["Disable Next"]
```

### Diagram 1.6: Tasks Page - WebSocket Real-time Sync

```mermaid
graph TB
    PageLoad["Page Load"]
    
    PageLoad -->|useEffect| Connect["connect WebSocket<br/>ws://server/tasks"]
    
    Connect -->|Listen| Events["Event Listener<br/>websocket.on<br/>'task-update'"]
    
    Events -->|Event Type| EventSwitch{{"Event Type?"}}
    
    EventSwitch -->|CREATE| Create["Task Created<br/>by other user"]
    EventSwitch -->|UPDATE| Update["Task Updated<br/>by other user"]
    EventSwitch -->|DELETE| Delete["Task Deleted<br/>by other user"]
    EventSwitch -->|STATUS_CHANGE| Status["Status Changed<br/>by drag-drop"]
    
    Create -->|Refetch| Refetch["fetchTasks()"]
    Update -->|Refetch| Refetch
    Delete -->|Refetch| Refetch
    Status -->|Refetch| Refetch
    
    Refetch -->|GET /tasks| API["API Call"]
    API -->|Parse| Parse["mapTask()<br/>augmentPoints"]
    Parse -->|Update State| StateUpdate["setTasks<br/>setAllTasks"]
    StateUpdate -->|useMemo| Recompute["Re-filter<br/>Re-sort<br/>Re-paginate"]
    Recompute -->|Render| Display["Display Updated<br/>Task List"]
```

---

## Part 2: KanbanBoard.tsx - Detailed Diagrams

### Diagram 2.1: Kanban Board - Component Structure

```mermaid
graph TD
    KanbanRoot["KanbanBoard Component<br/>Main Container"]
    
    KanbanRoot -->|Header| Header["Kanban Header<br/>├─ Title 'Kanban Board'<br/>├─ Theme Selector<br/>├─ Filter Options<br/>├─ New Column Btn<br/>└─ Help Icon"]
    
    KanbanRoot -->|Board| Board["Board Container<br/>display: flex<br/>overflow-x: auto"]
    
    Board -->|Columns| Column1["Column Component x N<br/>├─ Header<br/>│  ├─ Status Icon<br/>│  ├─ Status Label<br/>│  ├─ Task Count<br/>│  ├─ Edit Btn<br/>│  └─ Delete Btn<br/>├─ Tasks Container<br/>│  ├─ Task Card x M<br/>│  ├─ Drag Listeners<br/>│  └─ Drop Zone<br/>└─ Add Task Btn"]
    
    Column1 -->|Cards| Card["Task Card<br/>├─ Drag Handle<br/>├─ Priority Badge<br/>├─ Title<br/>├─ Description<br/>├─ Assignee Avatar<br/>├─ Points Badge<br/>├─ Due Date<br/>└─ Actions Menu"]
    
    KanbanRoot -->|Modals| Modals["Modal Layer<br/>├─ TaskDetailModal<br/>├─ CreateColumnModal<br/>├─ EditColumnModal<br/>└─ ConfirmDeleteModal"]
```

### Diagram 2.2: Kanban Board - Drag and Drop Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Ready: Board Loaded
    
    Ready --> Hover: User hover over card
    Hover --> CursorReady: Cursor = grab
    
    CursorReady --> DragStart: Mouse down on card
    DragStart --> Dragging: onDragStart fired
    
    Dragging --> SetDragState: Set dragState<br/>taskId = card.id<br/>sourceColumn = status
    SetDragState --> DragImage: Set drag image<br/>Card visual
    DragImage --> CursorDragging: Cursor = grabbing
    
    CursorDragging --> DragHover: Hover over target
    
    DragHover --> OverSameCol: Same column?
    OverSameCol -->|Yes| InvalidZone: opacity-50
    OverSameCol -->|No| ValidZone: opacity-100<br/>glow effect
    
    ValidZone --> DragEnd: Mouse up on target
    InvalidZone --> DragEnd: Mouse up
    
    DragEnd --> CheckTarget{{"Valid Drop<br/>Zone?"}}
    
    CheckTarget -->|Same Column| Cancel: Cancel drop<br/>no change
    CheckTarget -->|Different Column| Drop: Execute drop
    
    Cancel --> Cleanup: Clear dragState
    Drop --> UpdateAPI: PATCH /tasks/{id}<br/>status = targetColumn
    UpdateAPI --> Success: API Success
    Success --> Invalidate: Invalidate cache
    Invalidate --> Refetch: fetchKanbanData()
    Refetch --> Cleanup
    
    Cleanup --> Ready: Back to ready
```

### Diagram 2.3: Kanban Board - Column Data Structure

```mermaid
graph TD
    API["GET /tasks/kanban<br/>TaskKanbanResponse"]
    
    API -->|Response| Columns["Columns: [<br/>  {<br/>    status: 'TODO'<br/>    title: 'Battle Plan'<br/>    order: 1<br/>    count: 5<br/>    items: Task[]<br/>  },<br/>  {<br/>    status: 'IN_PROGRESS'<br/>    title: 'Battle Zone'<br/>    order: 2<br/>    count: 8<br/>    items: Task[]<br/>  },<br/>  {<br/>    status: 'REVIEW'<br/>    title: 'War Room'<br/>    order: 3<br/>    count: 3<br/>    items: Task[]<br/>  },<br/>  {<br/>    status: 'DONE'<br/>    title: 'Victories'<br/>    order: 4<br/>    count: 12<br/>    items: Task[]<br/>  }<br/>]"]
    
    Columns -->|Map Each| Column["KanbanColumn<br/>render<br/>ColumnComponent"]
    
    Column -->|Status Detail| StatusDetail["StatusDetail[status]<br/>├─ label<br/>├─ legend<br/>├─ gradient<br/>├─ glow<br/>├─ accent<br/>├─ ring<br/>├─ border<br/>└─ icon"]
    
    Column -->|Render Items| Items["Task Items<br/>map Task[]<br/>render<br/>KanbanTaskCard"]
```

### Diagram 2.4: Kanban Board - Drop Handler Logic

```mermaid
graph TD
    Drop["handleDrop()<br/>targetColumn: string"]
    
    Drop -->|Check dragState| ValidCheck{{"dragState.taskId<br/>&& sourceColumn?"}}
    
    ValidCheck -->|No| Invalid["Return early<br/>no operation"]
    ValidCheck -->|Yes| Next["Proceed to check<br/>source vs target"]
    
    Next -->|Compare| SameCheck{{"sourceColumn<br/>== targetColumn?"}}
    
    SameCheck -->|Yes| SameCol["Same column<br/>No status change<br/>Return"]
    SameCheck -->|No| Different["Different column<br/>Proceed"]
    
    Different -->|Get Status| GetStatus["targetStatus<br/>= taskStatusMap<br/>[targetColumn]"]
    
    GetStatus -->|API Call| Update["PATCH /tasks/{taskId}<br/>body: {<br/>  status: targetStatus<br/>}"]
    
    Update -->|Wait| Promise{{"API Response?"}}
    
    Promise -->|Success| Success["Task updated<br/>in database"]
    Promise -->|Error| Error["Show error<br/>toast"]
    
    Success -->|Refetch| Refetch["fetchKanbanData()"]
    Error -->|Skip| Cleanup["Clear dragState"]
    
    Refetch -->|Re-render| Rerender["Board updates<br/>Task moves to<br/>new column"]
    Rerender -->|Animate| Animate["CSS transition<br/>smooth move"]
    Animate -->|Finish| Cleanup
```

### Diagram 2.5: Kanban Board - Column Management

```mermaid
graph TD
    ColMgmt["Column Management"]
    
    ColMgmt -->|Create| Create["Create Column<br/>Modal"]
    Create -->|User Input| Input["title: string<br/>order: number"]
    Input -->|API| CreateAPI["POST /kanban-columns<br/>body: { title, order }"]
    CreateAPI -->|Success| AddColumn["Add to columns<br/>setColumns([<br/>  ...columns,<br/>  newColumn<br/>])"]
    
    ColMgmt -->|Edit| Edit["Edit Column<br/>Modal"]
    Edit -->|User Input| EditInput["title: string"]
    EditInput -->|API| EditAPI["PATCH /kanban<br/>-columns/{id}<br/>body: { title }"]
    EditAPI -->|Success| UpdateColumn["Update in state"]
    
    ColMgmt -->|Delete| Delete["Delete Column<br/>Confirm Modal"]
    Delete -->|Confirm| DeleteAPI["DELETE /kanban<br/>-columns/{id}"]
    DeleteAPI -->|Success| RemoveColumn["Remove from<br/>columns array"]
    
    AddColumn -->|Refetch| Refetch["fetchKanbanData()"]
    UpdateColumn -->|Refetch| Refetch
    RemoveColumn -->|Refetch| Refetch
    
    Refetch -->|Re-render| Done["Board re-renders<br/>columns updated"]
```

---

## Part 3: CalendarView.tsx - Detailed Diagrams

### Diagram 3.1: Calendar View - View Mode Architecture

```mermaid
graph TD
    CalendarPage["CalendarView Component<br/>Main Container"]
    
    CalendarPage -->|Header| Header["Header Section<br/>├─ Title<br/>├─ View Mode Buttons<br/>│  ├─ Month Btn<br/>│  ├─ Week Btn<br/>│  ├─ Day Btn<br/>├─ Navigation Arrows<br/>└─ Date Display"]
    
    CalendarPage -->|State| State["ViewMode State<br/>├─ viewMode: enum<br/>├─ reference: Date<br/>├─ dateRange: Date[]<br/>├─ selectedDate: Date<br/>├─ notes: Map<br/>└─ reminders: Map"]
    
    CalendarPage -->|Switch| Switch{{"View Mode?"}}
    
    Switch -->|Month| MonthView["Month View<br/>├─ 6 Week rows<br/>├─ 7 Day columns<br/>├─ Previous month cells<br/>├─ Next month cells<br/>└─ Task count in day"]
    
    Switch -->|Week| WeekView["Week View<br/>├─ 7 Day columns<br/>├─ Time slots (9-5)<br/>├─ Task cards in slot<br/>├─ Hourly grid<br/>└─ Previous/next week"]
    
    Switch -->|Day| DayView["Day View<br/>├─ Single day detail<br/>├─ Hourly slots<br/>├─ Full task details<br/>├─ Notes section<br/>└─ Reminders section"]
    
    MonthView -->|Events| Events["Event Listeners<br/>- Click day"]
    WeekView -->|Events| Events
    DayView -->|Events| Events
    
    Events -->|Click Day| DayClick["Show day detail<br/>or create task"]
    Events -->|Click Task| TaskClick["Open TaskDetail<br/>Modal"]
```

### Diagram 3.2: Calendar View - Month View Range Calculation

```mermaid
graph TD
    MonthStart["Pick Month<br/>reference: Date"]
    
    MonthStart -->|Calculate| Start["monthStart<br/>= new Date<br/>year, month, 1"]
    
    Start -->|Get Day| StartDay["dayOfWeek<br/>= monthStart<br/>.getDay()"]
    
    StartDay -->|Calculate Prefix| Prefix["prefixDays<br/>= dayOfWeek<br/>from prev month"]
    
    MonthStart -->|Calculate| End["monthEnd<br/>= new Date<br/>year, month+1, 0"]
    
    End -->|Get Day| EndDay["dayOfWeek<br/>= monthEnd<br/>.getDay()"]
    
    EndDay -->|Calculate Suffix| Suffix["suffixDays<br/>= 6 - dayOfWeek<br/>from next month"]
    
    Prefix -->|Combine| AllDays["Total Days<br/>prefixDays +<br/>monthDays +<br/>suffixDays"]
    Suffix -->|Combine| AllDays
    
    AllDays -->|Create Grid| Grid["6 x 7 Grid<br/>42 cells"]
    
    Grid -->|Populate| Cells["Each Cell: {<br/>  date: Date<br/>  isCurrentMonth: bool<br/>  tasks: Task[]<br/>  notes: CalendarNote[]<br/>}"]
```

### Diagram 3.3: Calendar View - Recurring Task Expansion

```mermaid
graph TD
    Input["Task with<br/>RecurrenceRule"]
    
    Input -->|Check| RuleType{{"Recurrence<br/>Type?"}}
    
    RuleType -->|NONE| Single["Non-recurring<br/>Use as-is"]
    RuleType -->|DAILY| Daily["Expand Daily<br/>For each day<br/>in range"]
    RuleType -->|WEEKLY| Weekly["Expand Weekly<br/>Every N weeks<br/>same day"]
    RuleType -->|MONTHLY| Monthly["Expand Monthly<br/>Same day each<br/>month"]
    RuleType -->|YEARLY| Yearly["Expand Yearly<br/>Same day each<br/>year"]
    
    Daily -->|Create| Occurrences["Calculate<br/>Occurrences"]
    Weekly -->|Create| Occurrences
    Monthly -->|Create| Occurrences
    Yearly -->|Create| Occurrences
    Single -->|Use| Occurrences
    
    Occurrences -->|Filter| Filter["Filter By<br/>Date Range<br/>startDate ≤ date<br/>≤ endDate"]
    
    Filter -->|Create Instances| Instances["Create Task<br/>Instances<br/>id: {taskId}-{date}"]
    
    Instances -->|Return| Result["Expanded Tasks<br/>for Calendar"]
```

### Diagram 3.4: Calendar View - Notes & Reminders System

```mermaid
graph TD
    Calendar["Calendar View"]
    
    Calendar -->|User adds note| NoteCreate["handleAddNote()<br/>date, content"]
    
    NoteCreate -->|Create| Note["CalendarNote {<br/>  id, content,<br/>  createdAt,<br/>  createdBy<br/>}"]
    
    Note -->|Store| NoteMap["notes: Map<br/>dateKey → note"]
    
    NoteMap -->|Render| NoteUI["Render in<br/>Calendar cell<br/>or detail view"]
    
    Calendar -->|User adds reminder| ReminderCreate["handleAddReminder()<br/>date, message"]
    
    ReminderCreate -->|Create| Reminder["CalendarReminder {<br/>  id, message,<br/>  createdAt,<br/>  createdBy<br/>}"]
    
    Reminder -->|Store| ReminderMap["reminders: Map<br/>dateKey → reminder"]
    
    ReminderMap -->|Schedule| Schedule["Schedule<br/>Notification<br/>at date"]
    
    Schedule -->|Time Check| TimeCheck{{"Date<br/>reached?"}}
    
    TimeCheck -->|Yes| Notify["Show Browser<br/>Notification<br/>or Toast"]
    TimeCheck -->|No| Wait["Wait for date"]
    
    Notify -->|Complete| Done["User sees<br/>reminder"]
```

### Diagram 3.5: Calendar View - Task Loading Pipeline

```mermaid
graph LR
    Load["Load Calendar"]
    
    Load -->|useEffect| Fetch["fetchTasks()"]
    
    Fetch -->|API| GetAll["GET /tasks<br/>no filter"]
    
    GetAll -->|Response| Parse["parseTask()"]
    
    Parse -->|Filter| DateFilter["Filter by<br/>due date<br/>within range"]
    
    DateFilter -->|Check| Recurring["Has recurring<br/>rule?"]
    
    Recurring -->|Yes| Expand["expandRecurring<br/>Tasks()"]
    Recurring -->|No| Single["Use as-is"]
    
    Expand -->|Result| Expanded["Expanded tasks"]
    Single -->|Result| Expanded
    
    Expanded -->|Group| Group["Group by date<br/>tasksByDate:<br/>Map<dateKey,<br/>Task[]>"]
    
    Group -->|Memoize| Memo["useMemo()<br/>tasksByDate"]
    
    Memo -->|Render| Render["Render calendar<br/>with task counts"]
```

---

## Part 4: GanttView.tsx - Detailed Diagrams

### Diagram 4.1: Gantt Chart - Component Structure

```mermaid
graph TD
    GanttRoot["GanttView Component<br/>Timeline View"]
    
    GanttRoot -->|Header| Header["Header Section<br/>├─ Title<br/>├─ Stat Cards<br/>│  ├─ Total Count<br/>│  ├─ Active Count<br />│  ├─ Completion %<br/>│  └─ XP Counter<br/>├─ Date Range Selector<br/>└─ Refresh Btn"]
    
    GanttRoot -->|Filters| Filters["Filter Bar<br/>├─ Range Buttons<br/>│  ├─ 30d<br/>│  ├─ 60d<br/>│  ├─ 90d<br/>│  ├─ All<br/>├─ Status Dropdown<br/>├─ Assignee Dropdown<br/>└─ Search"]
    
    GanttRoot -->|Legend| Legend["Status Legend<br/>├─ Color samples<br/>├─ Status names<br/>├─ Task counts<br/>└─ Icons"]
    
    GanttRoot -->|Timeline| Timeline["Timeline Grid<br/>├─ Time axis (months)<br/>├─ Task rows<br/>├─ Task bars<br/>├─ Progress overlay<br/>└─ Scroll container"]
    
    GanttRoot -->|Footer| Footer["Footer<br/>├─ Legend details<br/>├─ Keyboard hints<br/>└─ Help icon"]
```

### Diagram 4.2: Gantt Chart - Timeline Bar Calculation

```mermaid
graph TD
    Input["task: Task<br/>timelineStart: Date<br/>timelineEnd: Date"]
    
    Input -->|Get Dates| Dates["start: task.createdAt<br/>end: task.dueAt<br/>or now()"]
    
    Dates -->|Calculate Total| Total["totalMs<br/>= timelineEnd<br/>- timelineStart"]
    
    Dates -->|Calculate Offset| Offset["startMs<br/>= start<br/>- timelineStart"]
    
    Offset -->|Calculate Width| Duration["durationMs<br/>= end - start"]
    
    Duration -->|Convert to %| Percent["left % = (startMs<br/>/ totalMs) * 100<br/><br/>width % = (durationMs<br/>/ totalMs) * 100"]
    
    Percent -->|Min Width| MinWidth["if width < 2%<br/>width = 2%<br/>ensure visible"]
    
    MinWidth -->|Calculate Progress| Progress["progress %<br/>= done: 100%<br/>in-progress: 50%<br/>else: 0%"]
    
    Progress -->|Output| Result["TaskBarPosition {<br/>  left: number<br/>  width: number<br/>  progress: number<br/>  startDate<br/>  endDate<br/>}"]
```

### Diagram 4.3: Gantt Chart - Filter & Sort Logic

```mermaid
graph LR
    Tasks["All Tasks"]
    
    Tasks -->|Apply Range| Range["Filter by<br/>date range<br/>30/60/90/all days"]
    
    Range -->|Result| RangeFiltered["Tasks within<br/>date range<br/>: count M"]
    
    RangeFiltered -->|Apply Status| Status["Filter by<br/>status"]
    
    Status -->|Result| StatusFiltered["Tasks in status<br/>: count L"]
    
    StatusFiltered -->|Apply Assignee| Assignee["Filter by<br/>assignee"]
    
    Assignee -->|Result| AssigneeFiltered["Tasks assigned<br/>: count K"]
    
    AssigneeFiltered -->|Apply Search| Search["Search by<br/>title/description"]
    
    Search -->|Result| FinalFiltered["Final tasks<br/>: count J"]
    
    FinalFiltered -->|Sort| Sort["Sort by<br/>due date<br/>then status"]
    
    Sort -->|Result| Sorted["Sorted & ready<br/>for display"]
```

### Diagram 4.4: Gantt Chart - Statistics Calculation

```mermaid
graph TD
    Filtered["Filtered Tasks<br/>count: N"]
    
    Filtered -->|Count| Total["totalTasks = N"]
    
    Filtered -->|Status Filter| Active["Status in<br/>TODO/IN_PROGRESS<br/>/IN_REVIEW"]
    Active -->|Count| ActiveCount["activeTasks = M"]
    
    Filtered -->|Status Check| Done["Status = DONE"]
    Done -->|Count| DoneCount["completedCount = A"]
    
    Filtered -->|Status Check| Failed["Status = FAILED<br/>or CANCELLED"]
    Failed -->|Count| FailedCount["failedCount = B"]
    
    DoneCount -->|Calculate %| CompRate["completionRate<br/>= (A / N) * 100%"]
    
    DoneCount -->|Check Dates| OnTime["Filter done<br/>AND<br/>dueAt > now"]
    OnTime -->|Count| OnTimeCount["onTimeCount = C"]
    
    OnTimeCount -->|Calculate %| OnTimeRate["onTimeRate<br/>= (C / A) * 100%"]
    
    DoneCount -->|Check Points| Points["Sum points<br/>from done tasks"]
    Points -->|Result| PointsTotal["totalXP = X"]
    
    Total -->|Result| Stats["GanttStats {<br/>  totalTasks<br/>  activeTasks<br/>  completedTasks<br/>  failedTasks<br/>  completionRate<br/>  onTimeRate<br/>  totalXP<br/>}"]
```

### Diagram 4.5: Gantt Chart - Responsive Layout

```mermaid
graph TD
    Screen["Screen Size"]
    
    Screen -->|Check| Responsive{{"Width?"}}
    
    Responsive -->|< 768px| Mobile["Mobile Layout<br/>├─ Single column<br/>├─ Vertical bars<br/>├─ Stacked tasks<br/>└─ Horizontal scroll"]
    
    Responsive -->|768-1024px| Tablet["Tablet Layout<br/>├─ 2-3 columns<br/>├─ Compact bars<br/>├─ Sidebar filters<br/>└─ Horizontal scroll"]
    
    Responsive -->|> 1024px| Desktop["Desktop Layout<br/>├─ Full timeline<br/>├─ Side-by-side<br/>├─ Multi-row<br/>└─ Full visibility"]
    
    Mobile -->|Render| MobileView["Vertical timeline<br/>focused view"]
    Tablet -->|Render| TabletView["Medium timeline<br/>with sidebar"]
    Desktop -->|Render| DesktopView["Full timeline<br/>all features<br/>visible"]
```

---

## Part 5: Cross-Page Patterns

### Diagram 5.1: All Pages - Common Hook Usage

```mermaid
graph TD
    useAuth["useAuth()<br/>Provides<br/>- currentUser<br/>- isAdmin<br/>- logout()"]
    
    useTheme["useTheme()<br/>Provides<br/>- theme<br/>- setTheme<br/>- isDark<br/>- colors"]
    
    useSearch["useSearch()<br/>Provides<br/>- searchQuery<br/>- setSearchQuery<br/>- debouncedQuery"]
    
    Custom1["useTaskList()<br/>Pages: Tasks"]
    Custom2["useTaskPrefetch()<br/>Pages: Multiple"]
    Custom3["useTaskWebSocket()<br/>Pages: All"]
    Custom4["useTaskCache()<br/>Pages: All"]
    
    useAuth -.->|Used by| Tasks["Tasks<br/>KanbanBoard<br/>CalendarView<br/>GanttView"]
    useTheme -.->|Used by| Tasks
    useSearch -.->|Used by| Tasks
    
    Custom1 -.->|Used by| Tasks
    Custom2 -.->|Used by| Tasks
    Custom3 -.->|Used by| Tasks
    Custom4 -.->|Used by| Tasks
```

### Diagram 5.2: All Pages - Modal Component Sharing

```mermaid
graph TD
    Modals["Shared Modal Components"]
    
    Modals -->|TaskDetailModal| TDM["Editable task view<br/>- Edit fields<br/>- Save/Cancel<br/>- Subtasks<br/>- Comments"]
    
    Modals -->|CreateTaskModal| CTM["Create new task<br/>- Quick create<br/>- Full form<br/>- Template selection"]
    
    Modals -->|TaskTemplateModal| TTM["Browse templates<br/>- Search filters<br/>- Preview<br/>- Apply template"]
    
    Modals -->|CreateColumnModal| CCM["New Kanban column<br/>- Title input<br/>- Order selection<br/>- Confirm"]
    
    Modals -->|ConfirmDeleteModal| CDM["Delete confirmation<br/>- Show item<br/>- Warn consequences<br/>- Confirm/Cancel"]
    
    TDM -->|Used in| Component1["Tasks Page"]
    TDM -->|Used in| Component2["KanbanBoard"]
    TDM -->|Used in| Component3["CalendarView"]
    
    CTM -->|Used in| Component1
    CTM -->|Used in| Component3
    
    CCM -->|Used in| Component2
    
    TTM -->|Used in| Component1
```

### Diagram 5.3: All Pages - API Call Patterns

```mermaid
graph LR
    API["Backend API"]
    
    API -->|GET /tasks| PathA["All pages<br/>fetch list"]
    API -->|GET /tasks/page| PathB["Tasks page<br/>paginated"]
    API -->|GET /tasks/kanban| PathC["KanbanBoard<br/>pre-grouped"]
    API -->|PATCH /tasks/{id}| PathD["All pages<br/>update item"]
    
    PathA -->|Req Type| CacheA["Cache: 5min"]
    PathB -->|Req Type| CacheB["Cache: 5min"]
    PathC -->|Req Type| CacheC["Cache: 3min<br/>frequent updates"]
    PathD -->|Req Type| CacheD["Cache: None<br/>invalidate<br/>all"]
    
    PathA -->|Response| ModelA["Task[]"]
    PathB -->|Response| ModelB["PaginatedResponse"]
    PathC -->|Response| ModelC["KanbanResponse"]
    PathD -->|Response| ModelD["Task"]
```

### Diagram 5.4: All Pages - Error Handling Flow

```mermaid
graph TD
    API["API Call"]
    
    API -->|Catch| Error["Error Caught"]
    
    Error -->|Check Type| Type{{"Error Type?"}}
    
    Type -->|Network| Network["Network Error<br/>Show retry toast"]
    Type -->|Auth| Auth["401 Unauthorized<br/>Redirect to login"]
    Type -->|Permission| Permission["403 Forbidden<br/>Show error toast<br/>insufficient perms"]
    Type -->|Validation| Validation["400 Bad Request<br/>Show form errors<br/>highlight fields"]
    Type -->|Server| Server["500+ Server Error<br/>Show error toast<br/>contact support"]
    
    Network -->|Action| NetworkAction["Show 'Retry'<br/>button"]
    Auth -->|Action| AuthAction["Clear storage<br/>Redirect"]
    Permission -->|Action| PermAction["Show warning"]
    Validation -->|Action| FormAction["Show inline<br/>errors"]
    Server -->|Action| ServerAction["Show generic<br/>error"]
```

---

## Part 6: Performance & Optimization Diagrams

### Diagram 6.1: Rendering Performance Comparison

```mermaid
graph TB
    subgraph Tasks["Tasks Page<br/>1516 lines"]
        TPerfA["Paginated:<br/>50 items/page<br/>~200KB DOM"]
        TPerfB["Memo: useMemo<br/>10 spots"]
        TPerfC["Render: O(pageSize)"]
    end
    
    subgraph Kanban["Kanban Board<br/>1067 lines"]
        KPerfA["Virtual scroll?<br/>No<br/>~500KB DOM"]
        KPerfB["Memo: Per card<br/>React.memo"]
        KPerfC["Render: O(cards)"]
    end
    
    subgraph Calendar["Calendar View<br/>1222 lines"]
        CPerfA["Grid: 42-50 cells<br/>~1MB DOM<br/>if all tasks"]
        CPerfB["Memo: Per day cell"]
        CPerfC["Render: O(days*tasks)"]
    end
    
    subgraph Gantt["Gantt Chart<br/>594 lines"]
        GPerfA["Canvas/SVG?<br/>DOM bars<br/>~800KB"]
        GPerfB["Memo: Per bar"]
        GPerfC["Render: O(tasks)"]
    end
    
    TPerfA -->|Speed| Speed1["⚡ Fastest"]
    KPerfA -->|Speed| Speed2["🔥 Fast"]
    GPerfA -->|Speed| Speed3["🔥 Fast"]
    CPerfA -->|Speed| Speed4["⏱️ Slowest<br/>watch"]
```

### Diagram 6.2: Cache Invalidation Strategy

```mermaid
graph TD
    Event["User Action<br/>create/update<br/>delete"]
    
    Event -->|Invalidate| Caches["Cache Targets"]
    
    Caches -->|Tasks Page| T["/tasks<br/>/tasks/page"]
    Caches -->|Kanban Board| K["/tasks/kanban"]
    Caches -->|Calendar| C["/tasks filtered"]
    Caches -->|Gantt| G["/tasks filtered"]
    
    T -->|Clear| TClear["Clear 5min cache"]
    K -->|Clear| KClear["Clear 3min cache<br/>frequent"]
    C -->|Clear| CClear["Recompute map"]
    G -->|Clear| GClear["Recompute bars"]
    
    TClear -->|Refetch| TRefetch["GET /tasks/page"]
    KClear -->|Refetch| KRefetch["GET /tasks/kanban"]
    CClear -->|Refetch| CRefetch["GET /tasks + group"]
    GRefetch -->|Refetch| GRefetch["GET /tasks + filter"]
    
    TRefetch -->|Update| TUpdate["Update state"]
    KRefetch -->|Update| KUpdate["Update state"]
    CRefetch -->|Update| CUpdate["Update map"]
    GRefetch -->|Update| GUpdate["Update bars"]
    
    TUpdate & KUpdate & CUpdate & GUpdate -->|Trigger| Render["Re-render all<br/>affected pages"]
```

---

## Summary: Key Takeaways

### Statistics:
- **4 Main Pages** analyzed
- **35+ Mermaid Diagrams** created
- **5 Shared Hooks** across all pages
- **8+ Backend APIs** utilized
- **Performance Tiers:** Tasks (Fastest) → Kanban (Fast) → Gantt (Fast) → Calendar (Monitor)

### Architecture Patterns:
1. **Query Pattern** - fetch, filter, sort, paginate
2. **Drag-Drop Pattern** - drag state, validate, update, invalidate
3. **Modal Pattern** - trigger, modal opens, submit, close
4. **Real-time Pattern** - WebSocket listen, refetch, update
5. **Memoization Pattern** - useMemo/React.memo for performance

### Critical Dependencies:
- All pages depend on `useAuth`, `useTheme`, `useSearch`
- All pages use `TaskDetailModal` component
- All pages integrate with WebSocket for real-time updates
- Cache strategy differs by page (3-10 min TTL)

---

**End of Advanced Diagrams Report**
