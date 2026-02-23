# ==========================================
# shoukaku - Rebuild & Restart Bot Only
# ==========================================

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

Write-Host ============================== -ForegroundColor Cyan
Write-Host "  shoukaku - Rebuild Bot" -ForegroundColor Cyan
Write-Host ============================== -ForegroundColor Cyan

# Check Docker daemon
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running! Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Ensure network exists
$netResult = docker network create shoukaku-net 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -and $netResult -notmatch "already exists") {
    Write-Host "ERROR: Failed to create network: $netResult" -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/2] Building bot image..." -ForegroundColor Yellow
docker compose -f docker-compose.yml build bot --no-cache
Write-Host "  âœ… Build complete" -ForegroundColor Green

Write-Host "`n[2/2] Restarting bot..." -ForegroundColor Yellow
docker compose -f docker-compose.yml up -d bot --force-recreate
Write-Host "  âœ… Bot restarted" -ForegroundColor Green

Write-Host "`nWaiting for startup..." -ForegroundColor Gray
Start-Sleep 10
docker logs shoukaku-bot --tail 10 2>&1
