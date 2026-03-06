# ==========================================================
# shoukaku - Restart & Apply Changes
# Rebuilds bot + restarts all services with new config
# Usage: .\restart.ps1 [-BotOnly] [-ServicesOnly]
# ==========================================================

param(
    [switch]$BotOnly,        # Only rebuild & restart bot
    [switch]$ServicesOnly    # Only restart Docker services (no bot rebuild)
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  shoukaku - Restart & Apply Changes" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 0. Check Docker daemon
Write-Host "`n[0] Checking Docker daemon..." -ForegroundColor Gray
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Docker is not running! Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "  Docker is running" -ForegroundColor Green

# Ensure network exists
$ErrorActionPreference = "Continue"
$netResult = docker network create shoukaku-net 2>&1 | Out-String
$ErrorActionPreference = "Stop"

if ($ServicesOnly) {
    # ── Services-only restart (no bot rebuild) ──
    Write-Host "`n--- Restarting Docker services only ---" -ForegroundColor Yellow

    Write-Host "`n[1/4] Restarting Lavalink nodes..." -ForegroundColor Yellow
    docker compose -f docker-compose.lavalink.yml up -d --force-recreate
    Write-Host "  Lavalink restarted" -ForegroundColor Green

    Write-Host "`n[2/4] Restarting Cobalt instances..." -ForegroundColor Yellow
    docker compose -f docker-compose.cobalt.yml up -d --force-recreate
    Write-Host "  Cobalt restarted" -ForegroundColor Green

    Write-Host "`n[3/4] Restarting Monitoring..." -ForegroundColor Yellow
    docker compose -f docker-compose.monitoring.yml up -d --force-recreate
    Write-Host "  Monitoring restarted" -ForegroundColor Green

    Write-Host "`n[4/4] Restarting Bot + Database + Cache..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml up -d --force-recreate
    Write-Host "  Bot restarted" -ForegroundColor Green

} elseif ($BotOnly) {
    # ── Bot-only rebuild & restart ──
    Write-Host "`n--- Rebuilding & restarting bot only ---" -ForegroundColor Yellow

    Write-Host "`n[1/2] Building bot image (no cache)..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml build bot --no-cache
    Write-Host "  Build complete" -ForegroundColor Green

    Write-Host "`n[2/2] Restarting bot container..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml up -d bot --force-recreate
    Write-Host "  Bot restarted" -ForegroundColor Green

} else {
    # ── Full restart: rebuild bot + restart all services ──
    Write-Host "`n--- Full rebuild & restart ---" -ForegroundColor Yellow

    Write-Host "`n[1/6] Building bot image (no cache)..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml build bot --no-cache
    Write-Host "  Build complete" -ForegroundColor Green

    Write-Host "`n[2/6] Rebuilding yt-dlp API..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml build ytdlp-api --no-cache
    Write-Host "  yt-dlp API rebuilt" -ForegroundColor Green

    Write-Host "`n[3/6] Restarting Lavalink nodes..." -ForegroundColor Yellow
    docker compose -f docker-compose.lavalink.yml up -d --force-recreate
    Write-Host "  Lavalink restarted" -ForegroundColor Green

    Write-Host "`n[4/6] Restarting Cobalt instances..." -ForegroundColor Yellow
    docker compose -f docker-compose.cobalt.yml up -d --force-recreate
    Write-Host "  Cobalt restarted" -ForegroundColor Green

    Write-Host "`n[5/6] Restarting Monitoring..." -ForegroundColor Yellow
    docker compose -f docker-compose.monitoring.yml up -d --force-recreate
    Write-Host "  Monitoring restarted" -ForegroundColor Green

    Write-Host "`n[6/6] Restarting Bot + Database + Cache..." -ForegroundColor Yellow
    docker compose -f docker-compose.yml up -d --force-recreate
    Write-Host "  Bot restarted" -ForegroundColor Green
}

# Wait for services to start before showing status/logs
Write-Host "`nWaiting for services to initialize..." -ForegroundColor Gray
Start-Sleep 10

# Show container status
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  All changes applied!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "`nContainer Status:" -ForegroundColor Cyan
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | Select-Object -First 20
Write-Host ""

# Show recent bot logs
Write-Host "Recent bot logs:" -ForegroundColor Cyan
docker logs shoukaku-bot --tail 15 2>&1
