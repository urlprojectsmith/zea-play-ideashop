# VPS Deployment

This project can run on a VPS with Docker Compose. The VPS should expose only the reverse-proxy ports publicly; the app containers map to local ports for proxy routing.

## 1. DNS

Point these records to your VPS IP:

- `play.ideashop.zeacrm.com`
- `api.symphozen.zeacrm.com`
- `presence.ideashop.zeacrm.com`

If you want the API domain changed to `api.ideashop.zeacrm.com`, update `BACKEND_DEPLOY_HOST`, `VITE_API_BASE_URL`, `VITE_API_URL`, `VEE_MEDIA_PUBLIC_BASE`, and `VEE_GOOGLE_REDIRECT_URI` in `.env.vps`.

## 2. Install Docker On Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

## 3. Upload The Project

From your local machine, upload the project to the VPS. Replace the user/IP as needed.

```bash
scp -r FINAL-RED-CODE-SYMBO user@YOUR_VPS_IP:/opt/zea-play
```

If the upload is too large, remove local build/runtime folders before uploading:

```bash
rm -rf frontend/node_modules frontend/dist backend/.venv .venv venv .pytest_cache
```

## 4. Configure Environment

On the VPS:

```bash
cd /opt/zea-play/FINAL-RED-CODE-SYMBO
cp .env.vps.example .env.vps
nano .env.vps
```

Change at minimum:

- `POSTGRES_PASSWORD`
- `VEE_JWT_SECRET_KEY`
- `VEE_JWT_REFRESH_SECRET_KEY`
- Any storage/media credentials the app actually uses

Generate strong secrets with:

```bash
openssl rand -hex 32
```

## 5. Build And Start

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
docker compose --env-file .env.vps -f docker-compose.vps.yml ps
docker compose --env-file .env.vps -f docker-compose.vps.yml logs -f --tail=100
```

## 6. Reverse Proxy

In Nginx Proxy Manager, Caddy, or your VPS Nginx, route:

- `play.ideashop.zeacrm.com` -> `http://127.0.0.1:4200`
- `api.symphozen.zeacrm.com` -> `http://127.0.0.1:4211`
- `presence.ideashop.zeacrm.com` -> `http://127.0.0.1:4212`

Enable SSL for all three hosts. Enable WebSocket support for `presence.ideashop.zeacrm.com`.

## 7. Health Checks

```bash
curl -I http://127.0.0.1:4200
curl http://127.0.0.1:4211/health
curl http://127.0.0.1:4212/health
```

Then test in the browser:

- `https://play.ideashop.zeacrm.com`
- `https://api.symphozen.zeacrm.com/health`
- `https://presence.ideashop.zeacrm.com/health`

## Common Commands

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml restart
docker compose --env-file .env.vps -f docker-compose.vps.yml pull
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
docker compose --env-file .env.vps -f docker-compose.vps.yml logs -f backend
```
