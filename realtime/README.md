# Presence Socket Server

Lightweight Socket.IO server that tracks user presence using Redis. Clients must
authenticate with a JWT; the server uses the JWT subject (or user_id) as the
presence key.

## Setup

1) Install dependencies:
```
npm install
```

2) Copy env template:
```
copy .env.example .env
```

3) Set `JWT_SECRET` to the same value used by the backend.

4) Start the server:
```
npm run start
```

## Events

- `presence:online` -> broadcast when a user becomes online.
- `presence:offline` -> broadcast when a user goes offline.
- `presence:get` -> returns `{ ok: true, users: string[] }` with online users.
- `presence:ping` -> client heartbeat; server marks user offline if no ping in 30s.

## HTTP endpoints

- `GET /presence/active` -> returns `{ users: string[], count: number }`.

## Client auth

Pass the JWT in `socket.handshake.auth.token` or as `Authorization: Bearer <token>`.
