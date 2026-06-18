#!/usr/bin/env bash
# Public-demo reset. Restores the demo instance to a fixed baseline so visitor
# edits don't pile up. Run ONCE to capture the baseline after building the demo
# content, then let cron restore it on a schedule.
#
#   ./demo-reset.sh snapshot   # capture current DB + uploads as the baseline
#   ./demo-reset.sh            # restore the baseline (run by cron, e.g. daily)
#
# Run from the Launchtic install dir (where docker-compose.yml + .env live).
set -euo pipefail

[ -f docker-compose.yml ] || { echo "✗ Run from the install dir (no docker-compose.yml here)."; exit 1; }

BASELINE_DIR="demo-baseline"
DB_SERVICE="postgres"
DB_NAME="launchtic"
DB_USER="postgres"

snapshot() {
  mkdir -p "$BASELINE_DIR"
  echo "▶ Capturing DB baseline..."
  docker compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BASELINE_DIR/db.dump"
  echo "▶ Capturing uploads baseline..."
  tar -czf "$BASELINE_DIR/uploads.tar.gz" uploads 2>/dev/null || true
  echo "✓ Baseline saved to $BASELINE_DIR/ — this is what every reset restores."
}

restore() {
  [ -f "$BASELINE_DIR/db.dump" ] || { echo "✗ No baseline yet. Run: $0 snapshot"; exit 1; }

  # Stop the app services first so they release their DB connections — pg_restore
  # --clean can't drop objects while sessions hold them. Postgres stays up.
  echo "▶ Stopping app services..."
  docker compose stop web worker renderer

  echo "▶ Restoring DB from baseline..."
  docker compose exec -T "$DB_SERVICE" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$BASELINE_DIR/db.dump"

  echo "▶ Restoring uploads..."
  if [ -f "$BASELINE_DIR/uploads.tar.gz" ]; then
    # Clear contents in place — do NOT `rm -rf uploads`. Caddy bind-mounts this
    # dir and isn't restarted here; replacing the dir's inode leaves Caddy serving
    # the old (deleted) inode → restored images 404. Emptying in place keeps the
    # inode, so Caddy sees the new files live.
    mkdir -p uploads
    find uploads -mindepth 1 -delete 2>/dev/null || true
    tar -xzf "$BASELINE_DIR/uploads.tar.gz"
  fi

  echo "▶ Starting app services..."
  docker compose start web worker renderer
  echo "✓ Demo reset to baseline."
}

case "${1:-restore}" in
  snapshot) snapshot ;;
  restore)  restore ;;
  *) echo "Usage: $0 [snapshot|restore]"; exit 1 ;;
esac
