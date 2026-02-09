# ═══════════════════════════════════════════════════════════════
# AlterGolden - Rebuild & Restart Bot Only
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AlterGolden - Rebuild Bot" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

# Ensure network exists
docker network create altergolden-net 2>$null

Write-Host "`n[1/2] Building bot image..." -ForegroundColor Yellow
docker compose -f docker-compose.yml build bot --no-cache
Write-Host "  ✅ Build complete" -ForegroundColor Green

Write-Host "`n[2/2] Restarting bot..." -ForegroundColor Yellow
docker compose -f docker-compose.yml up -d bot --force-recreate
Write-Host "  ✅ Bot restarted" -ForegroundColor Green

Write-Host "`nWaiting for startup..." -ForegroundColor Gray
Start-Sleep 10
docker logs altergolden-bot --tail 10 2>&1
