# ==========================================
# shoukaku - Stop All Services
# Usage: .\stop.ps1 [-RemoveNetwork]
# ==========================================

param([switch]$RemoveNetwork)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\.."
. "$PSScriptRoot\common.ps1"

Write-Host ============================== -ForegroundColor Red
Write-Host "  shoukaku - Stopping All Services" -ForegroundColor Red
Write-Host ============================== -ForegroundColor Red

Assert-DockerReady

# Stop in reverse order
Write-Host "`n[1/4] Stopping Bot..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'down') -FailureMessage 'Failed to stop the bot stack.'
Write-Host "  Done - Bot stopped" -ForegroundColor Green

Write-Host "`n[2/4] Stopping Monitoring..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.monitoring.yml', 'down') -FailureMessage 'Failed to stop Monitoring.'
Write-Host "  Done - Monitoring stopped" -ForegroundColor Green

Write-Host "`n[3/4] Stopping Cobalt..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.cobalt.yml', 'down') -FailureMessage 'Failed to stop Cobalt.'
Write-Host "  Done - Cobalt stopped" -ForegroundColor Green

Write-Host "`n[4/4] Stopping Lavalink..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.lavalink.yml', 'down') -FailureMessage 'Failed to stop Lavalink.'
Write-Host "  Done - Lavalink stopped" -ForegroundColor Green

# Remove network if flag passed or user confirms interactively
if ($RemoveNetwork) {
    Remove-DockerNetworkIfExists -Name "shoukaku-net"
} elseif ([Environment]::UserInteractive) {
    $removeNet = Read-Host "`nRemove shared network? (y/N)"
    if ($removeNet -eq 'y') {
        Remove-DockerNetworkIfExists -Name "shoukaku-net"
    }
}

Write-Host "`n=============================" -ForegroundColor Red
Write-Host "  All services stopped!" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Red
Write-Host "`nContainer Status:" -ForegroundColor Cyan
Show-ContainerSummary
