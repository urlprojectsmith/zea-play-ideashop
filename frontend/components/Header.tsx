import React, { useState, useRef, useEffect, useCallback } from 'react';
import TaskDocumentation from './TaskDocumentation';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../hooks/useAuth';
import api from '../services/mockApi';
import { timeAgo } from '../utils';
import { getUserAvatarUrl } from '../utils/userAvatar';
import {
  UserIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  UserCircleIcon,
  BellIcon,
  CheckCircleIcon,
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  TrophyIcon,
  GiftIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  ArrowPathIcon,
  Bars3Icon,
} from './icons';
import { Notification, NotificationType } from '../types';
import NotificationDetailModal from './NotificationDetailModal';
import { APP_REFRESH_EVENT } from '../utils/appEvents';

// ✅ NEW IMPORT
import ClockButton from './ClockAssistant/ClockButton';

const notificationIconMap: Record<NotificationType, React.FC<React.SVGProps<SVGSVGElement>>> = {
  [NotificationType.TASK_ASSIGNED]: UserCircleIcon,
  [NotificationType.TASK_COMPLETED]: CheckCircleIcon,
  [NotificationType.TASK_OVERDUE]: BellIcon,
  [NotificationType.COMMENT_ADDED]: ChatBubbleLeftEllipsisIcon,
  [NotificationType.ACHIEVEMENT_UNLOCKED]: TrophyIcon,
  [NotificationType.REWARD_CLAIMED]: GiftIcon,
  [NotificationType.TICKET_CREATED]: BellIcon,
  [NotificationType.TICKET_ASSIGNED]: UserCircleIcon,
  [NotificationType.TICKET_CLOSED]: CheckCircleIcon,
  [NotificationType.APPROVAL_REQUESTED]: BellIcon,
  [NotificationType.APPROVAL_ACTED]: CheckCircleIcon,
  [NotificationType.SLA_BREACH]: BellIcon,
  [NotificationType.MENTION]: ChatBubbleLeftEllipsisIcon,
};

const notificationAccentMap: Record<NotificationType, { icon: string; ring: string; glow: string; bg: string }> = {
  [NotificationType.TASK_ASSIGNED]: {
    icon: 'text-emerald-400',
    ring: 'border-emerald-400/40',
    glow: 'shadow-[0_0_12px_rgba(34,197,94,0.45)]',
    bg: 'bg-emerald-500/10',
  },
  [NotificationType.TASK_COMPLETED]: {
    icon: 'text-emerald-400',
    ring: 'border-emerald-400/40',
    glow: 'shadow-[0_0_12px_rgba(34,197,94,0.45)]',
    bg: 'bg-emerald-500/10',
  },
  [NotificationType.TASK_OVERDUE]: {
    icon: 'text-amber-300',
    ring: 'border-amber-300/40',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.45)]',
    bg: 'bg-amber-500/10',
  },
  [NotificationType.COMMENT_ADDED]: {
    icon: 'text-fuchsia-400',
    ring: 'border-fuchsia-400/40',
    glow: 'shadow-[0_0_12px_rgba(217,70,239,0.45)]',
    bg: 'bg-fuchsia-500/10',
  },
  [NotificationType.ACHIEVEMENT_UNLOCKED]: {
    icon: 'text-amber-300',
    ring: 'border-amber-300/40',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.45)]',
    bg: 'bg-amber-500/10',
  },
  [NotificationType.REWARD_CLAIMED]: {
    icon: 'text-amber-300',
    ring: 'border-amber-300/40',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.45)]',
    bg: 'bg-amber-500/10',
  },
  [NotificationType.TICKET_CREATED]: {
    icon: 'text-sky-300',
    ring: 'border-sky-300/40',
    glow: 'shadow-[0_0_12px_rgba(56,189,248,0.45)]',
    bg: 'bg-sky-500/10',
  },
  [NotificationType.TICKET_ASSIGNED]: {
    icon: 'text-sky-300',
    ring: 'border-sky-300/40',
    glow: 'shadow-[0_0_12px_rgba(56,189,248,0.45)]',
    bg: 'bg-sky-500/10',
  },
  [NotificationType.TICKET_CLOSED]: {
    icon: 'text-emerald-400',
    ring: 'border-emerald-400/40',
    glow: 'shadow-[0_0_12px_rgba(34,197,94,0.45)]',
    bg: 'bg-emerald-500/10',
  },
  [NotificationType.APPROVAL_REQUESTED]: {
    icon: 'text-sky-300',
    ring: 'border-sky-300/40',
    glow: 'shadow-[0_0_12px_rgba(56,189,248,0.45)]',
    bg: 'bg-sky-500/10',
  },
  [NotificationType.APPROVAL_ACTED]: {
    icon: 'text-emerald-400',
    ring: 'border-emerald-400/40',
    glow: 'shadow-[0_0_12px_rgba(34,197,94,0.45)]',
    bg: 'bg-emerald-500/10',
  },
  [NotificationType.SLA_BREACH]: {
    icon: 'text-rose-400',
    ring: 'border-rose-400/40',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.45)]',
    bg: 'bg-rose-500/10',
  },
  [NotificationType.MENTION]: {
    icon: 'text-fuchsia-400',
    ring: 'border-fuchsia-400/40',
    glow: 'shadow-[0_0_12px_rgba(217,70,239,0.45)]',
    bg: 'bg-fuchsia-500/10',
  },
};

const fallbackNotificationAccent = {
  icon: 'text-slate-300',
  ring: 'border-white/10',
  glow: 'shadow-none',
  bg: 'bg-white/5',
};

const countryTimezones = {
  "United States": "America/New_York",
  "United Kingdom": "Europe/London",
  "India": "Asia/Kolkata",
  "Australia": "Australia/Sydney",
  "Japan": "Asia/Tokyo",
  "Germany": "Europe/Berlin",
  "France": "Europe/Paris",
  "Canada": "America/Toronto",
  "Brazil": "America/Sao_Paulo",
  "China": "Asia/Shanghai",
  "Singapore": "Asia/Singapore",
  "UAE": "Asia/Dubai",
  "South Africa": "Africa/Johannesburg",
  "Italy": "Europe/Rome",
  "Spain": "Europe/Madrid",
  "Netherlands": "Europe/Amsterdam",
  "Switzerland": "Europe/Zurich",
  "Sweden": "Europe/Stockholm",
  "Norway": "Europe/Oslo",
  "Denmark": "Europe/Copenhagen",
  "Finland": "Europe/Helsinki",
  "Russia": "Europe/Moscow",
  "Turkey": "Europe/Istanbul",
  "Saudi Arabia": "Asia/Riyadh",
  "Egypt": "Africa/Cairo",
  "Mexico": "America/Mexico_City",
  "Argentina": "America/Argentina/Buenos_Aires",
  "Chile": "America/Santiago",
  "New Zealand": "Pacific/Auckland",
  "South Korea": "Asia/Seoul",
  "Thailand": "Asia/Bangkok",
  "Vietnam": "Asia/Ho_Chi_Minh",
  "Philippines": "Asia/Manila",
  "Malaysia": "Asia/Kuala_Lumpur",
  "Pakistan": "Asia/Karachi",
  "Bangladesh": "Asia/Dhaka",
  "Sri Lanka": "Asia/Colombo",
  "Nepal": "Asia/Kathmandu",
  "Qatar": "Asia/Qatar",
  "Kuwait": "Asia/Kuwait",
  "Oman": "Asia/Muscat",
  "Iran": "Asia/Tehran",
  "Iraq": "Asia/Baghdad",
  "Poland": "Europe/Warsaw",
  "Portugal": "Europe/Lisbon",
  "Greece": "Europe/Athens",
  "Ireland": "Europe/Dublin",
};

const THEME_SEQUENCE = ['light', 'dark', 'colorful'] as const;

const themePresentation = {
  light: {
    label: 'Light',
    icon: (
      <img
        src="https://res.cloudinary.com/dqhcbck76/image/upload/v1770343928/moon_ywhmbz.png"
        alt="Light mode"
        className="h-6 w-6 object-contain"
      />
    ),
    className: 'bg-slate-800 text-white border border-slate-700 hover:bg-slate-700',
  },
  dark: {
    label: 'Dark',
    icon: (
      <img
        src="https://res.cloudinary.com/dqhcbck76/image/upload/v1770343927/moon_3_gy8i0p.png"
        alt="Dark mode"
        className="h-6 w-6 object-contain"
      />
    ),
    className: 'bg-slate-900/70 text-text-primary border border-slate-600 hover:border-slate-400',
  },
  colorful: {
    label: 'Colorful',
    icon: (
      <img
        src="https://res.cloudinary.com/dqhcbck76/image/upload/v1770343927/moon_1_okpfg0.png"
        alt="Colorful mode"
        className="h-6 w-6 object-contain"
      />
    ),
    className: 'bg-gradient-to-r from-fuchsia-500 via-sky-400 to-violet-500 text-text-inverted border border-transparent shadow-lg hover:shadow-xl',
  },
};

const Header = ({ onNotificationClick, onRewardNotificationClick, onSupportClick }) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const profileAvatar = getUserAvatarUrl(user);

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [resolvedTheme, setResolvedTheme] = useState('light');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isMobileCollapseView, setIsMobileCollapseView] = useState(false);

  const [currentTime, setCurrentTime] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [is12Hour, setIs12Hour] = useState(true);
  const [notificationPreviewOpen, setNotificationPreviewOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const profileDropdownRef = useRef(null);
  const notificationDropdownRef = useRef(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const mobileMenuRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  const mobileProfileRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const userNotifications = await api.getNotifications(user.id);
      setNotifications(userNotifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () => {
      if (theme === 'system') setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      else setResolvedTheme(theme);
    };
    updateResolvedTheme();
    mediaQuery.addEventListener('change', updateResolvedTheme);
    return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateMobileView = () => setIsMobileView(mediaQuery.matches);
    updateMobileView();
    mediaQuery.addEventListener('change', updateMobileView);
    return () => mediaQuery.removeEventListener('change', updateMobileView);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateMobileCollapseView = () => setIsMobileCollapseView(mediaQuery.matches);
    updateMobileCollapseView();
    mediaQuery.addEventListener('change', updateMobileCollapseView);
    return () => mediaQuery.removeEventListener('change', updateMobileCollapseView);
  }, []);

  const handleThemeToggle = () => {
    const activeTheme = theme === 'system' ? resolvedTheme : theme;
    const currentIndex = THEME_SEQUENCE.indexOf(activeTheme as any);
    setTheme(THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length]);
  };

  const { label: themeLabel, icon: themeIcon, className: themeClassName } = themePresentation[resolvedTheme];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target))
        setProfileDropdownOpen(false);
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target))
        setNotificationDropdownOpen(false);
      if (
        mobileMenuOpen &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target) &&
        mobileMenuButtonRef.current &&
        !mobileMenuButtonRef.current.contains(event.target)
      ) {
        setMobileMenuOpen(false);
      }
      if (
        mobileProfileOpen &&
        mobileProfileRef.current &&
        !mobileProfileRef.current.contains(event.target)
      ) {
        setMobileProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen, mobileProfileOpen]);

  useEffect(() => {
    if (!isMobileView) {
      setMobileMenuOpen(false);
      setMobileProfileOpen(false);
    }
  }, [isMobileView]);

  const triggerRefresh = useCallback(() => {
    fetchNotifications();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(APP_REFRESH_EVENT));
    }
    setIsRefreshing(true);
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      setIsRefreshing(false);
    }, 900);
  }, [fetchNotifications]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleString('en-US', {
        timeZone: countryTimezones[selectedCountry],
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: is12Hour,
      });
      setCurrentTime(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [selectedCountry, is12Hour]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileCollapseView) {
      setIsHeaderVisible(true);
      return;
    }

    const scrollContainer = document.querySelector('main.overflow-y-auto') as HTMLElement | null;
    if (!scrollContainer) return;

    lastScrollTopRef.current = scrollContainer.scrollTop;

    const handleScroll = () => {
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollDelta = currentScrollTop - lastScrollTopRef.current;

      if (Math.abs(scrollDelta) < 8) return;

      if (currentScrollTop <= 8) {
        setIsHeaderVisible(true);
      } else if (scrollDelta > 0) {
        setIsHeaderVisible(false);
      } else {
        setIsHeaderVisible(true);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isMobileCollapseView]);

  const handleLogout = () => {
    logout();
  };

  const handleDeleteNotification = async (notificationId: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
    if (selectedNotification?.id === notificationId) {
      setSelectedNotification(null);
      setNotificationPreviewOpen(false);
    }
    try {
      await api.deleteNotification(notificationId);
    } catch (error) {
      console.error('Failed to delete notification:', error);
      fetchNotifications();
    }
  };

  const closeNotificationPreview = () => {
    setNotificationPreviewOpen(false);
    setSelectedNotification(null);
  };

  const handleNotificationItemClick = async (notification: Notification) => {
    setNotificationDropdownOpen(false);
    let handled = false;

    if (notification.relatedRewardId && onRewardNotificationClick) {
      onRewardNotificationClick(notification.relatedRewardId);
      handled = true;
    } else if (notification.relatedTaskId && onNotificationClick) {
      onNotificationClick(notification.relatedTaskId);
      handled = true;
    } else if (notification.type === NotificationType.ACHIEVEMENT_UNLOCKED) {
      navigate('/achievements');
      handled = true;
    }

    if (!handled) {
      setSelectedNotification(notification);
      setNotificationPreviewOpen(true);
    }

    setNotifications((prev) =>
      prev.map((notif) => (notif.id === notification.id ? { ...notif, isRead: true } : notif))
    );

    if (user) {
      try {
        await api.markNotificationAsRead(user.id, notification.id);
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const expandedHeaderHeightClass = isMobileView ? 'h-[64px]' : 'h-[72px]';
  const shouldCollapseHeader = isMobileCollapseView;
  const headerHeightClass = shouldCollapseHeader
    ? (isHeaderVisible ? 'h-[64px] border-b border-border-color/60' : 'h-0 border-b border-transparent')
    : `${expandedHeaderHeightClass} border-b border-border-color/60`;
  const headerInnerClass = shouldCollapseHeader
       ? `relative z-10 h-full overflow-hidden transition-opacity duration-200 ${isHeaderVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`
    : 'relative z-10 h-full overflow-visible';
  return (
    <header
      className={`sticky top-0 z-[70] overflow-visible transition-[border-color,box-shadow,background-color,color] duration-300 ease-out ${headerHeightClass} ${resolvedTheme === 'dark'
        ? 'bg-gradient-to-r from-[#0b1220] via-[#0e1628] to-[#05070d] text-text-primary shadow-[0_10px_30px_rgba(2,6,23,0.55),0_1px_0_0_rgba(56,189,248,0.35)]'
        : resolvedTheme === 'colorful'
          ? 'bg-gradient-to-r from-fuchsia-500 via-sky-400 to-violet-500 text-text-primary shadow-[0_10px_30px_rgba(2,6,23,0.35)]'
          : 'bg-slate-800 text-white shadow-[0_10px_30px_rgba(15,23,42,0.3)]'
        } ${shouldCollapseHeader && !isHeaderVisible ? 'shadow-none' : ''}`}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <video
          className="h-full w-full object-cover opacity-30"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          <source src="" type="video/mp4" />
        </video>
      </div>
      <div className={headerInnerClass}>
        {isMobileView ? (
          <div className="h-full px-3.5 sm:px-4">
            <div className="flex h-full items-center justify-between">
            <img
              src="https://storage.googleapis.com/msgsndr/bsexF0htDBOfNeCh7844/media/6971f5bb4a646444cb4b5be4.png"
              alt="Zea.Play"
              className="h-8 w-auto object-contain"
            />
            <div className="relative" ref={mobileProfileRef}>
              <button
                type="button"
                onClick={() => setMobileProfileOpen(!mobileProfileOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border-color bg-white/10 text-current transition-colors hover:bg-white/20"
                aria-label="Open profile menu"
              >
                <UserCircleIcon className="h-4 w-4" />
              </button>
              {mobileProfileOpen && (
                <div
                  className="fixed inset-0 z-[120] bg-black/20"
                  onClick={() => setMobileProfileOpen(false)}
                >
                  <div className="absolute right-3 top-[64px] sm:right-4">
                    <div
                      className="w-56 rounded-2xl border border-border-color bg-surface shadow-2xl p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        to="/settings"
                        onClick={() => setMobileProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-white/10 rounded-xl transition"
                      >
                        <UserCircleIcon className="h-5 w-5" />
                        Go to Profile
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileProfileOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                      >
                        <ArrowRightOnRectangleIcon className="h-5 w-5" />
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        ) : (
        <div className="h-full px-4 lg:px-5">
          <div className="relative z-10 flex h-full items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-3">
            <img
              src="https://storage.googleapis.com/msgsndr/bsexF0htDBOfNeCh7844/media/6971f5bb4a646444cb4b5be4.png"
              alt="Zea.Play"
              className="h-8 w-auto origin-left object-contain drop-shadow-[0_6px_20px_rgba(250,204,21,0.35)]"
            />
          </div>

          {/* RIGHT: TIME + DROPDOWNS */}
          <div className="flex items-center gap-2 lg:gap-3">
            {/* ⏰ Clock Fixed to India */}
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-sky-400/25 bg-slate-950/60 px-3 py-1.5 font-mono text-sm tracking-[0.2em] text-text-inverted dark:text-text-primary shadow-[0_0_12px_rgba(56,189,248,0.2)]">
                {currentTime}
              </div>
            </div>

            <button
              type="button"
              onClick={triggerRefresh}
              className="group flex items-center gap-2 rounded-full border border-sky-400/30 bg-slate-950/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-text-inverted dark:text-text-primary shadow-[0_0_16px_rgba(56,189,248,0.2)] transition hover:scale-[1.03] hover:border-amber-300/50 hover:text-text-accent"
              title="Refresh data"
            >
              <ArrowPathIcon className={`h-4 w-4 text-text-accent transition-transform duration-200 group-hover:rotate-180 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <div className="h-1" />


            {/* 🔔 Notifications */}
            <div className="relative" ref={notificationDropdownRef}>
              <button
                onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                className="relative rounded-full border border-sky-400/25 bg-slate-950/60 p-2 text-text-inverted dark:text-text-primary shadow-[0_0_10px_rgba(56,189,248,0.18)] transition hover:scale-[1.03] hover:border-amber-300/50"
              >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-amber-300"></span>
                )}
              </button>
              {notificationDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border backdrop-blur z-[80] shadow-2xl transition-all duration-300 ${resolvedTheme === 'dark'
                  ? 'border-sky-400/40 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 shadow-[0_20px_60px_rgba(56,189,248,0.25)]'
                  : resolvedTheme === 'colorful'
                    ? 'border-white/40 bg-white/95 shadow-[0_20px_60px_rgba(139,92,246,0.25)]'
                    : 'border-orange-200 bg-white/95 shadow-[0_20px_60px_rgba(251,191,36,0.15)]'
                  }`}>
                  <div className={`p-3 border-b flex justify-between items-center ${resolvedTheme === 'dark'
                    ? 'border-sky-400/30 bg-gradient-to-r from-sky-500/10 via-fuchsia-500/10 to-indigo-500/10'
                    : resolvedTheme === 'colorful'
                      ? 'border-fuchsia-200 bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10'
                      : 'border-orange-100 bg-gradient-to-r from-amber-50 to-orange-50'
                    }`}>
                    <h3 className={`font-semibold ${resolvedTheme === 'dark' ? 'text-text-primary' : 'text-slate-900'}`}>Notifications</h3>
                  </div>
                  {notifications.length ? (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationItemClick(notif)}
                        className={`p-3 flex items-start gap-3 border-b last:border-0 cursor-pointer relative transition ${resolvedTheme === 'dark'
                          ? 'border-sky-400/20 hover:bg-sky-500/10'
                          : resolvedTheme === 'colorful'
                            ? 'border-fuchsia-100 hover:bg-fuchsia-50'
                            : 'border-orange-50 hover:bg-orange-50/50'
                          }`}
                      >
                        {(() => {
                          const Icon = notificationIconMap[notif.type] ?? BellIcon;
                          const accent = notificationAccentMap[notif.type] ?? fallbackNotificationAccent;
                          const isUnread = !notif.isRead;
                          return (
                            <div
                              className={`flex h-9 w-9 items-center justify-center rounded-full border bg-slate-900/70 ${isUnread ? `${accent.ring} ${accent.glow} ${accent.bg}` : 'border-white/10 shadow-none'
                                }`}
                            >
                              <Icon className={`h-5 w-5 ${isUnread ? accent.icon : 'text-text-muted'}`} />
                            </div>
                          );
                        })()}
                        <div className="flex-1">
                          <p className={`text-sm ${notif.isRead
                            ? (resolvedTheme === 'dark' ? 'text-text-muted' : 'text-slate-400')
                            : (resolvedTheme === 'dark' ? 'text-text-primary' : 'text-slate-900')
                            }`}>
                            {notif.message}
                          </p>
                          <p className={`text-xs mt-1 ${resolvedTheme === 'dark' ? 'text-text-muted' : 'text-slate-500'}`}>{timeAgo(notif.createdAt)}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNotification(notif.id);
                          }}
                          className={`p-1.5 rounded-full border transition-colors ${resolvedTheme === 'dark'
                            ? 'border-sky-400/30 bg-slate-900/70 text-text-inverted hover:border-rose-400/60 hover:text-text-warning'
                            : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-rose-400/60 hover:text-rose-500 hover:bg-rose-50'
                            }`}
                          title="Delete notification"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-text-muted">No new notifications.</p>
                  )}
                </div>
              )}
            </div>

            {/* 👤 Profile */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-sky-400/25 bg-slate-950/60 px-2 py-1 text-text-inverted dark:text-text-primary shadow-[0_0_12px_rgba(56,189,248,0.2)] transition hover:scale-[1.03] hover:border-amber-300/50"
              >
                <div className="relative">
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt="Profile"
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-amber-300/60 shadow-[0_0_12px_rgba(250,204,21,0.4)]"
                    />
                  ) : (
                    <UserIcon className="h-7 w-7 text-text-accent" />
                  )}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-xs font-semibold leading-tight sm:text-sm">{user?.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-text-inverted opacity-70 dark:text-text-secondary leading-tight">{user?.role}</span>
                </div>
              </button>
              {profileDropdownOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setProfileDropdownOpen(false)}>
                  <div className="w-full max-w-[300px] bg-white rounded-2xl border border-orange-200 shadow-2xl p-1 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="px-4 py-4 border-b border-orange-100 flex justify-between items-center bg-orange-50/30">
                      <div className="flex flex-col">
                        <p className="text-base font-bold text-slate-900">{user?.name}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{user?.email}</p>
                      </div>
                      <button onClick={() => setProfileDropdownOpen(false)} className="p-2 hover:bg-orange-100/50 rounded-full text-slate-400 transition-colors">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="p-2">
                      <Link
                        to="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center px-4 py-3 text-sm text-slate-700 hover:bg-orange-50 rounded-xl transition-colors"
                      >
                        <UserCircleIcon className="h-5 w-5 mr-3 text-orange-400" />
                        My Profile
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center px-4 py-3 text-sm text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      >
                        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}
      </div>
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={notificationPreviewOpen}
        onClose={closeNotificationPreview}
      />
    </header>
  );
};

export default Header;
