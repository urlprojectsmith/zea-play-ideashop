import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Role } from '../types';
import api from '../services/mockApi';
import { getAccessToken } from '../services/tokenStorage';
import { syncBrowserPushSubscription } from '../services/browserPush';

const CACHED_USER_KEY = 'vee_cached_user';

const normalizeTaskDeepLink = (deepLink: string): string => {
  const normalized = deepLink.startsWith('/') ? deepLink : `/${deepLink}`;
  const [pathname, search = ''] = normalized.split('?');
  const match = pathname.match(/^\/(?:admin|dashboard)\/tasks\/([^/]+)$/);
  if (match) {
    return `/tasks/${match[1]}${search ? `?${search}` : ''}`;
  }
  if (pathname === '/admin/tasks' || pathname === '/dashboard/tasks') {
    return `/tasks${search ? `?${search}` : ''}`;
  }
  return normalized;
};

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(CACHED_USER_KEY);
      return;
    }
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
  }
}

// Auth Context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  updateUserInContext: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('useAuth.tsx: AuthProvider rendering');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const playPushSound = useCallback(() => {
    try {
      const AudioContextRef = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextRef) return;
      const context = new AudioContextRef();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
      oscillator.onended = () => {
        context.close().catch(() => {});
      };
    } catch (error) {
      console.warn('Unable to play push sound', error);
    }
  }, []);

  useEffect(() => {
    console.log('useAuth.tsx: AuthProvider useEffect running');
    const checkLoggedIn = async () => {
      console.log('useAuth.tsx: Checking if user is logged in');
      setLoading(true);
      try {
        if (!getAccessToken()) {
          setUser(null);
          writeCachedUser(null);
          setLoading(false);
          return;
        }
        const cachedUser = readCachedUser();
        if (cachedUser) {
          setUser(cachedUser);
        }
        const currentUser = await api.getCurrentUser();
        console.log('useAuth.tsx: Current user fetched:', currentUser);
        if (currentUser) {
          setUser(currentUser);
          writeCachedUser(currentUser);
        } else if (!cachedUser) {
          setUser(null);
        }
      } catch (error) {
        console.error('useAuth.tsx: Error fetching current user:', error);
        const cachedUser = readCachedUser();
        setUser(cachedUser);
      } finally {
        setLoading(false);
      }
    };
    checkLoggedIn();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    syncBrowserPushSubscription(user).catch((error) => {
      console.warn('Unable to sync browser push subscription', error);
    });
  }, [user?.id, user?.browserNotificationsEnabled]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event?.data as { type?: string; deepLink?: string } | undefined;
      if (!data?.type) {
        return;
      }
      if (data.type === 'BROWSER_PUSH_SOUND') {
        playPushSound();
      }
      if (data.type === 'BROWSER_PUSH_NAVIGATE' && data.deepLink) {
        const normalized = normalizeTaskDeepLink(data.deepLink);
        navigate(normalized);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handler);
    };
  }, [navigate, playPushSound]);
  
  const login = useCallback(async (email: string, pass: string) => {
    const loggedInUser = await api.login(email, pass);
    setUser(loggedInUser);
    writeCachedUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
    writeCachedUser(null);
    navigate('/login');
  }, [navigate]);

  const updateUserInContext = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    writeCachedUser(updatedUser);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, updateUserInContext }), [user, loading, login, logout, updateUserInContext]);

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
            <p className="mt-4 text-text-secondary">Loading...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


// Search Context
interface SearchContextType {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    debouncedSearchQuery: string;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300); // 300ms debounce delay

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);

    return (
        <SearchContext.Provider value={{ searchQuery, setSearchQuery, debouncedSearchQuery }}>
            {children}
        </SearchContext.Provider>
    );
};

export const useSearch = () => {
    const context = useContext(SearchContext);
    if (context === undefined) {
        throw new Error('useSearch must be used within a SearchProvider');
    }
    return context;
};

// Theme Context
type Theme = 'light' | 'dark' | 'colorful' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const storedTheme = localStorage.getItem('zenith-task-theme') as Theme | null;
        return storedTheme || 'light';
    });

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('zenith-task-theme', newTheme);
    };

    useEffect(() => {
        const root = window.document.documentElement;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            const prefersDark = mediaQuery.matches;
            const resolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
            const useColorful = resolvedTheme === 'colorful';
            const useDark = resolvedTheme === 'dark';

            if (useColorful) {
                root.classList.add('theme-colorful');
                root.classList.remove('dark');
            } else {
                root.classList.remove('theme-colorful');
                root.classList.toggle('dark', useDark);
                if (!useDark) {
                    root.classList.remove('dark');
                }
            }
        };

        applyTheme();

        const handleChange = () => {
            if (theme === 'system') {
                applyTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);

    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        console.warn('useTheme used without ThemeProvider; falling back to dark theme.');
        return {
            theme: 'dark' as Theme,
            setTheme: () => {},
        };
    }
    return context;
};


