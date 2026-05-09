#!/bin/bash
set -e

REPO_URL="https://github.com/TechFago/launchtic.git"
INSTALL_DIR="${INSTALL_DIR:-launchtic}"
ENV_FILE=".env"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Launchtic Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Check + auto-install dependencies ───────────────────────────────────────
need_root_for_install() {
  if [ "$(id -u)" != "0" ] && ! command -v sudo &>/dev/null; then
    echo "✗ Need root (or sudo) to install missing dependencies."
    exit 1
  fi
}

# Run a command as root (no-op if already root, otherwise via sudo).
as_root() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  else
    sudo "$@"
  fi
}

if ! command -v git &>/dev/null; then
  need_root_for_install
  echo "  Git not found — installing..."
  if command -v apt-get &>/dev/null; then
    as_root apt-get update -qq
    as_root apt-get install -y -qq git
  elif command -v yum &>/dev/null; then
    as_root yum install -y -q git
  elif command -v dnf &>/dev/null; then
    as_root dnf install -y -q git
  else
    echo "✗ Could not auto-install git. Install manually then re-run."
    exit 1
  fi
fi

if ! command -v docker &>/dev/null; then
  need_root_for_install
  echo "  Docker not found — installing automatically..."
  echo "  (Uses the official get.docker.com script — takes 1-2 minutes)"
  if [ "$(id -u)" = "0" ]; then
    curl -fsSL https://get.docker.com | sh
  else
    curl -fsSL https://get.docker.com | sudo sh
    echo ""
    echo "  Adding $USER to the 'docker' group..."
    sudo usermod -aG docker "$USER"
    echo "  ⚠ Log out + log in (or run \`newgrp docker\`) so the group change takes effect."
    echo "    Then re-run this installer."
    exit 0
  fi
fi

if ! docker compose version &>/dev/null; then
  echo "✗ Docker Compose v2 missing — your Docker install is too old."
  echo "  Reinstall Docker: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

echo "✓ Docker $(docker --version | awk '{print $3}' | tr -d ',')"
echo "✓ Docker Compose $(docker compose version --short)"
echo "✓ Git $(git --version | awk '{print $3}')"
echo ""

# ─── Detect server IP ─────────────────────────────────────────────────────────
# Force IPv4 (-4) since DNS A records typically point to IPv4 — comparing
# detected IP against domain resolution would fail if we picked IPv6.
SERVER_IP=$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null || curl -4 -s --max-time 5 api.ipify.org 2>/dev/null || echo "unknown")
echo "  Server IP: ${SERVER_IP}"
echo ""

# ─── Collect domain inputs ────────────────────────────────────────────────────
read -p "  Enter your app domain  (e.g. app.yourdomain.com): " APP_DOMAIN
read -p "  Enter your pages domain (e.g. pages.yourdomain.com): " PAGES_DOMAIN
echo ""

# ─── Validate domain format ──────────────────────────────────────────────────
validate_domain() {
  if [[ ! "$1" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+$ ]]; then
    echo "✗ Invalid domain format: $1"
    exit 1
  fi
}
validate_domain "$APP_DOMAIN"
validate_domain "$PAGES_DOMAIN"

# ─── DNS check (warn, don't block) ───────────────────────────────────────────
check_dns() {
  local domain="$1"
  local resolved
  resolved=$(dig +short "$domain" 2>/dev/null | tail -1)
  if [ -z "$resolved" ]; then
    echo "  ⚠ $domain: DNS not resolved yet — SSL cert will issue once DNS propagates"
  elif [ "$resolved" = "$SERVER_IP" ]; then
    echo "  ✓ $domain → $resolved"
  else
    echo "  ⚠ $domain → $resolved (expected $SERVER_IP) — check your DNS A record"
  fi
}

if command -v dig &>/dev/null; then
  check_dns "$APP_DOMAIN"
  check_dns "$PAGES_DOMAIN"
fi
echo ""

# ─── ACME email (Let's Encrypt cert renewal warnings) ────────────────────────
DEFAULT_ACME_EMAIL="admin@$(echo "$APP_DOMAIN" | awk -F'.' '{print $(NF-1)"."$NF}')"
read -p "  Enter SSL contact email [${DEFAULT_ACME_EMAIL}]: " ACME_EMAIL_INPUT
ACME_EMAIL="${ACME_EMAIL_INPUT:-$DEFAULT_ACME_EMAIL}"
echo ""

# ─── Auto-generate secrets ───────────────────────────────────────────────────
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# ─── Derive URL vars from domain inputs ──────────────────────────────────────
# Apps read APP_URL / NEXTAUTH_URL / RENDERER_URL directly at runtime, so we
# resolve them once here and write the result into .env. localhost / 127.x get
# http://, everything else gets https:// (Caddy provisions the cert).
case "$APP_DOMAIN"   in localhost*|127.*) APP_PROTO=http   ;; *) APP_PROTO=https   ;; esac
case "$PAGES_DOMAIN" in localhost*|127.*) PAGES_PROTO=http ;; *) PAGES_PROTO=https ;; esac
APP_URL="${APP_PROTO}://${APP_DOMAIN}"
RENDERER_URL="${PAGES_PROTO}://${PAGES_DOMAIN}"
NEXTAUTH_URL="${APP_URL}"

# ─── Clone repo (or update if already present) ───────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Updating existing installation in ./${INSTALL_DIR}..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "  Cloning Launchtic source into ./${INSTALL_DIR}..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
echo ""

# ─── Write .env ──────────────────────────────────────────────────────────────
# Don't overwrite an existing .env — operator may have customized it.
if [ -f "$ENV_FILE" ]; then
  echo "  Existing .env detected — keeping it (delete manually if you want to regenerate)"
else
  cat > "$ENV_FILE" <<EOF
# ─── Launchtic Configuration ─────────────────────────────────────────────────
# Generated by install.sh

LAUNCHTIC_VERSION=latest

# ─── Domains ─────────────────────────────────────────────────────────────────
APP_DOMAIN=${APP_DOMAIN}
PAGES_DOMAIN=${PAGES_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# ─── Public URLs ─────────────────────────────────────────────────────────────
# Read directly by the apps at runtime. If you change APP_DOMAIN/PAGES_DOMAIN
# above (e.g. migrating to a new domain), update these too — or delete this
# file and re-run install.sh to regenerate.
APP_URL=${APP_URL}
NEXTAUTH_URL=${NEXTAUTH_URL}
RENDERER_URL=${RENDERER_URL}

# ─── Internal service URLs (Docker network) ──────────────────────────────────
WEB_API_URL=http://web:3000

# ─── Database ────────────────────────────────────────────────────────────────
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/launchtic

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── Secrets (auto-generated) ────────────────────────────────────────────────
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ─── Runtime ─────────────────────────────────────────────────────────────────
NODE_ENV=production

# Stripe / PayPal / SMTP / S3 / AI keys are configured per-workspace via the
# dashboard and stored encrypted in the database — not here.
EOF
  echo "✓ .env created"
fi
echo ""

# ─── Build images locally ────────────────────────────────────────────────────
# Builds locally for now; nothing is baked-in at build time anymore (all URLs
# are read from env at runtime), so switching to `docker compose pull` against
# a published registry image is also a valid choice for users that prefer it.
echo "  Building Docker images (5-10 minutes on first run)..."
docker compose build
echo ""

# ─── Start services ──────────────────────────────────────────────────────────
echo "  Starting services..."
docker compose up -d
echo ""

# ─── Wait for web to be healthy ──────────────────────────────────────────────
echo "  Waiting for app to start..."
ATTEMPTS=0
until docker compose exec -T web wget -q --spider http://localhost:3000/api/health 2>/dev/null || [ $ATTEMPTS -ge 60 ]; do
  sleep 3
  ATTEMPTS=$((ATTEMPTS + 1))
  printf "."
done
echo ""

if [ $ATTEMPTS -ge 60 ]; then
  echo "  ⚠ App did not respond within 3 minutes."
  echo "  Check logs:  cd ${INSTALL_DIR} && docker compose logs -f"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✓ Launchtic is running!"
echo ""
echo "  Dashboard:  https://${APP_DOMAIN}"
echo "  Pages:      https://${PAGES_DOMAIN}"
echo ""
echo "  Open the dashboard to create your admin account."
echo ""
echo "  To update later:"
echo "    cd ${INSTALL_DIR} && git pull && docker compose up -d --build"
echo ""
echo "  Logs:    cd ${INSTALL_DIR} && docker compose logs -f"
echo "  Stop:    cd ${INSTALL_DIR} && docker compose down"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
