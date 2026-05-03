#!/usr/bin/env bash
# ==============================================================
# Shoukaku - Force Update to Latest Version (Linux)
# 
# What this does:
#   1. git pull latest code
#   2. Refreshes npm dependencies
#   3. Rebuilds bot image (no cache)
#   4. Restarts the bot container
#   5. Bot auto-deploys all slash commands to Discord on startup
#
# Usage:
#   bash scripts/ubuntu/update-ubuntu.sh
#   SKIP_NODE_DEP_UPDATES=1 bash scripts/ubuntu/update-ubuntu.sh  # Skip npm update
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

setup_error_trap
cd "$ROOT_DIR"

echo "=============================================="
echo "  Shoukaku - Force Update to Latest (Linux)"
echo "=============================================="

check_docker_ready
validate_env_soft

# ── 1. Probe external providers ────────────────────────────────
log_section "[1/5] Probing external providers..."
run_external_site_preflight

# ── 2. Pull latest code ────────────────────────────────────────
log_section "[2/5] Pulling latest code from git..."
if ! command -v git >/dev/null 2>&1; then
  log_warn "git not found — skipping git pull. Make sure code is already up-to-date."
else
  # Fail loudly if there are uncommitted changes that would conflict
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warn "Working tree has local changes. Stashing before pull..."
    git stash push -m "auto-stash before update-ubuntu.sh $(date '+%Y-%m-%d %H:%M:%S')"
  fi

  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
  log_info "Current branch: $BRANCH"

  git pull --ff-only origin "$BRANCH"
  COMMIT="$(git log -1 --pretty='%h %s' 2>/dev/null || echo 'unknown')"
  log_ok "Up to date: $COMMIT"
fi

# ── 3. Refresh npm dependencies ────────────────────────────────
log_section "[3/5] Refreshing npm dependencies..."
refresh_direct_npm_dependencies

# ── 4. Rebuild bot image (no cache) ────────────────────────────
log_section "[4/5] Rebuilding bot image (no cache)..."
$COMPOSE -f docker-compose.yml build bot --no-cache
log_ok "Bot image rebuilt"

# ── 5. Restart bot only ────────────────────────────────────────
# Database and Redis are kept running — no downtime for those services.
# The bot will auto-deploy all slash commands to Discord when it starts.
log_section "[5/5] Restarting bot container..."
$COMPOSE -f docker-compose.yml up -d bot --force-recreate
wait_stack_running "docker-compose.yml" "Bot stack" 120

log_section "[Dashboard] Verifying local dashboard access..."
wait_dashboard_access 90 || true

echo
echo "Waiting for bot to initialize and deploy commands..."
sleep 10

echo
echo "Recent bot startup logs:"
docker logs shoukaku-bot --tail 25 2>&1 || true

echo
echo "=============================================="
echo "  Update complete!"
echo "  Slash commands are being deployed to Discord."
echo "  They will appear in all servers within ~1 min."
echo "=============================================="

print_container_summary
