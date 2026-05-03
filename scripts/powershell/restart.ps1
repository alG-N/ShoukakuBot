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
Set-Location "$PSScriptRoot\..\.."
. "$PSScriptRoot\common.ps1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  shoukaku - Restart & Apply Changes" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 0. Check Docker daemon
Write-Host "`n[0] Checking Docker daemon..." -ForegroundColor Gray
Assert-DockerReady
Write-Host "  Docker is running" -ForegroundColor Green

# Ensure network exists
Ensure-DockerNetwork -Name "shoukaku-net"

if ($ServicesOnly) {
    # ── Services-only restart (no bot rebuild) ──
    Write-Host "`n--- Restarting Docker services only ---" -ForegroundColor Yellow

    Write-Host "`n[1/5] Probing external providers..." -ForegroundColor Yellow
    Invoke-ExternalSitePreflight

    Write-Host "`n[2/5] Restarting Lavalink nodes..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.lavalink.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Lavalink.'
    Write-Host "  Lavalink restarted" -ForegroundColor Green

    Write-Host "`n[3/5] Restarting Cobalt instances..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.cobalt.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Cobalt.'
    Write-Host "  Cobalt restarted" -ForegroundColor Green

    Write-Host "`n[4/5] Restarting Monitoring..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.monitoring.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Monitoring.'
    Write-Host "  Monitoring restarted" -ForegroundColor Green

    Write-Host "`n[5/5] Restarting Bot + Database + Cache..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart the bot stack.'
    Write-Host "  Bot restarted" -ForegroundColor Green

} elseif ($BotOnly) {
    # ── Bot-only rebuild & restart ──
    Write-Host "`n--- Rebuilding & restarting bot only ---" -ForegroundColor Yellow

    Write-Host "`n[1/3] Probing external providers..." -ForegroundColor Yellow
    Invoke-ExternalSitePreflight

    Write-Host "`n[2/3] Building bot image (no cache)..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'build', 'bot', '--no-cache') -FailureMessage 'Failed to build the bot image.'
    Write-Host "  Build complete" -ForegroundColor Green

    Write-Host "`n[3/3] Restarting bot container..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d', 'bot', '--force-recreate') -FailureMessage 'Failed to restart the bot container.'
    Write-Host "  Bot restarted" -ForegroundColor Green

} else {
    # ── Full restart: rebuild bot + restart all services ──
    Write-Host "`n--- Full rebuild & restart ---" -ForegroundColor Yellow

    Write-Host "`n[1/7] Probing external providers..." -ForegroundColor Yellow
    Invoke-ExternalSitePreflight

    Write-Host "`n[2/7] Building bot image (no cache)..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'build', 'bot', '--no-cache') -FailureMessage 'Failed to build the bot image.'
    Write-Host "  Build complete" -ForegroundColor Green

    Write-Host "`n[3/7] Rebuilding yt-dlp API..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'build', 'ytdlp-api', '--no-cache') -FailureMessage 'Failed to rebuild the yt-dlp API image.'
    Write-Host "  yt-dlp API rebuilt" -ForegroundColor Green

    Write-Host "`n[4/7] Restarting Lavalink nodes..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.lavalink.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Lavalink.'
    Write-Host "  Lavalink restarted" -ForegroundColor Green

    Write-Host "`n[5/7] Restarting Cobalt instances..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.cobalt.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Cobalt.'
    Write-Host "  Cobalt restarted" -ForegroundColor Green

    Write-Host "`n[6/7] Restarting Monitoring..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.monitoring.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart Monitoring.'
    Write-Host "  Monitoring restarted" -ForegroundColor Green

    Write-Host "`n[7/7] Restarting Bot + Database + Cache..." -ForegroundColor Yellow
    Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d', '--force-recreate') -FailureMessage 'Failed to restart the bot stack.'
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
Show-ContainerSummary
Write-Host ""

# Show recent bot logs
Write-Host "Recent bot logs:" -ForegroundColor Cyan
Show-BotLogs -Tail 15
