# Domain Change Documentation

Date: 2026-03-01

## New Domains
- Frontend: `https://play.balaji.zeacrm.com`
- Backend: `https://api.balaji.zeacrm.com`

## Database URL
- `VEE_DATABASE_URL=postgresql://postgres:9FHI3%21GyE75%23@167.86.108.178:5432/Balaji`

## Files Updated
1. `backend/.env`
2. `docker-compose.yml`
3. `frontend/.env`
4. `frontend/.env.local`

## Detailed Changes

### 1) backend/.env
- Updated `VEE_CORS_ALLOW_ORIGINS` to include:
  - `https://play.balaji.zeacrm.com`
  - `https://api.balaji.zeacrm.com`
- Set `VEE_DATABASE_URL` to the provided DB connection string.
- Set `VEE_MEDIA_PUBLIC_BASE=https://api.balaji.zeacrm.com/uploads`.
- Set `VEE_DEPLOYMENT_FRONTEND_HOST=play.balaji.zeacrm.com`.
- Set `VEE_DEPLOYMENT_BACKEND_HOST=api.balaji.zeacrm.com`.
- Removed duplicate `VEE_MEDIA_PUBLIC_BASE` entry, keeping a single valid line.

### 2) docker-compose.yml
- Updated backend env defaults:
  - `VEE_DATABASE_URL` default now points to `postgresql://postgres:9FHI3%21GyE75%23@167.86.108.178:5432/Balaji`
  - `VEE_DEPLOYMENT_FRONTEND_HOST=play.balaji.zeacrm.com`
  - `VEE_DEPLOYMENT_BACKEND_HOST=api.balaji.zeacrm.com`
- Updated frontend build args:
  - `VITE_API_BASE_URL=https://api.balaji.zeacrm.com/api`
  - `VITE_API_URL=https://api.balaji.zeacrm.com/api`
  - `VITE_PRESENCE_URL=https://api.balaji.zeacrm.com`
- Updated frontend runtime env:
  - `FRONTEND_DEPLOY_HOST=play.balaji.zeacrm.com`
  - `BACKEND_DEPLOY_HOST=api.balaji.zeacrm.com`

### 3) frontend/.env
- `VITE_API_BASE_URL=https://api.balaji.zeacrm.com`
- `MEDIA_PUBLIC_BASE=https://api.balaji.zeacrm.com/uploads`

### 4) frontend/.env.local
- Replaced legacy `https://playapi.zeacrm.com` references with `https://api.balaji.zeacrm.com`.
- Updated `MEDIA_PUBLIC_BASE=https://api.balaji.zeacrm.com/uploads`.

## File Not Changed
- `frontend/nginx.conf` (no edits applied)

## Verification Checklist
- Frontend loads via: `https://play.balaji.zeacrm.com`
- API reachable via: `https://api.balaji.zeacrm.com`
- Backend CORS allows frontend domain.
- Media URLs resolve through backend domain.
- Containers rebuild with updated compose values.
