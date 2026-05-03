# ==============================================================
# Shoukaku - Force Update to Latest Version (Windows / PowerShell)
#
# What this does:
#   1. git pull latest code
#   2. Rebuilds bot image (no cache)
#   3. Restarts the bot container
#   4. Bot auto-deploys all slash commands to Discord on startup
#
# Usage:
#   .\scripts\powershell\update.ps1
# ==============================================================

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\.."
. "$PSScriptRoot\common.ps1"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Shoukaku - Force Update to Latest" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# ── Check Docker ───────────────────────────────────────────────
Assert-DockerReady

# ── 1. Pull latest code ────────────────────────────────────────
Write-Host "`n[1/4] Probing external providers..." -ForegroundColor Yellow
Invoke-ExternalSitePreflight

Write-Host "`n[2/4] Pulling latest code from git..." -ForegroundColor Yellow

$gitAvailable = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitAvailable) {
    Write-Host "  WARNING: git not found - skipping pull. Ensure code is already up-to-date." -ForegroundColor DarkYellow
} else {
    # Check for uncommitted changes
    $dirty = git status --porcelain 2>&1
    if ($dirty) {
        Write-Host "  WARNING: Local changes detected. Stashing before pull..." -ForegroundColor DarkYellow
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        git stash push -m "auto-stash before update.ps1 $timestamp"
    }

    $branch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()
    if (-not $branch) { $branch = "main" }
    Write-Host "  Branch: $branch" -ForegroundColor Gray

    git pull --ff-only origin $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git pull failed. Resolve conflicts manually and re-run." -ForegroundColor Red
        exit 1
    }

    $commit = (git log -1 --pretty="%h %s" 2>&1).Trim()
    Write-Host "  ✅ Up to date: $commit" -ForegroundColor Green
}

# ── Ensure network ─────────────────────────────────────────────
Ensure-DockerNetwork -Name "shoukaku-net"

# ── 2. Rebuild bot image ────────────────────────────────────────
Write-Host "`n[3/4] Rebuilding bot image (no cache)..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'build', 'bot', '--no-cache') -FailureMessage 'Build failed.'
Write-Host "  ✅ Build complete" -ForegroundColor Green

# ── 3. Restart bot only ─────────────────────────────────────────
# Database and Redis stay running - no data loss, minimal downtime.
# Bot will auto-deploy all slash commands to Discord when it starts.
Write-Host "`n[4/4] Restarting bot container..." -ForegroundColor Yellow
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d', 'bot', '--force-recreate') -FailureMessage 'Failed to restart bot.'
Write-Host "  ✅ Bot restarted" -ForegroundColor Green

# ── Verify dashboard before showing it to the user ─────────────
Write-Host "`n[Dashboard] Verifying local dashboard access..." -ForegroundColor Yellow
[void](Wait-DashboardAccess -TimeoutSec 90)

Write-Host "`nRecent bot startup logs:" -ForegroundColor Cyan
Show-BotLogs -Tail 25

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "  Update complete!" -ForegroundColor Green
Write-Host "  Slash commands are being deployed to Discord." -ForegroundColor Green
Write-Host "  They will appear in all servers within ~1 min." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
