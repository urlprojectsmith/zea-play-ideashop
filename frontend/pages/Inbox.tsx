import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Notification, NotificationEntityType, NotificationType, Task, User } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useMentionUsers } from '../hooks/useMentionUsers';
import MentionPicker from '../components/ui/MentionPicker';
import { applyMention, extractMentionedUserIds, getMentionMatch, MentionMatch } from '../utils/mentionUtils';
import {
  addMentionNotifications,
  addActivityHistoryEntry,
  deleteLocalNotifications,
  deleteActivityHistoryEntries,
  getLocalNotifications,
  getActivityHistoryEntries,
  markLocalNotificationsRead,
  markActivityHistoryRead,
  ActivityHistoryEntry,
} from '../utils/inboxStore';
import { timeAgo } from '../utils';

type InboxTab = 'notifications' | 'activity-history' | 'ticket-mentions' | 'messaging';

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

const Inbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { users: mentionUsers } = useMentionUsers();
  const [activeTab, setActiveTab] = useState<InboxTab>('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [historyEntries, setHistoryEntries] = useState<ActivityHistoryEntry[]>([]);
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [clinicalTasks, setClinicalTasks] = useState<Task[]>([]);
  const [clinicalTaskId, setClinicalTaskId] = useState<string>('');
  const [clinicalText, setClinicalText] = useState('');
  const [clinicalMention, setClinicalMention] = useState<MentionMatch | null>(null);
  const clinicalTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchNotifications = async () => {
      setLoadingNotifications(true);
      try {
        const data = await api.getNotifications(user.id);
        setNotifications(data);
      } catch (error) {
        console.error('Failed to load notifications', error);
      } finally {
        setLoadingNotifications(false);
      }
    };
    fetchNotifications();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLocalNotifications(getLocalNotifications(user.id));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.getTasks(user.id, user.role)
      .then(setClinicalTasks)
      .catch(() => { });
  }, [user]);

  useEffect(() => {
    setHistoryEntries(getActivityHistoryEntries());
  }, []);

  const allNotifications = useMemo(() => {
    const combined = [...localNotifications, ...notifications];
    return combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [localNotifications, notifications]);

  const ticketMentions = useMemo(
    () => localNotifications.filter((item) => item.type === NotificationType.MENTION && item.entityType === NotificationEntityType.TICKET),
    [localNotifications],
  );

  const markSelectedRead = async () => {
    if (!user || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const localIds = localNotifications.filter((item) => ids.includes(item.id)).map((item) => item.id);
    if (localIds.length) {
      markLocalNotificationsRead(user.id, localIds);
      setLocalNotifications(getLocalNotifications(user.id));
    }
    const apiIds = notifications.filter((item) => ids.includes(item.id)).map((item) => item.id);
    await Promise.all(apiIds.map((id) => api.markNotificationAsRead(user.id, id)));
    setNotifications((prev) => prev.map((item) => (apiIds.includes(item.id) ? { ...item, isRead: true } : item)));
    setSelectedIds(new Set());
  };

  const markAllRead = async () => {
    if (!user) return;
    await api.markAllAsRead(user.id);
    markLocalNotificationsRead(user.id);
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setLocalNotifications(getLocalNotifications(user.id));
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    if (!user || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const localIds = localNotifications.filter((item) => ids.includes(item.id)).map((item) => item.id);
    if (localIds.length) {
      deleteLocalNotifications(user.id, localIds);
      setLocalNotifications(getLocalNotifications(user.id));
    }
    const apiIds = notifications.filter((item) => ids.includes(item.id)).map((item) => item.id);
    apiIds.forEach((id) => api.deleteNotification(id).catch(() => { }));
    setNotifications((prev) => prev.filter((item) => !apiIds.includes(item.id)));
    setSelectedIds(new Set());
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!user) return;
    if (notification.deepLink) {
      navigate(normalizeTaskDeepLink(notification.deepLink));
    }
    if (!notification.isRead) {
      if (notification.source === 'local') {
        markLocalNotificationsRead(user.id, [notification.id]);
        setLocalNotifications(getLocalNotifications(user.id));
      } else {
        api.markNotificationAsRead(user.id, notification.id).catch(() => { });
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
        );
      }
    }
  };

  const handleClinicalTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setClinicalText(nextValue);
    const cursor = event.target.selectionStart ?? nextValue.length;
    setClinicalMention(getMentionMatch(nextValue, cursor));
  };

  const handleClinicalMentionSelect = (selectedUser: User) => {
    if (!clinicalMention) return;
    const mentionLabel = selectedUser.name.replace(/\s+/g, '');
    const nextValue = applyMention(clinicalText, clinicalMention, mentionLabel);
    setClinicalText(nextValue);
    setClinicalMention(null);
    requestAnimationFrame(() => {
      if (!clinicalTextareaRef.current) return;
      const cursorPosition = clinicalMention.start + mentionLabel.length + 2;
      clinicalTextareaRef.current.focus();
      clinicalTextareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const handleHistorySubmit = () => {
    if (!user || !clinicalText.trim()) return;
    const task = clinicalTasks.find((entry) => entry.id === clinicalTaskId);
    const mentioned = extractMentionedUserIds(clinicalText.trim(), mentionUsers).filter((id) => id !== user.id);
    const entry = addActivityHistoryEntry({
      taskId: clinicalTaskId || null,
      taskTitle: task?.title ?? null,
      authorId: user.id,
      authorName: user.name,
      message: clinicalText.trim(),
      mentions: mentioned,
    });
    if (mentioned.length) {
      addMentionNotifications({
        authorName: user.name,
        mentionedUserIds: mentioned,
        message: clinicalText.trim(),
        entityType: NotificationEntityType.TASK,
        entityId: clinicalTaskId || entry.id,
        deepLink: clinicalTaskId ? `/tasks/${clinicalTaskId}` : '/tasks',
      });
      setLocalNotifications(getLocalNotifications(user.id));
    }
    setHistoryEntries((prev) => [entry, ...prev]);
    setClinicalText('');
    setClinicalTaskId('');
  };

  const markHistoryRead = () => {
    if (historySelectedIds.size === 0) return;
    markActivityHistoryRead(Array.from(historySelectedIds));
    setHistoryEntries(getActivityHistoryEntries());
    setHistorySelectedIds(new Set());
  };

  const deleteHistorySelected = () => {
    if (historySelectedIds.size === 0) return;
    deleteActivityHistoryEntries(Array.from(historySelectedIds));
    setHistoryEntries(getActivityHistoryEntries());
    setHistorySelectedIds(new Set());
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1f2937] mb-1">Inbox</h1>
        <p className="text-sm text-gray-500">Notifications, mentions, and activity history.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {(['notifications', 'activity-history', 'ticket-mentions', 'messaging'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors border flex-1 sm:flex-none text-center ${activeTab === tab
              ? 'bg-[#eef2ff] border-[#6366f1] text-[#3730a3]'
              : 'border-[#e5e7eb] bg-white text-gray-600 hover:bg-[#f9fafb]'
              }`}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 mb-4">
            <button
              type="button"
              onClick={markSelectedRead}
              className="w-full sm:w-auto rounded-md border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#f9fafb] transition-colors"
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={markAllRead}
              className="w-full sm:w-auto rounded-md border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#f9fafb] transition-colors"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              className="w-full sm:w-auto rounded-md border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-[#f9fafb] transition-colors"
            >
              Delete
            </button>
          </div>

          {loadingNotifications && (
            <div className="flex items-center justify-center rounded-xl border border-gray-200/60 bg-white/70 py-10 dark:border-gray-700/60 dark:bg-gray-900/60">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          )}

          {!loadingNotifications && allNotifications.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
              No notifications yet.
            </div>
          )}

          {!loadingNotifications && allNotifications.length > 0 && (
            <div className="space-y-4">
              {allNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start gap-4 rounded-lg border border-[#e5e7eb] bg-white p-4 sm:p-5 transition-colors"
                >
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(notification.id)}
                      onChange={(event) => {
                        const next = new Set(selectedIds);
                        if (event.target.checked) next.add(notification.id);
                        else next.delete(notification.id);
                        setSelectedIds(next);
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium text-gray-800 break-words">
                      {notification.title || notification.message}
                    </p>
                    {notification.body && (
                      <p className="mt-1 text-sm text-gray-600 break-words">{notification.body}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity-history' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 sm:p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-800 mb-4">New Activity Record</p>
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <select
                value={clinicalTaskId}
                onChange={(event) => setClinicalTaskId(event.target.value)}
                className="w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none"
              >
                <option value="">Select task...</option>
                {clinicalTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleHistorySubmit}
                className="w-full sm:w-auto rounded-md bg-[#6366f1] px-6 py-2 text-sm font-medium text-white hover:bg-[#5850ec] transition-colors"
              >
                Post update
              </button>
            </div>
            <div className="relative mt-4">
              <textarea
                ref={clinicalTextareaRef}
                value={clinicalText}
                onChange={handleClinicalTextChange}
                rows={3}
                placeholder="Share a clinical update and @mention teammates..."
                className="w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none"
              />
              <MentionPicker
                users={mentionUsers}
                query={clinicalMention?.query ?? ''}
                isOpen={!!clinicalMention}
                onSelect={handleClinicalMentionSelect}
                onClose={() => setClinicalMention(null)}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={markHistoryRead}
              className="w-full sm:w-auto rounded-md border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[#f9fafb] transition-colors"
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={deleteHistorySelected}
              className="w-full sm:w-auto rounded-md border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-[#f9fafb] transition-colors"
            >
              Delete
            </button>
          </div>

          {historyEntries.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
              No history entries yet.
            </div>
          )}

          <div className="space-y-4">
            {historyEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 rounded-lg border border-[#e5e7eb] bg-white p-4 sm:p-5 transition-colors"
              >
                <div className="flex-shrink-0 pt-1">
                  <input
                    type="checkbox"
                    checked={historySelectedIds.has(entry.id)}
                    onChange={(event) => {
                      const next = new Set(historySelectedIds);
                      if (event.target.checked) next.add(entry.id);
                      else next.delete(entry.id);
                      setHistorySelectedIds(next);
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 break-words">
                    {entry.taskTitle || 'General update'}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 break-words">{entry.message}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    {entry.authorName} - {timeAgo(entry.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ticket-mentions' && (
        <div className="space-y-4">
          {ticketMentions.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
              No ticket mentions yet.
            </div>
          )}
          {ticketMentions.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className="w-full rounded-lg border border-[#e5e7eb] bg-white p-4 sm:p-5 text-left hover:bg-[#f9fafb] transition-colors min-w-0"
            >
              <p className="text-sm font-medium text-gray-800 break-words">
                {notification.title || notification.message}
              </p>
              {notification.body && (
                <p className="mt-1 text-sm text-gray-600 break-words">{notification.body}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                {timeAgo(notification.createdAt)}
              </p>
            </button>
          ))}
        </div>
      )}

      {activeTab === 'messaging' && (
        <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          Messaging channels will appear here soon.
        </div>
      )}
    </div>
  );
};

export default Inbox;
