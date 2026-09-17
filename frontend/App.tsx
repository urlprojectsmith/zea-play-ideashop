
import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth, SearchProvider, ThemeProvider, useTheme } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import { Role } from './types';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Users = React.lazy(() => import('./pages/Users'));
const KanbanBoard = React.lazy(() => import('./pages/KanbanBoard'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const GanttView = React.lazy(() => import('./pages/GanttView'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Achievements = React.lazy(() => import('./pages/Achievements'));
const RewardManagement = React.lazy(() => import('./pages/RewardManagement'));
const PointsTableSettings = React.lazy(() => import('./pages/PointsTableSettings'));
// const TemplateEditor = React.lazy(() => import('./pages/TemplateEditor'));
const ApiOverview = React.lazy(() => import('./pages/ApiOverview'));
// const MediaLibraryPage = React.lazy(() => import('./pages/MediaLibrary'));
const LevelsManager = React.lazy(() => import('./pages/LevelsManager'));
// const Tickets = React.lazy(() => import('./pages/TicketPage'));
const Inbox = React.lazy(() => import('./pages/Inbox'));
// const Chat = React.lazy(() => import('./pages/Chat'));
const Logs = React.lazy(() => import('./pages/Logs'));
// const ToolLibrary = React.lazy(() => import('./pages/ToolLibrary'));
const MasterControl = React.lazy(() => import('./pages/MasterControl'));
// const Reporting = React.lazy(() => import('./pages/Reporting'));

const PageLoader: React.FC = () => (
  <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-white/60">
    Loading...
  </div>
);
const ProtectedLayout: React.FC = () => {
  return (
    <ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </Layout>
    </ProtectedRoute>
  );
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<Navigate to={user?.role === Role.USER ? "/dashboard" : "/tasks"} replace />} />

        <Route path="dashboard" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Dashboard /></ProtectedRoute>} />
        <Route path="tasks" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Tasks /></ProtectedRoute>} />
        <Route path="tasks/:id" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Tasks /></ProtectedRoute>} />
        <Route path="admin/tasks/:id" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><Tasks /></ProtectedRoute>} />
        <Route path="dashboard/tasks/:id" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Tasks /></ProtectedRoute>} />
        <Route path="admin/users" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><Users /></ProtectedRoute>} />
        <Route path="admin/rewards" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><RewardManagement /></ProtectedRoute>} />
        <Route path="admin/points-table" element={<ProtectedRoute roles={[Role.OWNER]}><PointsTableSettings /></ProtectedRoute>} />
        <Route path="kanban" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><KanbanBoard /></ProtectedRoute>} />
        {/* <Route path="media" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><MediaLibraryPage /></ProtectedRoute>} /> */}
        <Route path="calendar" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><CalendarView /></ProtectedRoute>} />
        <Route path="gantt" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><GanttView /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><Reports /></ProtectedRoute>} />
        {/* <Route path="reporting" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Reporting /></ProtectedRoute>} /> */}
        <Route path="logs" element={<ProtectedRoute roles={[Role.MANAGER, Role.ADMIN, Role.OWNER]}><Logs /></ProtectedRoute>} />
        {/* <Route path="tool-library" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><ToolLibrary /></ProtectedRoute>} /> */}
        <Route path="settings" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Settings /></ProtectedRoute>} />
        <Route path="achievements" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Achievements /></ProtectedRoute>} />
        <Route path="levels" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><LevelsManager /></ProtectedRoute>} />
        {/* <Route path="tickets" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Tickets /></ProtectedRoute>} /> */}
        <Route path="inbox" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Inbox /></ProtectedRoute>} />
        {/* <Route path="chat" element={<ProtectedRoute roles={[Role.USER, Role.MANAGER, Role.ADMIN, Role.OWNER]}><Chat /></ProtectedRoute>} /> */}
        {/* <Route path="template-editor" element={<ProtectedRoute roles={[Role.OWNER]}><TemplateEditor /></ProtectedRoute>} /> */}
        <Route path="api/overview" element={<ProtectedRoute roles={[Role.OWNER]}><ApiOverview /></ProtectedRoute>} />
        {/* <Route path="master-control" element={<ProtectedRoute roles={[Role.OWNER]}><MasterControl /></ProtectedRoute>} /> */}


      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const backgroundImage = theme === 'colorful' ? `url('')` : 'none';
  return (
    <div style={{ backgroundImage, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', minHeight: '100vh' }}>
      <AppRoutes />
    </div>
  );
};

const App: React.FC = () => {
  console.log('App.tsx: App component rendering');
  return (
    <HashRouter>
      <ThemeProvider>
        <AuthProvider>
          <SearchProvider>
            <AppContent />
          </SearchProvider>
        </AuthProvider>
      </ThemeProvider>
    </HashRouter>
  );
};

export default App;

