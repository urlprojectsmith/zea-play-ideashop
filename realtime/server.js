const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
require('dotenv').config();

const PORT = parseInt(process.env.SOCKET_PORT || '6212', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : '*';

if (!JWT_SECRET) {
    console.error('JWT_SECRET is required to run the presence server.');
    process.exit(1);
}

const PRESENCE_SET_KEY = 'presence:online';
const PRESENCE_COUNT_HASH = 'presence:user_counts';
const PRESENCE_PING_ZSET = 'presence:last_ping';
const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 30000;
const SWEEP_INTERVAL_MS = 10000;
const CHAT_HISTORY_LIMIT = parseInt(process.env.CHAT_HISTORY_LIMIT || '200', 10);
const CHAT_MESSAGE_MAX_CHARS = parseInt(process.env.CHAT_MESSAGE_MAX_CHARS || '4000', 10);
const CHAT_ATTACHMENT_MAX_BYTES = parseInt(process.env.CHAT_ATTACHMENT_MAX_BYTES || '350000', 10);
const CHAT_ATTACHMENT_LIMIT = parseInt(process.env.CHAT_ATTACHMENT_LIMIT || '4', 10);

const app = express();
const applyCorsHeaders = (req, res) => {
    const origin = req.headers.origin;
    if (CORS_ORIGINS === '*') {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && Array.isArray(CORS_ORIGINS) && CORS_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
};

app.options('/presence/active', (req, res) => {
    applyCorsHeaders(req, res);
    res.sendStatus(204);
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.get('/presence/active', async (req, res) => {
    applyCorsHeaders(req, res);
    try {
        const users = await redis.sMembers(PRESENCE_SET_KEY);
        res.json({ users, count: users.length });
    } catch (error) {
        console.error('Failed to fetch active users', error);
        res.status(500).json({ error: 'Failed to fetch active users' });
    }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: CORS_ORIGINS,
        credentials: true,
    },
});

const redis = createClient({ url: REDIS_URL });
redis.on('error', (err) => {
    console.error('Redis connection error', err);
});

const buildChatRoom = (spaceId) => `chat:${spaceId}`;
const buildUserRoom = (userId) => `user:${userId}`;
const buildChatHistoryKey = (spaceId) => `chat:space:${spaceId}:messages`;
const CHAT_SPACE_META_PREFIX = 'chat:space:meta:';
const CHAT_USER_SPACES_PREFIX = 'chat:user:spaces:';

const createId = () => {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const safeParseJson = (raw) => {
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
};

const sanitizeAttachments = (rawAttachments) => {
    if (!Array.isArray(rawAttachments)) {
        return [];
    }
    const attachments = [];
    for (const item of rawAttachments) {
        if (!item || attachments.length >= CHAT_ATTACHMENT_LIMIT) {
            continue;
        }
        const name = typeof item.name === 'string' ? item.name.slice(0, 120) : '';
        const type = typeof item.type === 'string' ? item.type.slice(0, 80) : '';
        const size = typeof item.size === 'number' ? item.size : 0;
        const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl : '';
        if (!name || size <= 0 || size > CHAT_ATTACHMENT_MAX_BYTES) {
            continue;
        }
        if (dataUrl && dataUrl.length > CHAT_ATTACHMENT_MAX_BYTES * 1.6) {
            continue;
        }
        attachments.push({
            id: typeof item.id === 'string' ? item.id : createId(),
            name,
            type,
            size,
            dataUrl,
        });
    }
    return attachments;
};

const sanitizeMemberIds = (rawMemberIds) => {
    if (!Array.isArray(rawMemberIds)) {
        return [];
    }
    const seen = new Set();
    const sanitized = [];
    for (const memberId of rawMemberIds) {
        const value = typeof memberId === 'string' ? memberId.trim() : '';
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        sanitized.push(value);
    }
    return sanitized.slice(0, 50);
};

const sanitizeSpace = (rawSpace) => {
    if (!rawSpace || typeof rawSpace !== 'object') {
        return null;
    }
    const id = typeof rawSpace.id === 'string' ? rawSpace.id.trim() : '';
    if (!id) {
        return null;
    }
    const memberIds = sanitizeMemberIds(rawSpace.memberIds);
    return {
        id,
        name: typeof rawSpace.name === 'string' ? rawSpace.name.slice(0, 140) : '',
        type: typeof rawSpace.type === 'string' ? rawSpace.type : '',
        memberIds,
        createdBy: typeof rawSpace.createdBy === 'string' ? rawSpace.createdBy : '',
        updatedAt: typeof rawSpace.updatedAt === 'string' ? rawSpace.updatedAt : new Date().toISOString(),
        lastMessage: typeof rawSpace.lastMessage === 'string' ? rawSpace.lastMessage.slice(0, 160) : '',
    };
};

const persistSpace = async (space) => {
    if (!space || typeof space !== 'object') {
        return;
    }
    const spaceId = typeof space.id === 'string' ? space.id.trim() : '';
    if (!spaceId) {
        return;
    }
    const memberIds = Array.isArray(space.memberIds)
        ? Array.from(new Set(space.memberIds.filter((value) => typeof value === 'string' && value.trim())))
        : [];
    const payload = {
        id: spaceId,
        name: typeof space.name === 'string' ? space.name : '',
        type: typeof space.type === 'string' ? space.type : '',
        memberIds: JSON.stringify(memberIds),
        createdBy: typeof space.createdBy === 'string' ? space.createdBy : '',
        updatedAt: typeof space.updatedAt === 'string' ? space.updatedAt : new Date().toISOString(),
        lastMessage: typeof space.lastMessage === 'string' ? space.lastMessage : '',
    };
    const spaceKey = `${CHAT_SPACE_META_PREFIX}${spaceId}`;
    const pipeline = redis.multi();
    pipeline.hSet(spaceKey, payload);
    if (memberIds.length > 0) {
        for (const memberId of memberIds) {
            pipeline.sAdd(`${CHAT_USER_SPACES_PREFIX}${memberId}`, spaceId);
        }
    }
    await pipeline.exec();
};

const emitStoredSpaces = async (socket, userId) => {
    if (!socket || !userId) {
        return;
    }
    const setKey = `${CHAT_USER_SPACES_PREFIX}${userId}`;
    let spaceIds = [];
    try {
        spaceIds = await redis.sMembers(setKey);
    } catch (error) {
        console.error('Failed to load stored chat spaces', error);
        return;
    }
    if (!spaceIds.length) {
        return;
    }
    for (const spaceId of spaceIds) {
        try {
            const meta = await redis.hGetAll(`${CHAT_SPACE_META_PREFIX}${spaceId}`);
            if (!meta || !meta.id) {
                continue;
            }
            const memberIds = (() => {
                try {
                    const value = meta.memberIds;
                    if (!value) return [];
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
                } catch {
                    return [];
                }
            })();
            socket.emit('chat:space', {
                id: meta.id,
                name: meta.name || '',
                type: meta.type || '',
                memberIds,
                createdBy: meta.createdBy || '',
                updatedAt: meta.updatedAt || new Date().toISOString(),
                lastMessage: meta.lastMessage || '',
            });
        } catch (error) {
            console.error('Failed to emit stored chat space', error);
        }
    }
};

const fetchChatHistory = async (spaceId) => {
    const key = buildChatHistoryKey(spaceId);
    const historyRaw = await redis.lRange(key, 0, CHAT_HISTORY_LIMIT - 1);
    const parsed = historyRaw
        .map((entry) => safeParseJson(entry))
        .filter((entry) => Boolean(entry));
    return parsed.reverse();
};

io.use((socket, next) => {
    const authHeader = socket.handshake.headers.authorization || '';
    const token =
        socket.handshake.auth?.token ||
        authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
        return next(new Error('Missing token'));
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
        const userId =
            payload.sub ||
            payload.user_id ||
            payload.userId ||
            payload.id ||
            payload.email;

        if (!userId) {
            return next(new Error('Token missing user identifier'));
        }

        socket.data.userId = String(userId);
        socket.data.jwtPayload = payload;
        return next();
    } catch (error) {
        return next(new Error('Invalid token'));
    }
});

io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(buildUserRoom(userId));

    const touchPing = async () => {
        try {
            await redis.zAdd(PRESENCE_PING_ZSET, [
                { score: Date.now(), value: userId },
            ]);
        } catch (error) {
            console.error('Failed to update last ping', error);
        }
    };

    const markOnline = async () => {
        try {
            const newCount = await redis.hIncrBy(PRESENCE_COUNT_HASH, userId, 1);
            await touchPing();
            if (newCount === 1) {
                await redis.sAdd(PRESENCE_SET_KEY, userId);
                io.emit('presence:online', { userId });
            }
        } catch (error) {
            console.error('Failed to mark user online', error);
        }
    };

    const markOffline = async () => {
        try {
            const newCount = await redis.hIncrBy(PRESENCE_COUNT_HASH, userId, -1);
            if (newCount <= 0) {
                const pipeline = redis.multi();
                pipeline.hDel(PRESENCE_COUNT_HASH, userId);
                pipeline.sRem(PRESENCE_SET_KEY, userId);
                pipeline.zRem(PRESENCE_PING_ZSET, userId);
                await pipeline.exec();
                io.emit('presence:offline', { userId });
            }
        } catch (error) {
            console.error('Failed to mark user offline', error);
        }
    };

    void markOnline();
    void emitStoredSpaces(socket, userId);

    socket.on('presence:ping', () => {
        void touchPing();
    });

    socket.on('presence:get', async (callback) => {
        try {
            const users = await redis.sMembers(PRESENCE_SET_KEY);
            if (typeof callback === 'function') {
                callback({ ok: true, users });
            }
        } catch (error) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Unable to fetch online users' });
            }
        }
    });

    socket.on('chat:join', async (payload, callback) => {
        try {
            const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId.trim() : '';
            if (!spaceId) {
                if (typeof callback === 'function') {
                    callback({ ok: false, error: 'spaceId is required' });
                }
                return;
            }
            socket.join(buildChatRoom(spaceId));
            const history = await fetchChatHistory(spaceId);
            if (typeof callback === 'function') {
                callback({ ok: true, history });
            }
        } catch (error) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Unable to fetch chat history' });
            }
        }
    });

    socket.on('chat:space', (payload, callback) => {
        try {
            const space = sanitizeSpace(payload?.space || payload);
            if (!space) {
                if (typeof callback === 'function') {
                    callback({ ok: false, error: 'Invalid space payload' });
                }
                return;
            }
            const recipients = space.memberIds.length ? space.memberIds : [userId];
            recipients.forEach((memberId) => {
                io.to(buildUserRoom(memberId)).emit('chat:space', space);
            });
            void persistSpace(space);
            if (typeof callback === 'function') {
                callback({ ok: true });
            }
        } catch (error) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Unable to broadcast space' });
            }
        }
    });

    socket.on('chat:leave', (payload) => {
        const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId.trim() : '';
        if (!spaceId) {
            return;
        }
        socket.leave(buildChatRoom(spaceId));
    });

    socket.on('chat:message', async (payload, callback) => {
        try {
            const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId.trim() : '';
            if (!spaceId) {
                if (typeof callback === 'function') {
                    callback({ ok: false, error: 'spaceId is required' });
                }
                return;
            }

            const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
            const replyTo = typeof payload?.replyTo === 'string' ? payload.replyTo : null;
            const attachments = sanitizeAttachments(payload?.attachments);
            const sanitizedSpace = sanitizeSpace(payload?.space);
            const memberIds = sanitizeMemberIds(
                payload?.memberIds || sanitizedSpace?.memberIds || []
            );
            if (!body && attachments.length === 0) {
                if (typeof callback === 'function') {
                    callback({ ok: false, error: 'message body or attachment is required' });
                }
                return;
            }

            const trimmedBody = body.slice(0, CHAT_MESSAGE_MAX_CHARS);
            const message = {
                id: typeof payload?.id === 'string' ? payload.id : createId(),
                spaceId,
                authorId: userId,
                body: trimmedBody,
                createdAt: new Date().toISOString(),
                replyTo,
                attachments,
                memberIds,
                space: sanitizedSpace,
            };

            const historyKey = buildChatHistoryKey(spaceId);
            const pipeline = redis.multi();
            pipeline.lPush(historyKey, JSON.stringify(message));
            pipeline.lTrim(historyKey, 0, CHAT_HISTORY_LIMIT - 1);
            await pipeline.exec();

            const spaceSnapshot = sanitizedSpace || {
                id: spaceId,
                memberIds,
                createdBy: userId,
                updatedAt: message.createdAt,
                name: '',
                type: '',
                lastMessage: '',
            };
            void persistSpace({
                ...spaceSnapshot,
                memberIds,
                updatedAt: message.createdAt,
                lastMessage: trimmedBody,
            });

            io.to(buildChatRoom(spaceId)).emit('chat:message', message);
            if (memberIds.length > 0) {
                memberIds.forEach((memberId) => {
                    io.to(buildUserRoom(memberId)).emit('chat:message', message);
                });
            } else {
                io.to(buildUserRoom(userId)).emit('chat:message', message);
            }

            if (typeof callback === 'function') {
                callback({ ok: true, message });
            }
        } catch (error) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Unable to send message' });
            }
        }
    });

    socket.on('chat:typing', (payload) => {
        const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId.trim() : '';
        if (!spaceId) {
            return;
        }
        const preview = typeof payload?.preview === 'string' ? payload.preview.slice(0, 80) : '';
        const isTyping = Boolean(payload?.isTyping);
        socket.to(buildChatRoom(spaceId)).emit('chat:typing', {
            spaceId,
            userId,
            isTyping,
            preview,
        });
    });

    socket.on('chat:reaction', (payload, callback) => {
        const spaceId = typeof payload?.spaceId === 'string' ? payload.spaceId.trim() : '';
        const messageId = typeof payload?.messageId === 'string' ? payload.messageId.trim() : '';
        const reaction = typeof payload?.reaction === 'string' ? payload.reaction.trim().slice(0, 24) : '';
        if (!spaceId || !messageId || !reaction) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'invalid reaction payload' });
            }
            return;
        }
        socket.to(buildChatRoom(spaceId)).emit('chat:reaction', {
            spaceId,
            messageId,
            reaction,
            userId,
        });
        if (typeof callback === 'function') {
            callback({ ok: true });
        }
    });

    socket.on('disconnect', () => {
        void markOffline();
    });
});

const sweepStaleUsers = async () => {
    try {
        const cutoff = Date.now() - PING_TIMEOUT_MS;
        const staleUsers = await redis.zRangeByScore(PRESENCE_PING_ZSET, 0, cutoff);
        if (!staleUsers.length) {
            return;
        }
        for (const userId of staleUsers) {
            const pipeline = redis.multi();
            pipeline.hDel(PRESENCE_COUNT_HASH, userId);
            pipeline.sRem(PRESENCE_SET_KEY, userId);
            pipeline.zRem(PRESENCE_PING_ZSET, userId);
            await pipeline.exec();
            io.emit('presence:offline', { userId });
        }
    } catch (error) {
        console.error('Failed to sweep stale presence', error);
    }
};

const start = async () => {
    await redis.connect();
    setInterval(() => {
        void sweepStaleUsers();
    }, SWEEP_INTERVAL_MS);

    httpServer.listen(PORT, () => {
        console.log(`Presence server listening on :${PORT}`);
        console.log(`Heartbeat: ${PING_INTERVAL_MS}ms, timeout: ${PING_TIMEOUT_MS}ms`);
    });
};

start().catch((error) => {
    console.error('Failed to start presence server', error);
    process.exit(1);
});
