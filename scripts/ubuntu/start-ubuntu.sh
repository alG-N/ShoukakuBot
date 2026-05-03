#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

setup_error_trap
cd "$ROOT_DIR"

echo "==========================================="
echo "  Shoukaku - Starting All Services (Linux)"
echo "==========================================="

check_docker_ready
validate_env_soft

log_section "[1/8] Probing external providers..."
run_external_site_preflight

log_section "[2/8] Refreshing direct npm dependencies to latest..."
refresh_direct_npm_dependencies

log_section "[3/8] Ensuring shared network..."
ensure_network "shoukaku-net"

log_section "[4/8] Starting Lavalink stack..."
compose_up_retry "docker-compose.lavalink.yml"
wait_stack_running "docker-compose.lavalink.yml" "Lavalink" 90
wait_lavalink_version_ready 180

log_section "[5/8] Starting Cobalt stack..."
compose_up_retry "docker-compose.cobalt.yml"
wait_stack_running "docker-compose.cobalt.yml" "Cobalt" 90

log_section "[6/8] Starting Monitoring stack..."
compose_up_retry "docker-compose.monitoring.yml"
wait_stack_running "docker-compose.monitoring.yml" "Monitoring" 120

log_section "[7/8] Starting Bot + Database + Cache stack..."
compose_up_retry "docker-compose.yml"
wait_stack_running "docker-compose.yml" "Bot stack" 120

log_section "[8/8] Final verification..."
print_container_summary

echo
echo "==========================================="
echo "  Startup flow completed"
echo "==========================================="
