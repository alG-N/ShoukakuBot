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

log_section "[1/9] Probing external providers..."
run_external_site_preflight

log_section "[2/9] Refreshing direct npm dependencies to latest..."
refresh_direct_npm_dependencies

log_section "[3/9] Ensuring shared network..."
ensure_network "shoukaku-net"

log_section "[4/9] Rebuilding bot image (no cache)..."
$COMPOSE -f docker-compose.yml build bot --no-cache
log_ok "Bot image rebuilt"

log_section "[5/9] Rebuilding yt-dlp API image (no cache)..."
$COMPOSE -f docker-compose.yml build ytdlp-api --no-cache
log_ok "yt-dlp API image rebuilt"

log_section "[6/9] Restarting Lavalink..."
compose_up_retry "docker-compose.lavalink.yml" --force-recreate
wait_stack_running "docker-compose.lavalink.yml" "Lavalink" 90
wait_lavalink_version_ready 180

log_section "[7/9] Restarting Cobalt..."
compose_up_retry "docker-compose.cobalt.yml" --force-recreate
wait_stack_running "docker-compose.cobalt.yml" "Cobalt" 90

log_section "[8/9] Restarting Monitoring..."
compose_up_retry "docker-compose.monitoring.yml" --force-recreate
wait_stack_running "docker-compose.monitoring.yml" "Monitoring" 120

log_section "[9/9] Restarting Bot + Database + Cache..."
compose_up_retry "docker-compose.yml" --force-recreate
wait_stack_running "docker-compose.yml" "Bot stack" 120

log_section "[Dashboard] Verifying local dashboard access..."
wait_dashboard_access 90 || true

echo
echo "Waiting for startup logs..."
sleep 8 

print_container_summary

echo
echo "Recent bot logs:"
docker logs shoukaku-bot --tail 20 2>&1 || true
