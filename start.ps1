$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==========================================="
Write-Host "  AlterGolden - Starting All Services"
Write-Host "==========================================="

# 1. Create shared network
Write-Host ""
Write-Host "[1/5] Creating shared network..."
try { docker network create altergolden-net 2>&1 | Out-Null } catch {}
Write-Host "  Done - network altergolden-net ready"

# 2. Start Lavalink
Write-Host ""
Write-Host "[2/5] Starting Lavalink nodes..."
docker compose -f docker-compose.lavalink.yml up -d
Write-Host "  Done - Lavalink nodes starting"

# 3. Start Cobalt
Write-Host ""
Write-Host "[3/5] Starting Cobalt instances..."
docker compose -f docker-compose.cobalt.yml up -d
Write-Host "  Done - Cobalt instances starting"

# 4. Start Monitoring
Write-Host ""
Write-Host "[4/5] Starting Monitoring stack..."
docker compose -f docker-compose.monitoring.yml up -d
Write-Host "  Done - Monitoring starting"

# 5. Start Bot
Write-Host ""
Write-Host "[5/5] Starting Bot + Database + Cache..."
docker compose -f docker-compose.yml up -d
Write-Host "  Done - Bot starting"

Write-Host ""
Write-Host "==========================================="
Write-Host "  All services started!"
Write-Host "  Bot will auto-reconnect to Lavalink"
Write-Host "==========================================="

Write-Host ""
Write-Host "Container Status:"
docker ps --format 'table {{.Names}}  {{.Status}}'
