# Installation Guide

This guide covers manual install. For one-line install, see [README.md](README.md).

## Requirements

- VPS running Ubuntu 22.04+ or Debian 12+ (minimum 2GB RAM, 20GB disk)
- Two domain names (or subdomains) pointed at your VPS:
  - `app.yourdomain.com` — dashboard / admin
  - `pages.yourdomain.com` — public funnel pages
- Docker + Docker Compose v2

## Step 1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER  # logout/login to apply
```

## Step 2 — Clone or download

```bash
git clone https://github.com/TechFago/launchtic.git
cd launchtic
```

## Step 3 — Point DNS

In your domain registrar (Cloudflare, Namecheap, etc.) add **A records**:

| Subdomain | Value |
|---|---|
| `app.yourdomain.com` | `YOUR_VPS_IP` |
| `pages.yourdomain.com` | `YOUR_VPS_IP` |

DNS may take 5-30 minutes to propagate.

## Step 4 — Configure environment

```bash
cp .env.example .env
nano .env
```

The minimum fields to set:

```env
APP_DOMAIN=app.yourdomain.com
PAGES_DOMAIN=pages.yourdomain.com
ACME_EMAIL=admin@yourdomain.com

# Generate strong values:
#   openssl rand -base64 32  →  NEXTAUTH_SECRET
#   openssl rand -hex 32     →  ENCRYPTION_KEY
#   openssl rand -hex 16     →  POSTGRES_PASSWORD
NEXTAUTH_SECRET=...
ENCRYPTION_KEY=...
POSTGRES_PASSWORD=...

DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@postgres:5432/launchtic
```

URL vars (`APP_URL`, `RENDERER_URL`, `NEXTAUTH_URL`) are auto-derived from the two `*_DOMAIN` values — no need to set manually.

> Stripe / PayPal / SMTP / S3 / AI provider credentials are configured per-workspace via the dashboard (Settings) and stored encrypted in the database — not in `.env`.

## Step 5 — Start

```bash
docker compose up -d
```

Wait ~30 seconds for services to start. Caddy automatically issues SSL certs for both domains via Let's Encrypt.

Run database migrations on first start:

```bash
docker compose exec web npx prisma migrate deploy
```

## Step 6 — Open the dashboard

Visit `https://app.yourdomain.com` and create your admin account on first run.

## How funnel URLs work

A funnel step with slug `my-offer` becomes:

```
https://pages.yourdomain.com/my-offer
```

To use a custom domain per funnel, add it under Settings → Domains, point its CNAME to `pages.yourdomain.com`, and assign it to the funnel.

## Useful commands

```bash
# View logs
docker compose logs -f

# Stop
docker compose down

# Update to latest version (when published)
docker compose pull
docker compose up -d
docker compose exec web npx prisma migrate deploy

# Database GUI
docker compose exec web npx prisma studio
```

## Troubleshooting

**Caddy can't issue SSL cert**
- Check DNS has propagated: `nslookup app.yourdomain.com`
- Check ports 80 + 443 are reachable from the internet (firewall)
- Caddy logs: `docker compose logs caddy`

**Database migration error on first start**
- Wait for `postgres` container to become healthy: `docker compose ps`
- Then re-run: `docker compose exec web npx prisma migrate deploy`

**Reset everything (⚠️ deletes all data)**

```bash
docker compose down -v
docker compose up -d
docker compose exec web npx prisma migrate deploy
```
