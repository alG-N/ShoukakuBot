# ==========================================
# shoukaku - Rebuild & Restart Bot Only
# ==========================================

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\.."
. "$PSScriptRoot\common.ps1"

Write-Host ============================== -ForegroundColor Cyan
Write-Host "  shoukaku - Rebuild Bot" -ForegroundColor Cyan
Write-Host ============================== -ForegroundColor Cyan

# Check Docker daemon
Assert-DockerReady

Write-Host "`n[1/3] Probing external providers..." -ForegroundColor Yellow
Invoke-ExternalSitePreflight

# Ensure network exists
Ensure-DockerNetwork -Name "shoukaku-net"

Write-Host "`n[2/3] Building bot image..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'build', 'bot', '--no-cache') -FailureMessage 'Failed to build the bot image.'
Write-Host "  Done - Build complete" -ForegroundColor Green

Write-Host "`n[3/3] Restarting bot..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d', 'bot', '--force-recreate') -FailureMessage 'Failed to restart the bot container.'
Write-Host "  Done - Bot restarted" -ForegroundColor Green

Write-Host "`n[Dashboard] Verifying local dashboard access..." -ForegroundColor Yellow
[void](Wait-DashboardAccess -TimeoutSec 90)

Write-Host "`nRecent bot logs:" -ForegroundColor Cyan
Show-BotLogs -Tail 10
