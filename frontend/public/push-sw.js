self.__recentPushKeys = self.__recentPushKeys || new Map();
const TASK_CREATED_PUSH_DEDUP_TTL_MS = 90 * 1000;

const shouldDropDuplicatePush = (payload) => {
  const eventType = payload.event_type || payload.eventType || null;
  const taskId = payload.taskId || payload.related_task_id || payload.relatedTaskId || null;
  if (eventType !== 'task.created' || !taskId) {
    return false;
  }

  const now = Date.now();
  const key = `${eventType}:${taskId}`;
  const cutoff = now - TASK_CREATED_PUSH_DEDUP_TTL_MS;

  for (const [entryKey, ts] of self.__recentPushKeys.entries()) {
    if (ts < cutoff) {
      self.__recentPushKeys.delete(entryKey);
    }
  }

  if (self.__recentPushKeys.has(key)) {
    return true;
  }
  self.__recentPushKeys.set(key, now);
  return false;
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  if (shouldDropDuplicatePush(payload)) {
    return;
  }

  const title = payload.title || 'Task update';
  const taskId = payload.taskId || payload.related_task_id || payload.relatedTaskId || null;
  const url = payload.url || payload.deep_link || (taskId ? `/tasks/${encodeURIComponent(taskId)}` : '/tasks');
  const options = {
    body: payload.body || 'You have a new task notification.',
    tag: payload.tag || 'task-update',
    data: {
      taskId,
      url,
      deep_link: payload.deep_link || url,
      related_task_id: payload.related_task_id || null,
      event_type: payload.event_type || 'task.update',
    },
    requireInteraction: false,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BROWSER_PUSH_SOUND' });
        });
      }),
    ]),
  );
});

const normalizeTaskPath = (pathWithSearch) => {
  if (!pathWithSearch) {
    return '/tasks';
  }
  const [pathname, search = ''] = pathWithSearch.split('?');
  const match = pathname.match(/^\/(?:admin|dashboard)\/tasks\/([^/]+)$/);
  if (match) {
    return `/tasks/${match[1]}${search ? `?${search}` : ''}`;
  }
  if (pathname === '/admin/tasks' || pathname === '/dashboard/tasks') {
    return `/tasks${search ? `?${search}` : ''}`;
  }
  return pathWithSearch;
};

const toHashAppUrl = (url) => {
  try {
    if (!url) {
      return new URL('/#/tasks', self.location.origin).href;
    }
    const parsed = new URL(url, self.location.origin);
    if (parsed.origin !== self.location.origin) {
      return parsed.href;
    }
    if (parsed.hash && parsed.hash.startsWith('#/')) {
      return parsed.href;
    }
    const path = normalizeTaskPath(`${parsed.pathname}${parsed.search}`);
    return new URL(`/#${path}`, self.location.origin).href;
  } catch {
    return new URL('/#/tasks', self.location.origin).href;
  }
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const taskId = data.taskId || data.related_task_id || data.relatedTaskId || null;
  const url = data.url || data.deep_link || (taskId ? `/tasks/${encodeURIComponent(taskId)}` : '/tasks');
  const normalizedPath = normalizeTaskPath(
    (() => {
      try {
        const parsed = new URL(url, self.location.origin);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return '/tasks';
      }
    })(),
  );
  const targetUrl = toHashAppUrl(url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'BROWSER_PUSH_NAVIGATE',
            deepLink: normalizedPath,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
