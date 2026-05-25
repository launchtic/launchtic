#!/bin/bash
set -e

REPO_URL="https://github.com/TechFago/launchtic.git"
INSTALL_DIR="${INSTALL_DIR:-launchtic}"
ENV_FILE=".env"

# ANSI color codes — fall back to no-op on dumb terminals.
if [ -t 1 ] && [ "${TERM:-}" != "dumb" ]; then
  BOLD=$'\033[1m';  DIM=$'\033[2m';   RESET=$'\033[0m'
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; MAGENTA=$'\033[35m'
else
  BOLD=""; DIM=""; RESET=""; CYAN=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""
fi

echo ""
echo "${BOLD}${CYAN}  ╭──────────────────────────────────────────────╮${RESET}"
echo "${BOLD}${CYAN}  │${RESET}  ${BOLD}launch${BLUE}tic${RESET}${BOLD}  ${DIM}— self-host installer${RESET}            ${BOLD}${CYAN}│${RESET}"
echo "${BOLD}${CYAN}  ╰──────────────────────────────────────────────╯${RESET}"
echo ""

# ─── Pre-flight runtime checks ───────────────────────────────────────────────
# Fail fast & loud BEFORE pulling 2GB of Docker images. Every failure here is
# a config-only issue the operator can fix without re-running half the install.
preflight_fail() {
  echo ""
  echo "${BOLD}${YELLOW}  ✗ Pre-flight failed:${RESET} $1"
  echo "  ${DIM}Fix the issue above and re-run: ${RESET}${BOLD}bash install.sh${RESET}"
  echo ""
  exit 1
}

echo "  Running pre-flight checks..."

# Need root or sudo — we install packages, bind ports 80/443, mount volumes.
if [ "$(id -u)" != "0" ] && ! command -v sudo &>/dev/null; then
  preflight_fail "Need root (or sudo). Run as root or install sudo first."
fi

# Ports 80 + 443 free. Conflicts: existing nginx/apache, Plesk/cPanel, etc.
# Prefer 'ss' (iproute2, available on every modern Linux); fall back to lsof.
check_port_free() {
  local port="$1"
  local owner=""
  if command -v ss &>/dev/null; then
    owner=$(ss -tlnH "sport = :$port" 2>/dev/null | head -1)
  elif command -v lsof &>/dev/null; then
    owner=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1)
  else
    echo "  ⚠ Skipping port $port check ('ss' and 'lsof' both missing)"
    return 0
  fi
  if [ -n "$owner" ]; then
    echo ""
    echo "  Port $port is in use by:"
    echo "    $owner"
    preflight_fail "Free port $port (stop the listening process) then re-run."
  fi
}
check_port_free 80
check_port_free 443
echo "  ✓ Ports 80, 443 free"

# Disk space ≥ 5GB on partition holding the install dir.
# Need ~2GB for Docker images + headroom for Postgres + uploads.
INSTALL_PARENT=$(dirname "$(realpath -m "$INSTALL_DIR" 2>/dev/null || echo "$INSTALL_DIR")")
[ ! -d "$INSTALL_PARENT" ] && INSTALL_PARENT=$(pwd)
DISK_AVAIL_KB=$(df -Pk "$INSTALL_PARENT" 2>/dev/null | awk 'NR==2 {print $4}')
DISK_AVAIL_GB=$((${DISK_AVAIL_KB:-0} / 1024 / 1024))
if [ "$DISK_AVAIL_GB" -lt 5 ]; then
  preflight_fail "Need ≥5GB free on $INSTALL_PARENT (have ${DISK_AVAIL_GB}GB)."
fi
echo "  ✓ Disk: ${DISK_AVAIL_GB}GB free"

# RAM total ≥ 2GB. Next.js build OOMs below this on a stock VPS.
RAM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)
RAM_TOTAL_MB=$((${RAM_TOTAL_KB:-0} / 1024))
if [ "$RAM_TOTAL_MB" -lt 1900 ]; then  # 2GB = 2048MB, allow some metadata slack
  preflight_fail "Need ≥2GB RAM (have ${RAM_TOTAL_MB}MB). Add swap or upgrade VM."
fi
echo "  ✓ RAM: ${RAM_TOTAL_MB}MB"

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

# Domain config is no longer collected here. The first-run wizard at
# http://${SERVER_IP} walks the operator through admin + domain setup with
# inline DNS verification + Let's Encrypt cert issuance via Caddy admin API.

# ─── Auto-generate secrets ───────────────────────────────────────────────────
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

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
# Generated by install.sh — domains are configured in the browser wizard
# after first boot (http://<server-ip>) and stored in the SystemConfig DB row.

LAUNCHTIC_VERSION=latest

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

# ─── Pull pre-built images from GitHub Container Registry ────────────────────
# Images are built + published by the project's CI (.github/workflows/build.yml)
# on every push to main. Pulling avoids the 5-10 min local build + drops the
# host RAM requirement (no Next.js build = no 4GB peak). Operator that wants
# to build from source can swap `pull` → `build` here.
echo "  Pulling Docker images (1-2 minutes on first run)..."
docker compose pull
echo ""

# ─── Start services ──────────────────────────────────────────────────────────
echo "  Starting services..."
docker compose up -d
echo ""

# ─── Wait for web to be healthy ──────────────────────────────────────────────
# Best-effort wait against /api/health (probed from host through Caddy, so no
# wget dependency inside the container). On a fresh 2GB VPS the migration
# step can push past 60s, so 4 min budget. Timing out doesn't fail the
# install — the stack is already running, we just couldn't confirm it.
echo "  Waiting for app to start (this can take 1-3 min on first run)..."
HEALTHY=0
for i in $(seq 1 80); do
  if curl -fsS --max-time 2 "http://localhost/api/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 3
  printf "."
done
echo ""
if [ "$HEALTHY" != "1" ]; then
  echo ""
  echo "  ${YELLOW}⚠  Health check didn't pass yet — the app is probably still warming up.${RESET}"
  echo "  ${DIM}Check progress: ${RESET}${BOLD}cd ${INSTALL_DIR} && docker compose logs -f web${RESET}"
  echo "  ${DIM}Then open the URL below as soon as the web log shows 'Ready'.${RESET}"
  echo ""
fi

echo ""
echo "${GREEN}  ╭──────────────────────────────────────────────╮${RESET}"
echo "${GREEN}  │${RESET}  ${BOLD}${GREEN}✓ Launchtic is running${RESET}                       ${GREEN}│${RESET}"
echo "${GREEN}  ╰──────────────────────────────────────────────╯${RESET}"
echo ""
echo "  Finish setup in your browser:"
echo ""
echo "    ${BOLD}${CYAN}→  http://${SERVER_IP}${RESET}"
echo ""
