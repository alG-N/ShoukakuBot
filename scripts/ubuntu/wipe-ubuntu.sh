#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

setup_error_trap
cd "$ROOT_DIR"

echo "=============================================="
echo "  Shoukaku - Wipe All Services (Linux)"
echo "=============================================="

check_docker_ready

echo
echo "[1/5] Removing Bot + Database + Cache..."
$COMPOSE -f docker-compose.yml down -v --remove-orphans --rmi all || true
wait_stack_removed "docker-compose.yml" "Bot stack" 30

echo
echo "[2/5] Removing Monitoring stack..."
$COMPOSE -f docker-compose.monitoring.yml down -v --remove-orphans --rmi all || true
wait_stack_removed "docker-compose.monitoring.yml" "Monitoring" 30

echo
echo "[3/5] Removing Cobalt stack..."
$COMPOSE -f docker-compose.cobalt.yml down -v --remove-orphans --rmi all || true
wait_stack_removed "docker-compose.cobalt.yml" "Cobalt" 30

echo
echo "[4/5] Removing Lavalink stack..."
$COMPOSE -f docker-compose.lavalink.yml down -v --remove-orphans --rmi all || true
wait_stack_removed "docker-compose.lavalink.yml" "Lavalink" 30

echo
echo "[5/5] Removing shared network..."
docker network rm shoukaku-net >/dev/null 2>&1 || true

echo
echo "Nuking ALL Docker resources (images, volumes, networks, build cache)..."
docker system prune -af --volumes >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true

echo
echo "=============================================="
echo "  Wipe complete"
echo "=============================================="

print_container_summary
