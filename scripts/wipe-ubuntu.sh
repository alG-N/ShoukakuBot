#!/usr/bin/env bash
set -euo pipefail

# Stop and remove the entire Shoukaku stack (containers, volumes, images, network)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose"

echo "=============================================="
echo "  Shoukaku - Wipe All Services (Linux)"
echo "=============================================="

echo
echo "[1/5] Removing Bot + Database + Cache..."
$COMPOSE -f docker-compose.yml down -v --remove-orphans --rmi all || true

echo
echo "[2/5] Removing Monitoring stack..."
$COMPOSE -f docker-compose.monitoring.yml down -v --remove-orphans --rmi all || true

echo
echo "[3/5] Removing Cobalt stack..."
$COMPOSE -f docker-compose.cobalt.yml down -v --remove-orphans --rmi all || true

echo
echo "[4/5] Removing Lavalink stack..."
$COMPOSE -f docker-compose.lavalink.yml down -v --remove-orphans --rmi all || true

echo
echo "[5/5] Removing shared network..."
docker network rm shoukaku-net >/dev/null 2>&1 || true

echo
echo "Pruning dangling Docker resources..."
docker image prune -f >/dev/null 2>&1 || true
docker volume prune -f >/dev/null 2>&1 || true

echo
echo "=============================================="
echo "  Wipe complete"
echo "=============================================="
