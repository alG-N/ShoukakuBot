# ==========================================
# shoukaku - Stop All Services
# Usage: .\stop.ps1 [-RemoveNetwork]
# ==========================================

param([switch]$RemoveNetwork)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ============================== -ForegroundColor Red
Write-Host "  shoukaku - Stopping All Services" -ForegroundColor Red
Write-Host ============================== -ForegroundColor Red

# Stop in reverse order
Write-Host "`n[1/4] Stopping Bot..." -ForegroundColor Yellow
docker compose -f docker-compose.yml down
Write-Host "  âœ… Bot stopped" -ForegroundColor Green

Write-Host "`n[2/4] Stopping Monitoring..." -ForegroundColor Yellow
docker compose -f docker-compose.monitoring.yml down
Write-Host "  âœ… Monitoring stopped" -ForegroundColor Green

Write-Host "`n[3/4] Stopping Cobalt..." -ForegroundColor Yellow
docker compose -f docker-compose.cobalt.yml down
Write-Host "  âœ… Cobalt stopped" -ForegroundColor Green

Write-Host "`n[4/4] Stopping Lavalink..." -ForegroundColor Yellow
docker compose -f docker-compose.lavalink.yml down
Write-Host "  âœ… Lavalink stopped" -ForegroundColor Green

# Remove network if flag passed or user confirms interactively
if ($RemoveNetwork) {
    docker network rm shoukaku-net 2>$null
    Write-Host "  âœ… Network removed" -ForegroundColor Green
} elseif ([Environment]::UserInteractive) {
    $removeNet = Read-Host "`nRemove shared network? (y/N)"
    if ($removeNet -eq 'y') {
        docker network rm shoukaku-net 2>$null
        Write-Host "  âœ… Network removed" -ForegroundColor Green
    }
}

Write-Host "`n=============================" -ForegroundColor Red
Write-Host "  All services stopped!" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Red
