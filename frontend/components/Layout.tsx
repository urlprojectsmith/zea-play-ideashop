

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import TaskDetailModal from './TaskDetailModal';
import api from '../services/mockApi';
import { User, Role, ReleaseNotes, ReleaseNotesUpdate } from '../types';
import ClaimedRewardModal from './ClaimedRewardModal';
import Chatbot from './Chatbot';
import { APP_REFRESH_EVENT } from '../utils/appEvents';
import { useAuth, useTheme } from '../hooks/useAuth';
import { ToastProvider } from '../hooks/useToast';
import ReleaseNotesModal from './ReleaseNotesModal';
import ReleaseNotesEditorModal from './ReleaseNotesEditorModal';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [viewingRewardId, setViewingRewardId] = useState<string | null>(null);
  const [usersMap, setUsersMap] = useState<Map<string, User>>(new Map());
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null);
  const [releaseNotesLoading, setReleaseNotesLoading] = useState(false);
  const [releaseNotesError, setReleaseNotesError] = useState<string | null>(null);
  const [releaseNotesSaving, setReleaseNotesSaving] = useState(false);
  const [isReleaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [isReleaseNotesEditorOpen, setReleaseNotesEditorOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuView, setMobileMenuView] = useState<'grid' | 'list'>('grid');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark' | 'colorful'>('light');
  const [isMobileBottomNavMode, setIsMobileBottomNavMode] = useState(false);
  const [isMobileBottomNavVisible, setIsMobileBottomNavVisible] = useState(true);
  const lastMainScrollTopRef = useRef(0);

  const fetchUsers = useCallback(async () => {
    try {
      const allUsers = await api.getUsers();
      const map = new Map<string, User>();
      allUsers.forEach(u => map.set(u.id, u));
      setUsersMap(map);
    } catch (error) {
      console.error("Failed to fetch users for layout:", error);
    }
  }, []);

  const fetchReleaseNotes = useCallback(async () => {
    setReleaseNotesLoading(true);
    setReleaseNotesError(null);
    try {
      const notes = await api.getReleaseNotes();
      setReleaseNotes(notes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load release notes.';
      setReleaseNotesError(message);
    } finally {
      setReleaseNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      fetchUsers();
    };
    if (refreshKey > 0) {
      run();
      return () => {
        cancelled = true;
      };
    }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run);
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(run, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [fetchUsers, refreshKey]);

  useEffect(() => {
    fetchReleaseNotes();
  }, [fetchReleaseNotes]);

  useEffect(() => {
    const handleRefresh = () => {
      setRefreshKey((prev) => prev + 1);
    };
    window.addEventListener(APP_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(APP_REFRESH_EVENT, handleRefresh);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      } else if (theme === 'colorful') {
        setResolvedTheme('colorful');
      } else if (theme === 'dark') {
        setResolvedTheme('dark');
      } else {
        setResolvedTheme('light');
      }
    };
    updateResolvedTheme();
    mediaQuery.addEventListener('change', updateResolvedTheme);
    return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateMobileBottomNavMode = () => {
      const isMobile = mediaQuery.matches;
      setIsMobileBottomNavMode(isMobile);
      if (!isMobile) {
        setIsMobileBottomNavVisible(true);
      }
    };
    updateMobileBottomNavMode();
    mediaQuery.addEventListener('change', updateMobileBottomNavMode);
    return () => mediaQuery.removeEventListener('change', updateMobileBottomNavMode);
  }, []);

  useEffect(() => {
    if (!isMobileBottomNavMode) {
      return;
    }
    const scrollContainer = document.querySelector('main.overflow-y-auto') as HTMLElement | null;
    if (!scrollContainer) {
      return;
    }

    lastMainScrollTopRef.current = scrollContainer.scrollTop;

    const handleMainScroll = () => {
      const currentScrollTop = scrollContainer.scrollTop;
      const delta = currentScrollTop - lastMainScrollTopRef.current;

      if (Math.abs(delta) < 8) {
        return;
      }

      if (currentScrollTop <= 8) {
        setIsMobileBottomNavVisible(true);
      } else if (delta > 0) {
        setIsMobileBottomNavVisible(false);
      } else {
        setIsMobileBottomNavVisible(true);
      }

      lastMainScrollTopRef.current = currentScrollTop;
    };

    scrollContainer.addEventListener('scroll', handleMainScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleMainScroll);
  }, [isMobileBottomNavMode]);

  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsMobileBottomNavVisible(true);
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMobileMenuOpen]);

  const handleCloseModal = () => {
    setModalTaskId(null);
  };

  const handleTaskDeleted = (_taskId: string) => {
    setModalTaskId(null);
  };

  const handleCloseRewardModal = () => {
    setViewingRewardId(null);
  }

  const isOwner = user?.role === Role.OWNER;

  const mobileLinks = useMemo(() => {
    const links = [
      { to: '/dashboard', label: 'Medical Dashboard', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241422/dashboard_pvjlbg.png' },
      { to: '/tasks', label: 'Patient Tasks', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241423/task-actions_urhfeq.png' },
      { to: '/kanban', label: 'Patient Board', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241422/kanban_ysnojm.png' },
      // { to: '/reporting', label: 'Reporting', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770343494/report_boqlo0.png' },
      // { to: '/tickets', label: 'Tickets', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770343495/support-ticket_fku5gp.png' },
      { to: '/inbox', label: 'Messages', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770623535/inbox_yds6wp.png' },
      // { to: '/chat', label: 'Chat', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770623577/chat_xsolsd.png' },
      { to: '/calendar', label: 'Appointments', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241422/calendar_xbhksz.png' },
      // { to: '/media', label: 'Media', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241422/Media_Library_em2ky8.png' },
      // { to: '/tool-library', label: 'Tools', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770623739/open-box_ljkslo.png' },
    ];
    if (user?.role === Role.MANAGER || user?.role === Role.ADMIN || user?.role === Role.OWNER) {
      links.push(
        { to: '/admin/users', label: 'Medical Staff', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241423/Users_b58wty.png' },
        { to: '/gantt', label: 'Treatment Timeline', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770343495/gantt-chart_gjwr5s.png' },
        { to: '/reports', label: 'Medical Reports', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770343494/report_boqlo0.png' },
        { to: '/logs', label: 'System Logs', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770623653/log_cbtgmr.png' },
      );
    }
    if (user?.role === Role.OWNER) {
      links.push(
        { to: '/admin/points-table', label: 'Performance Score', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241423/points_jgi3yh.png' },
        /*
        { to: '/template-editor', label: 'Medical Templates', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241423/layout_xgg1fa.png' },
        */
        { to: '/api/overview', label: 'System Integration', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241421/api_bhcggn.png' },
      );
    }
    links.push(
      { to: '/achievements', label: 'Staff Achievements', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241421/achivement_ckvs6i.png' },
      { to: '/levels', label: 'Staff Levels', icon: 'https://res.cloudinary.com/dqhcbck76/image/upload/v1770241421/level-up_l6lcwq.png' },
    );
    return links;
  }, [user]);

  const bottomBarLinks = useMemo(
    () => mobileLinks.filter((link) => ['/dashboard', '/tasks', '/kanban', '/inbox'].includes(String(link.to))),
    [mobileLinks],
  );
  const mobileNavBackgroundClass = resolvedTheme === 'dark'
    ? 'bg-gradient-to-r from-[#0b1220] via-[#0e1628] to-[#05070d]'
    : resolvedTheme === 'colorful'
      ? 'bg-gradient-to-r from-fuchsia-500 via-sky-400 to-violet-500'
      : 'bg-slate-800';

  const handleOpenReleaseNotes = () => {
    setReleaseNotesOpen(true);
    fetchReleaseNotes();
  };

  const handleCloseReleaseNotes = () => {
    setReleaseNotesOpen(false);
  };

  const handleOpenReleaseNotesEditor = () => {
    if (!isOwner) {
      return;
    }
    setReleaseNotesOpen(false);
    setReleaseNotesEditorOpen(true);
    if (!releaseNotes) {
      fetchReleaseNotes();
    }
  };

  const handleCloseReleaseNotesEditor = () => {
    setReleaseNotesEditorOpen(false);
  };

  const handleSupportClick = () => {
    window.open('https://app.zeacrm.com/v2/preview/dSSSBNw1k2w7XTFkClif?notrack=true', '_blank');
  };

  const handleSaveReleaseNotes = async (payload: ReleaseNotesUpdate) => {
    setReleaseNotesSaving(true);
    try {
      const updated = await api.updateReleaseNotes(payload);
      setReleaseNotes(updated);
      setReleaseNotesEditorOpen(false);
      setReleaseNotesOpen(true);
    } catch (error) {
      throw error;
    } finally {
      setReleaseNotesSaving(false);
    }
  };

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col bg-background text-text-primary">
        <Header
          onNotificationClick={(taskId) => taskId && setModalTaskId(taskId)}
          onRewardNotificationClick={(rewardId) => rewardId && setViewingRewardId(rewardId)}
          onSupportClick={handleSupportClick}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden lg:block">
            <Sidebar
              onSupportClick={handleSupportClick}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
              onVersionClick={handleOpenReleaseNotes}
              versionLabel={releaseNotes?.versionLabel}
            />
          </div>
          <main
            key={refreshKey}
            className="flex-1 overflow-x-hidden overflow-y-auto bg-background pt-4 pr-4 pb-24 pl-4 sm:pt-6 sm:pr-6 sm:pb-24 sm:pl-6 lg:p-6"
            style={theme === 'colorful' ? {
              background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57, #ff9ff3, #54a0ff, #5f27cd)',
              backgroundSize: '400% 400%',
              animation: 'colorShift 10s ease infinite'
            } : theme === 'dark' ? {
              background: 'linear-gradient(45deg, #1a1a2e, #16213e, #0f3460, #533483)',
              backgroundSize: '400% 400%',
              animation: 'darkShift 15s ease infinite'
            } : {
              background: '#d40b04ff',
              backgroundSize: '400% 400%',
              animation: 'lightShift 12s ease infinite'

            }
            }
          >
            <style>
              {`
            @keyframes colorShift {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            @keyframes darkShift {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            @keyframes lightShift {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
          `}
            </style>
            {children}
          </main>
        </div>
        <div className="lg:hidden">
          <div className={`mobile-nav-shell ${mobileNavBackgroundClass} ${isMobileBottomNavMode && !isMobileBottomNavVisible ? 'mobile-nav-shell-hidden' : ''}`}>
            {bottomBarLinks.slice(0, 2).map((link) => (
              <NavLink key={String(link.to)} to={link.to} className="mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <img src={link.icon} alt={link.label} className="h-5 w-5" />
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="mobile-nav-center"
              aria-label="Open menu"
            >
              <span className="text-xl">≡</span>
            </button>
            {bottomBarLinks.slice(2, 4).map((link) => (
              <NavLink key={String(link.to)} to={link.to} className="mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <img src={link.icon} alt={link.label} className="h-5 w-5" />
              </NavLink>
            ))}
          </div>
          {isMobileMenuOpen && (
            <div className="mobile-menu-overlay">
              <div className="mobile-menu-card">
                <div className="mobile-menu-header">
                  <span>Pages</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMobileMenuView('grid')}
                      className={`mobile-menu-toggle ${mobileMenuView === 'grid' ? 'mobile-menu-toggle-active' : ''}`}
                    >
                      Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileMenuView('list')}
                      className={`mobile-menu-toggle ${mobileMenuView === 'list' ? 'mobile-menu-toggle-active' : ''}`}
                    >
                      List
                    </button>
                    <button type="button" onClick={() => setMobileMenuOpen(false)} className="mobile-menu-close">
                      Close
                    </button>
                  </div>
                </div>
                <div className={`mobile-menu-grid ${mobileMenuView === 'list' ? 'mobile-menu-grid-list' : ''}`}>
                  {mobileLinks.map((link) => (
                    <NavLink
                      key={String(link.to)}
                      to={link.to}
                      className="mobile-menu-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <img src={link.icon} alt={link.label} className="h-6 w-6" />
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {modalTaskId && (
          <TaskDetailModal
            taskId={modalTaskId}
            isOpen={!!modalTaskId}
            onClose={handleCloseModal}
            usersMap={usersMap}
            onTaskDeleted={handleTaskDeleted}
          />
        )}
        {viewingRewardId && (
          <ClaimedRewardModal
            isOpen={!!viewingRewardId}
            rewardId={viewingRewardId}
            onClose={handleCloseRewardModal}
          />
        )}
        {isReleaseNotesOpen && (
          <ReleaseNotesModal
            isOpen={isReleaseNotesOpen}
            onClose={handleCloseReleaseNotes}
            onEdit={handleOpenReleaseNotesEditor}
            isOwner={!!isOwner}
            isLoading={releaseNotesLoading}
            errorMessage={releaseNotesError}
            releaseNotes={releaseNotes}
          />
        )}
        {isReleaseNotesEditorOpen && (
          <ReleaseNotesEditorModal
            isOpen={isReleaseNotesEditorOpen}
            onClose={handleCloseReleaseNotesEditor}
            onSave={handleSaveReleaseNotes}
            isSaving={releaseNotesSaving}
            releaseNotes={releaseNotes}
          />
        )}
        <Chatbot />
      </div>
    </ToastProvider>
  );
};

export default Layout;
