$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\.."
. "$PSScriptRoot\common.ps1"

Write-Host "==========================================="
Write-Host "  Shoukaku - Starting All Services"
Write-Host "==========================================="

# 0. Check Docker daemon
Write-Host ""
Write-Host "[0/5] Checking Docker daemon..."
Assert-DockerReady
Write-Host "  Done - Docker daemon is running"

# 0.5 Validate required env vars
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    $missing = @()
    if ($envContent -notmatch "BOT_TOKEN=\S+") { $missing += "BOT_TOKEN" }
    if ($envContent -notmatch "CLIENT_ID=\S+") { $missing += "CLIENT_ID" }
    if ($missing.Count -gt 0) {
        Write-Host "  WARNING: Missing required env vars in .env: $($missing -join ', ')" -ForegroundColor Yellow
    }
} else {
    Write-Host "  WARNING: No .env file found! Bot will fail to start." -ForegroundColor Yellow
}

# 1. Create shared network
Write-Host ""
Write-Host "[1/6] Probing external providers..."
Invoke-ExternalSitePreflight

Write-Host ""
Write-Host "[2/6] Creating shared network..."
Ensure-DockerNetwork -Name "shoukaku-net"
Write-Host "  Done - network shoukaku-net ready"

# 2. Start Lavalink
Write-Host ""
Write-Host "[3/6] Starting Lavalink nodes..."
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.lavalink.yml', 'up', '-d') -FailureMessage 'Failed to start Lavalink stack.'
Write-Host "  Done - Lavalink nodes starting"

# 2.5 Wait for at least one Lavalink node to be healthy
Write-Host ""
Write-Host "[2.5] Waiting for Lavalink to be ready..."
$maxWait = 60  # seconds
$waited = 0
$lavalinkReady = $false
while ($waited -lt $maxWait) {
    # Check if any lavalink node responds on /version
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:2333/version" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $lavalinkReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
    $waited += 3
    Write-Host "  Waiting... ($waited/${maxWait}s)" -NoNewline
    Write-Host "`r" -NoNewline
}
if ($lavalinkReady) {
    Write-Host "  Done - Lavalink node-1 is healthy                "
} else {
    Write-Host "  WARNING: Lavalink not ready after ${maxWait}s (bot will auto-reconnect)" -ForegroundColor Yellow
}

# 3. Start Cobalt
Write-Host ""
Write-Host "[4/6] Starting Cobalt instances..."
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.cobalt.yml', 'up', '-d') -FailureMessage 'Failed to start Cobalt stack.'
Write-Host "  Done - Cobalt instances starting"

# 4. Start Monitoring
Write-Host ""
Write-Host "[5/6] Starting Monitoring stack..."
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.monitoring.yml', 'up', '-d') -FailureMessage 'Failed to start Monitoring stack.'
Write-Host "  Done - Monitoring starting"

# 5. Start Bot
Write-Host ""
Write-Host "[6/6] Starting Bot + Database + Cache..."
Invoke-DockerComposeChecked -Arguments @('-f', 'docker-compose.yml', 'up', '-d') -FailureMessage 'Failed to start the bot stack.'
Write-Host "  Done - Bot starting"

Write-Host ""
Write-Host "[Dashboard] Verifying local dashboard access..."
[void](Wait-DashboardAccess -TimeoutSec 90)

Write-Host ""
Write-Host "==========================================="
Write-Host "  All services started!"
Write-Host "  Bot will auto-reconnect to Lavalink"
Write-Host "==========================================="

Write-Host ""
Write-Host "Container Status:"
Show-ContainerSummary
