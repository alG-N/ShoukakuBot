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

log_section "[1/7] Refreshing direct npm dependencies to latest..."
refresh_direct_npm_dependencies

log_section "[2/7] Ensuring shared network..."
ensure_network "shoukaku-net"

log_section "[3/7] Starting Lavalink stack..."
compose_up_retry "docker-compose.lavalink.yml"
wait_stack_running "docker-compose.lavalink.yml" "Lavalink" 90
wait_lavalink_version_ready 180

log_section "[4/7] Starting Cobalt stack..."
compose_up_retry "docker-compose.cobalt.yml"
wait_stack_running "docker-compose.cobalt.yml" "Cobalt" 90

log_section "[5/7] Starting Monitoring stack..."
compose_up_retry "docker-compose.monitoring.yml"
wait_stack_running "docker-compose.monitoring.yml" "Monitoring" 120

log_section "[6/7] Starting Bot + Database + Cache stack..."
compose_up_retry "docker-compose.yml"
wait_stack_running "docker-compose.yml" "Bot stack" 120

log_section "[7/7] Final verification..."
print_container_summary

echo
echo "==========================================="
echo "  Startup flow completed"
echo "==========================================="
