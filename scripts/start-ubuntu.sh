#!/usr/bin/env bash
set -euo pipefail

# Start the full Shoukaku stack on Linux/Ubuntu
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose"

echo "==========================================="
echo "  Shoukaku - Starting All Services (Linux)"
echo "==========================================="

# 0. Check Docker daemon

echo
echo "[0/5] Checking Docker daemon..."
if ! docker info >/dev/null 2>&1; then
  echo "  ERROR: Docker is not running. Start Docker first."
  exit 1
fi
echo "  Done - Docker daemon is running"

# 0.5 Validate required env vars in .env
if [[ -f .env ]]; then
  missing=()
  grep -Eq '^BOT_TOKEN=.+' .env || missing+=("BOT_TOKEN")
  grep -Eq '^CLIENT_ID=.+' .env || missing+=("CLIENT_ID")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "  WARNING: Missing required env vars in .env: ${missing[*]}"
  fi
else
  echo "  WARNING: No .env file found. Bot will fail to start."
fi

# 1. Create shared network

echo
echo "[1/5] Creating shared network..."
if ! docker network inspect shoukaku-net >/dev/null 2>&1; then
  docker network create shoukaku-net >/dev/null
fi
echo "  Done - network shoukaku-net ready"

# 2. Start Lavalink

echo
echo "[2/5] Starting Lavalink nodes..."
$COMPOSE -f docker-compose.lavalink.yml up -d
echo "  Done - Lavalink nodes starting"

# 2.5 Wait for at least one Lavalink node to be healthy

echo
echo "[2.5] Waiting for Lavalink to be ready..."
max_wait=60
waited=0
lavalink_ready=false

while [[ $waited -lt $max_wait ]]; do
  if curl -fsS --max-time 2 "http://localhost:2333/version" >/dev/null 2>&1; then
    lavalink_ready=true
    break
  fi
  sleep 3
  waited=$((waited + 3))
  printf "  Waiting... (%ss/%ss)\r" "$waited" "$max_wait"
done

echo
if [[ "$lavalink_ready" == "true" ]]; then
  echo "  Done - Lavalink node-1 is healthy"
else
  echo "  WARNING: Lavalink not ready after ${max_wait}s (bot will auto-reconnect)"
fi

# 3. Start Cobalt

echo
echo "[3/5] Starting Cobalt instances..."
$COMPOSE -f docker-compose.cobalt.yml up -d
echo "  Done - Cobalt instances starting"

# 4. Start Monitoring

echo
echo "[4/5] Starting Monitoring stack..."
$COMPOSE -f docker-compose.monitoring.yml up -d
echo "  Done - Monitoring starting"

# 5. Start Bot

echo
echo "[5/5] Starting Bot + Database + Cache..."
$COMPOSE -f docker-compose.yml up -d
echo "  Done - Bot starting"

echo
echo "==========================================="
echo "  All services started"
echo "==========================================="
echo
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
