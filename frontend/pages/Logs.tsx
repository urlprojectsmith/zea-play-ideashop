import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AuditLog, AuditRetentionConfig, CUSTOM_STATUS_NAMES, Role, TaskStatus, User } from '../types';
import { formatDate, timeAgo } from '../utils';
import { useAuth } from '../hooks/useAuth';

type TabKey =
  | 'all'
  | 'user'
  | 'task'
  | 'ticket'
  | 'approval'
  | 'automation'
  | 'security'
  | 'failed';

const TAB_CONFIG: Record<TabKey, { label: string; categories?: string[]; status?: string[] }> = {
  all: { label: 'All Logs' },
  user: { label: 'User Logs', categories: ['user'] },
  task: { label: 'Task Logs', categories: ['task'] },
  ticket: { label: 'Ticket Logs', categories: ['ticket'] },
  approval: { label: 'Approval Logs', categories: ['approval'] },
  automation: { label: 'Automation Logs', categories: ['automation'] },
  security: { label: 'Security Logs', categories: ['security'] },
  failed: { label: 'Failed Only', status: ['failed'] },
};

const SEVERITY_OPTIONS = ['info', 'warning', 'critical'];
const SOURCE_OPTIONS = ['manual', 'automation', 'api', 'system'];
const STATUS_OPTIONS = ['success', 'failed'];
const ENTITY_OPTIONS = ['user', 'task', 'ticket', 'workflow', 'approval', 'notification', 'system'];

const PAGE_SIZE = 50;

const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const formatLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatStatusValue = (value: string) => {
  const key = value as TaskStatus;
  if (CUSTOM_STATUS_NAMES[key]) {
    return CUSTOM_STATUS_NAMES[key].name;
  }
  return formatLabel(value);
};

const formatValue = (key: string, value: unknown, userMap: Map<string, User>) => {
  if (value === null || value === undefined || value === '') return 'None';

  if (key === 'status' && typeof value === 'string') {
    return formatStatusValue(value);
  }
  if (key === 'priority' && typeof value === 'string') {
    return formatLabel(value);
  }
  if (key.endsWith('_id') && typeof value === 'string') {
    const user = userMap.get(value);
    if (user) return user.name || user.email || value;
  }
  if (key.includes('date') || key.endsWith('_at')) {
    if (typeof value === 'string') return formatDate(value, true);
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const buildDiffLines = (log: AuditLog, userMap: Map<string, User>) => {
  const before = log.before ?? {};
  const after = log.after ?? {};
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  const keys = Array.from(new Set([...beforeKeys, ...afterKeys])).sort();

  if (keys.length > 0) {
    return keys.map((key) => {
      const fromValue = formatValue(key, (before as Record<string, unknown>)[key], userMap);
      const toValue = formatValue(key, (after as Record<string, unknown>)[key], userMap);
      return `${formatLabel(key)}: ${fromValue} → ${toValue}`;
    });
  }

  if (log.oldValue || log.newValue) {
    return [`Value: ${log.oldValue ?? 'None'} → ${log.newValue ?? 'None'}`];
  }

  const reason = log.reason || log.metadata?.reason;
  return reason ? [`No change payload. Reason: ${reason}`] : ['No change payload provided.'];
};

const truncate = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max)}...` : value);

const getEntityLink = (log: AuditLog) => {
  if (!log.entityType || !log.entityId) return null;
  if (log.entityType === 'task') return `/tasks/${log.entityId}`;
  if (log.entityType === 'ticket') return `/tickets?ticketId=${log.entityId}`;
  if (log.entityType === 'user') return `/admin/users?userId=${log.entityId}`;
  return null;
};

const Logs: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('all');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [retention, setRetention] = useState<AuditRetentionConfig | null>(null);
  const [retentionUpdating, setRetentionUpdating] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    startAt: '',
    endAt: '',
    actorIds: [] as string[],
    actions: '',
    entityTypes: [] as string[],
    severity: [] as string[],
    source: [] as string[],
    status: [] as string[],
  });

  const tabFilter = TAB_CONFIG[tab];
  const actionFilters = useMemo(
    () => filters.actions.split(',').map((item) => item.trim()).filter(Boolean),
    [filters.actions],
  );

  const query = useMemo(
    () => ({
      categories: tabFilter.categories,
      status: tabFilter.status?.length ? tabFilter.status : filters.status,
      entityTypes: filters.entityTypes,
      actions: actionFilters,
      actorIds: filters.actorIds,
      severity: filters.severity,
      source: filters.source,
      startAt: filters.startAt || undefined,
      endAt: filters.endAt || undefined,
      pageSize: PAGE_SIZE,
    }),
    [actionFilters, filters, tabFilter],
  );

  const loadLogs = useCallback(
    async (nextPage = 1, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getAuditLogs({ ...query, page: nextPage });
        setTotal(response.total);
        setPage(response.page);
        setLogs((prev) => (append ? [...prev, ...response.items] : response.items));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load logs.';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    loadLogs(1, false);
  }, [loadLogs]);

  useEffect(() => {
    if (!user) return;
    if (user.role === Role.USER) {
      setUsers([user]);
      return;
    }
    api.getUsers()
      .then((data) => setUsers(data))
      .catch(() => setUsers([]));
  }, [user]);

  useEffect(() => {
    if (!user || (user.role !== Role.ADMIN && user.role !== Role.OWNER)) return;
    api.getAuditRetention()
      .then((data) => setRetention(data))
      .catch(() => setRetention(null));
  }, [user]);

  const handleMultiSelect =
    (key: keyof typeof filters) => (event: React.ChangeEvent<HTMLSelectElement>) => {
      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
      setFilters((prev) => ({ ...prev, [key]: values }));
    };

  const handleSingleSelectArray =
    (key: 'entityTypes' | 'severity' | 'source' | 'status' | 'actorIds') =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setFilters((prev) => ({ ...prev, [key]: value ? [value] : [] }));
    };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const blob = await api.exportAuditLogs({
        format,
        categories: tabFilter.categories,
        status: tabFilter.status?.length ? tabFilter.status : filters.status,
        entityTypes: filters.entityTypes,
        actions: actionFilters,
        actorIds: filters.actorIds,
        severity: filters.severity,
        source: filters.source,
        startAt: filters.startAt || undefined,
        endAt: filters.endAt || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export logs.';
      setError(message);
    }
  };

  const handleRetry = async (log: AuditLog) => {
    if (log.category !== 'automation') return;
    setRetentionMessage(null);
    try {
      await api.retryAuditLog(log.id);
      setRetentionMessage('Retry queued.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to queue retry.';
      setRetentionMessage(message);
    }
  };

  const applyRetention = async () => {
    setRetentionMessage(null);
    try {
      const result = await api.applyAuditRetention();
      setRetentionMessage(`Retention applied: ${result.updated} logs archived.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply retention.';
      setRetentionMessage(message);
    }
  };

  const updateRetention = async (value: number) => {
    if (!retention) return;
    setRetentionUpdating(true);
    setRetentionMessage(null);
    try {
      const updated = await api.updateAuditRetention(value);
      setRetention(updated);
      setRetentionMessage('Retention updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update retention.';
      setRetentionMessage(message);
    } finally {
      setRetentionUpdating(false);
    }
  };

  const canManageRetention = user?.role === Role.ADMIN || user?.role === Role.OWNER;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const userMap = useMemo(() => new Map(users.map((person) => [person.id, person])), [users]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Audit Logs</h1>
            <p className="mt-1 text-sm text-slate-600">
              Monitor system activity, user actions, and automated processes
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleExport('csv')}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          <div className="inline-flex gap-2 rounded-xl bg-white p-1 shadow-sm">
            {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
                className={`whitespace-nowrap rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
                  tab === key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {TAB_CONFIG[key].label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
          <h2 className="mb-5 text-lg font-semibold text-slate-800">Filters</h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Start Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Start Date</label>
              <input
                type="datetime-local"
                value={filters.startAt}
                onChange={(e) => setFilters((prev) => ({ ...prev, startAt: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">End Date</label>
              <input
                type="datetime-local"
                value={filters.endAt}
                onChange={(e) => setFilters((prev) => ({ ...prev, endAt: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</label>
              <input
                type="text"
                placeholder="e.g. TASK_UPDATED, USER_LOGIN"
                value={filters.actions}
                onChange={(e) => setFilters((prev) => ({ ...prev, actions: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              />
            </div>

            {/* Entity Types */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Entity Type</label>
              <select
                value={filters.entityTypes[0] ?? ''}
                onChange={handleSingleSelectArray('entityTypes')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              >
                <option value="">All Entity Types</option>
                {ENTITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Severity</label>
              <select
                value={filters.severity[0] ?? ''}
                onChange={handleSingleSelectArray('severity')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              >
                <option value="">All Severities</option>
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Source</label>
              <select
                value={filters.source[0] ?? ''}
                onChange={handleSingleSelectArray('source')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              >
                <option value="">All Sources</option>
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Status</label>
              <select
                value={filters.status[0] ?? ''}
                onChange={handleSingleSelectArray('status')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            {/* Users / Actors */}
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Users / Actors</label>
              <select
                value={filters.actorIds[0] ?? ''}
                onChange={handleSingleSelectArray('actorIds')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none transition"
              >
                <option value="">All Users / Actors</option>
                {users.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name || person.email || person.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          {loading && logs.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-slate-500">
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-slate-500">
              No logs found for the selected filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Time
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Actor
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Action
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Entity
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Change
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Source
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Severity
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                        IP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-500">
                          {timeAgo(log.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-slate-900">
                          {log.actor?.name || log.actorId || 'System'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-indigo-700">
                          {log.action}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm uppercase text-slate-600">
                          {log.entityType || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-700 max-w-md">
                          {truncate(buildDiffLines(log, userMap)[0] || '—')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm uppercase text-slate-600">
                          {log.source || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              log.severity === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : log.severity === 'warning'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {log.severity || 'info'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-500">
                          {log.ipAddress || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div>Showing {logs.length} of {total} logs</div>
                <div className="flex items-center gap-4">
                  <span>Page {page} of {totalPages}</span>
                  {page < totalPages && (
                    <button
                      onClick={() => loadLogs(page + 1, true)}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 transition disabled:opacity-50"
                      disabled={loading}
                    >
                      Load More
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default Logs;
