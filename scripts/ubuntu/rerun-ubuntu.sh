#!/usr/bin/env bash
set -euo pipefail

# Rebuild and re-run services after bot updates
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose"

echo "=============================================="
echo "  Shoukaku - Re-run After Bot Update (Linux)"
echo "=============================================="

# 0. Check Docker daemon

echo
echo "[0/6] Checking Docker daemon..."
if ! docker info >/dev/null 2>&1; then
  echo "  ERROR: Docker is not running. Start Docker first."
  exit 1
fi
echo "  Done - Docker daemon is running"

# Ensure network exists
if ! docker network inspect shoukaku-net >/dev/null 2>&1; then
  docker network create shoukaku-net >/dev/null
fi

# 1) Rebuild updated images

echo
echo "[1/6] Rebuilding bot image (no cache)..."
$COMPOSE -f docker-compose.yml build bot --no-cache
echo "  Done - Bot image rebuilt"

echo
echo "[2/6] Rebuilding yt-dlp API image (no cache)..."
$COMPOSE -f docker-compose.yml build ytdlp-api --no-cache
echo "  Done - yt-dlp API image rebuilt"

# 2) Recreate services in dependency order

echo
echo "[3/6] Restarting Lavalink..."
$COMPOSE -f docker-compose.lavalink.yml up -d --force-recreate
echo "  Done - Lavalink restarted"

echo
echo "[4/6] Restarting Cobalt..."
$COMPOSE -f docker-compose.cobalt.yml up -d --force-recreate
echo "  Done - Cobalt restarted"

echo
echo "[5/6] Restarting Monitoring..."
$COMPOSE -f docker-compose.monitoring.yml up -d --force-recreate
echo "  Done - Monitoring restarted"

echo
echo "[6/6] Restarting Bot + Database + Cache..."
$COMPOSE -f docker-compose.yml up -d --force-recreate
echo "  Done - Bot stack restarted"

echo
echo "Waiting for startup logs..."
sleep 8

echo
echo "Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "Recent bot logs:"
docker logs shoukaku-bot --tail 20 2>&1 || true
