#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

setup_error_trap
cd "$ROOT_DIR"

echo "=============================================="
echo "  Shoukaku - Re-run After Bot Update (Linux)"
echo "=============================================="

check_docker_ready
validate_env_soft

log_section "[1/7] Ensuring shared network..."
ensure_network "shoukaku-net"

log_section "[2/7] Rebuilding bot image (no cache)..."
$COMPOSE -f docker-compose.yml build bot --no-cache
log_ok "Bot image rebuilt"

log_section "[3/7] Rebuilding yt-dlp API image (no cache)..."
$COMPOSE -f docker-compose.yml build ytdlp-api --no-cache
log_ok "yt-dlp API image rebuilt"

log_section "[4/7] Restarting Lavalink..."
$COMPOSE -f docker-compose.lavalink.yml up -d --force-recreate
wait_stack_running "docker-compose.lavalink.yml" "Lavalink" 90
wait_lavalink_version_ready 180

log_section "[5/7] Restarting Cobalt..."
$COMPOSE -f docker-compose.cobalt.yml up -d --force-recreate
wait_stack_running "docker-compose.cobalt.yml" "Cobalt" 90

log_section "[6/7] Restarting Monitoring..."
$COMPOSE -f docker-compose.monitoring.yml up -d --force-recreate
wait_stack_running "docker-compose.monitoring.yml" "Monitoring" 120

log_section "[7/7] Restarting Bot + Database + Cache..."
$COMPOSE -f docker-compose.yml up -d --force-recreate
wait_stack_running "docker-compose.yml" "Bot stack" 120

echo
echo "Waiting for startup logs..."
sleep 8

print_container_summary

echo
echo "Recent bot logs:"
docker logs shoukaku-bot --tail 20 2>&1 || true
