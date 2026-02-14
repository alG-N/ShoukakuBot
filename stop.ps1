# ═══════════════════════════════════════════════════════════════
# AlterGolden - Stop All Services
# Usage: .\stop.ps1 [-RemoveNetwork]
# ═══════════════════════════════════════════════════════════════

param([switch]$RemoveNetwork)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "═══════════════════════════════════════════" -ForegroundColor Red
Write-Host "  AlterGolden - Stopping All Services" -ForegroundColor Red
Write-Host "═══════════════════════════════════════════" -ForegroundColor Red

# Stop in reverse order
Write-Host "`n[1/4] Stopping Bot..." -ForegroundColor Yellow
docker compose -f docker-compose.yml down
Write-Host "  ✅ Bot stopped" -ForegroundColor Green

Write-Host "`n[2/4] Stopping Monitoring..." -ForegroundColor Yellow
docker compose -f docker-compose.monitoring.yml down
Write-Host "  ✅ Monitoring stopped" -ForegroundColor Green

Write-Host "`n[3/4] Stopping Cobalt..." -ForegroundColor Yellow
docker compose -f docker-compose.cobalt.yml down
Write-Host "  ✅ Cobalt stopped" -ForegroundColor Green

Write-Host "`n[4/4] Stopping Lavalink..." -ForegroundColor Yellow
docker compose -f docker-compose.lavalink.yml down
Write-Host "  ✅ Lavalink stopped" -ForegroundColor Green

# Remove network if flag passed or user confirms interactively
if ($RemoveNetwork) {
    docker network rm altergolden-net 2>$null
    Write-Host "  ✅ Network removed" -ForegroundColor Green
} elseif ([Environment]::UserInteractive) {
    $removeNet = Read-Host "`nRemove shared network? (y/N)"
    if ($removeNet -eq 'y') {
        docker network rm altergolden-net 2>$null
        Write-Host "  ✅ Network removed" -ForegroundColor Green
    }
}

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Red
Write-Host "  All services stopped!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Red
