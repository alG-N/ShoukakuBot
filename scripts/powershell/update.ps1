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

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Shoukaku - Force Update to Latest" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# ── Check Docker ───────────────────────────────────────────────
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running! Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# ── 1. Pull latest code ────────────────────────────────────────
Write-Host "`n[1/3] Pulling latest code from git..." -ForegroundColor Yellow

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
$ErrorActionPreference = "Continue"
$netResult = docker network create shoukaku-net 2>&1 | Out-String
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0 -and $netResult -notmatch "already exists") {
    Write-Host "ERROR: Failed to create network: $netResult" -ForegroundColor Red
    exit 1
}

# ── 2. Rebuild bot image ────────────────────────────────────────
Write-Host "`n[2/3] Rebuilding bot image (no cache)..." -ForegroundColor Yellow
docker compose -f docker-compose.yml build bot --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Build complete" -ForegroundColor Green

# ── 3. Restart bot only ─────────────────────────────────────────
# Database and Redis stay running - no data loss, minimal downtime.
# Bot will auto-deploy all slash commands to Discord when it starts.
Write-Host "`n[3/3] Restarting bot container..." -ForegroundColor Yellow
docker compose -f docker-compose.yml up -d bot --force-recreate
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restart bot." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Bot restarted" -ForegroundColor Green

# ── Show startup logs ──────────────────────────────────────────
Write-Host "`nWaiting for bot to initialize and deploy commands..." -ForegroundColor Gray
Start-Sleep 12

Write-Host "`nRecent bot startup logs:" -ForegroundColor Cyan
docker logs shoukaku-bot --tail 25 2>&1

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "  Update complete!" -ForegroundColor Green
Write-Host "  Slash commands are being deployed to Discord." -ForegroundColor Green
Write-Host "  They will appear in all servers within ~1 min." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
