const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const PORT = Number(process.env.PRESENCE_PORT || process.env.PORT || 6212);
const REDIS_URL = process.env.PRESENCE_REDIS_URL || process.env.REDIS_URL || 'redis://redis:6379';
const JWT_SECRET = process.env.PRESENCE_JWT_SECRET || process.env.VEE_JWT_SECRET_KEY || 'change_me';
const JWT_ALGORITHM = process.env.PRESENCE_JWT_ALGORITHM || 'HS256';
const EVENTS_CHANNEL = process.env.PRESENCE_EVENTS_CHANNEL || 'presence:events';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const redis = createClient({ url: REDIS_URL });
const redisSub = createClient({ url: REDIS_URL });

const tenantRoom = (tenantId) => `tenant:${tenantId}`;
const tenantOnlineKey = (tenantId) => `presence:tenant:${tenantId}`;
const tenantCountsKey = (tenantId) => `presence:tenant:${tenantId}:counts`;

const publishEvent = async (tenantId, userId, eventType) => {
  const payload = JSON.stringify({ tenantId, userId, eventType });
  await redis.publish(EVENTS_CHANNEL, payload);
};

const parseToken = (socket) => {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  if (authToken) {
    return authToken;
  }
  const header = socket.handshake.headers && socket.handshake.headers.authorization;
  if (!header) {
    return null;
  }
  const parts = header.split(' ');
  return parts.length === 2 ? parts[1] : header;
};

const verifyToken = (token) => {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  const scopes = payload.scopes || payload.scope || [];
  const scopeList = Array.isArray(scopes) ? scopes : String(scopes).split(' ');
  if (!scopeList.includes('presence')) {
    throw new Error('presence scope required');
  }
  const userId = payload.sub || payload.user_id || payload.userId;
  if (!userId) {
    throw new Error('user id missing');
  }
  const tenantId = payload.tenant_id || payload.tenantId || 'default';
  return { userId: String(userId), tenantId: String(tenantId) };
};

io.use((socket, next) => {
  try {
    const token = parseToken(socket);
    if (!token) {
      return next(new Error('token required'));
    }
    const { userId, tenantId } = verifyToken(token);
    socket.data.userId = userId;
    socket.data.tenantId = tenantId;
    return next();
  } catch (err) {
    return next(err);
  }
});

io.on('connection', (socket) => {
  const { userId, tenantId } = socket.data;
  socket.join(tenantRoom(tenantId));

  const handleConnect = async () => {
    const countsKey = tenantCountsKey(tenantId);
    const onlineKey = tenantOnlineKey(tenantId);
    const count = await redis.hIncrBy(countsKey, userId, 1);
    await redis.sAdd(onlineKey, userId);
    if (count === 1) {
      await publishEvent(tenantId, userId, 'user_online');
    }
  };

  const handleDisconnect = async () => {
    const countsKey = tenantCountsKey(tenantId);
    const onlineKey = tenantOnlineKey(tenantId);
    const count = await redis.hIncrBy(countsKey, userId, -1);
    if (count <= 0) {
      await redis.hDel(countsKey, userId);
      await redis.sRem(onlineKey, userId);
      await publishEvent(tenantId, userId, 'user_offline');
    }
  };

  handleConnect().catch(() => {});

  socket.on('presence:get', async (ack) => {
    try {
      const online = await redis.sMembers(tenantOnlineKey(tenantId));
      if (typeof ack === 'function') {
        ack({ ok: true, users: online });
      }
    } catch (err) {
      if (typeof ack === 'function') {
        ack({ ok: false });
      }
    }
  });

  socket.on('presence:ping', () => {});

  socket.on('disconnect', () => {
    handleDisconnect().catch(() => {});
  });
});

const start = async () => {
  await redis.connect();
  await redisSub.connect();

  await redisSub.subscribe(EVENTS_CHANNEL, (message) => {
    try {
      const payload = JSON.parse(message);
      const tenantId = payload.tenantId;
      const userId = payload.userId;
      const eventType = payload.eventType;
      if (!tenantId || !userId || !eventType) {
        return;
      }
      io.to(tenantRoom(tenantId)).emit(eventType, { userId });
      if (eventType === 'user_online') {
        io.to(tenantRoom(tenantId)).emit('presence:online', { userId });
      }
      if (eventType === 'user_offline') {
        io.to(tenantRoom(tenantId)).emit('presence:offline', { userId });
      }
    } catch (err) {
      return;
    }
  });

  server.listen(PORT, () => {
    // no-op
  });
};

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
