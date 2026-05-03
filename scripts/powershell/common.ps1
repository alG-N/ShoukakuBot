function Assert-DockerReady {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker is not running! Please start Docker Desktop first." -ForegroundColor Red
        exit 1
    }

    docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker Compose is not available. Install the Docker Compose plugin and retry." -ForegroundColor Red
        exit 1
    }
}

function Ensure-DockerNetwork {
    param(
        [string]$Name = "shoukaku-net"
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $result = docker network create $Name 2>&1 | Out-String
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($LASTEXITCODE -ne 0 -and $result -notmatch "already exists") {
        Write-Host "ERROR: Failed to create network '$Name': $($result.Trim())" -ForegroundColor Red
        exit 1
    }
}

function Remove-DockerNetworkIfExists {
    param(
        [string]$Name = "shoukaku-net"
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $result = docker network rm $Name 2>&1 | Out-String
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Done - network $Name removed" -ForegroundColor Green
        return
    }

    $message = $result.Trim()
    if (-not $message -or $message -match "No such network") {
        Write-Host "  Done - network $Name already absent" -ForegroundColor Gray
        return
    }

    Write-Host "  WARNING: Could not remove network ${Name}: $message" -ForegroundColor Yellow
}

function Invoke-DockerComposeChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & docker compose @Arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $FailureMessage" -ForegroundColor Red
        exit 1
    }
}

function Show-ContainerSummary {
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | Select-Object -First 20
}

function Show-BotLogs {
    param(
        [int]$Tail = 15
    )

    docker logs shoukaku-bot --tail $Tail 2>&1
}

function Get-ExternalSiteChecks {
    @(
        [pscustomobject]@{ Name = 'fxtwitter'; Url = 'https://fxtwitter.com/' }
        [pscustomobject]@{ Name = 'fixupx'; Url = 'https://fixupx.com/' }
        [pscustomobject]@{ Name = 'tfxktok'; Url = 'https://tfxktok.com/' }
        [pscustomobject]@{ Name = 'ddinstagram'; Url = 'https://ddinstagram.com/' }
        [pscustomobject]@{ Name = 'rxddit'; Url = 'https://rxddit.com/' }
        [pscustomobject]@{ Name = 'fxbsky'; Url = 'https://fxbsky.app/' }
        [pscustomobject]@{ Name = 'facebed'; Url = 'https://facebed.com/' }
    )
}

function Test-HttpSignal {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$TimeoutSec = 8
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 5 -TimeoutSec $TimeoutSec
        return [pscustomobject]@{
            Url = $Url
            StatusCode = [int]$response.StatusCode
            Reachable = $true
            Healthy = ([int]$response.StatusCode -lt 500)
            Message = "HTTP $([int]$response.StatusCode)"
        }
    } catch {
        $httpResponse = $_.Exception.Response
        if ($httpResponse -is [System.Net.HttpWebResponse]) {
            $statusCode = [int]$httpResponse.StatusCode
            $httpResponse.Close()
            return [pscustomobject]@{
                Url = $Url
                StatusCode = $statusCode
                Reachable = $true
                Healthy = ($statusCode -lt 500)
                Message = "HTTP $statusCode"
            }
        }

        return [pscustomobject]@{
            Url = $Url
            StatusCode = $null
            Reachable = $false
            Healthy = $false
            Message = $_.Exception.Message
        }
    }
}

function Invoke-ExternalSitePreflight {
    $timeoutSec = 8
    if ($env:EXTERNAL_SITE_TIMEOUT_SECONDS -as [int]) {
        $timeoutSec = [int]$env:EXTERNAL_SITE_TIMEOUT_SECONDS
    }

    $allowFailures = $env:ALLOW_EXTERNAL_SITE_FAILURES -eq '1'
    $strictFailures = $env:STRICT_EXTERNAL_SITE_FAILURES -eq '1'
    $unreachable = New-Object System.Collections.Generic.List[string]
    $degraded = New-Object System.Collections.Generic.List[string]
    $signaled = 0

    foreach ($site in Get-ExternalSiteChecks) {
        $result = Test-HttpSignal -Url $site.Url -TimeoutSec $timeoutSec

        if (-not $result.Reachable) {
            Write-Host "  WARNING: $($site.Name) did not return a signal ($($site.Url))" -ForegroundColor Yellow
            $unreachable.Add($site.Name)
            continue
        }

        $signaled += 1

        if ($result.StatusCode -ge 500) {
            Write-Host "  WARNING: $($site.Name) responded with HTTP $($result.StatusCode) ($($site.Url))" -ForegroundColor Yellow
            $degraded.Add($site.Name)
            continue
        }

        if ($result.StatusCode -ge 400) {
            Write-Host "  $($site.Name) responded with HTTP $($result.StatusCode) (domain is reachable; non-2xx root response is acceptable)" -ForegroundColor Gray
            continue
        }

        Write-Host "  Done - $($site.Name) responded with HTTP $($result.StatusCode)" -ForegroundColor Green
    }

    if ($degraded.Count -gt 0) {
        Write-Host "  WARNING: Some providers returned 5xx responses: $($degraded -join ', ')" -ForegroundColor Yellow
    }

    if ($signaled -eq 0) {
        if ($allowFailures) {
            Write-Host "  WARNING: No embed providers returned a signal, but continuing because ALLOW_EXTERNAL_SITE_FAILURES=1" -ForegroundColor Yellow
            return
        }

        throw "No embed providers returned a signal. Check outbound DNS/network access. Set ALLOW_EXTERNAL_SITE_FAILURES=1 to continue anyway."
    }

    if ($unreachable.Count -eq 0) {
        return
    }

    if ($allowFailures) {
        Write-Host "  WARNING: Continuing despite unreachable providers because ALLOW_EXTERNAL_SITE_FAILURES=1: $($unreachable -join ', ')" -ForegroundColor Yellow
        return
    }

    if ($strictFailures) {
        throw "Embed provider preflight failed for: $($unreachable -join ', '). Unset STRICT_EXTERNAL_SITE_FAILURES or set ALLOW_EXTERNAL_SITE_FAILURES=1 to continue."
    }

    Write-Host "  WARNING: Proceeding with partial embed provider signal. Unreachable: $($unreachable -join ', ')" -ForegroundColor Yellow
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Key
    )

    if (-not (Test-Path '.env')) {
        return $null
    }

    $escapedKey = [regex]::Escape($Key)
    $match = Select-String -Path '.env' -Pattern "^\s*${escapedKey}=(.*)$" | Select-Object -Last 1
    if (-not $match) {
        return $null
    }

    $value = $match.Matches[0].Groups[1].Value.Trim()
    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    return $value.Trim()
}

function Get-DashboardAccessConfig {
    $bindHost = if ($env:HEALTH_BIND_HOST) { $env:HEALTH_BIND_HOST } else { Get-DotEnvValue -Key 'HEALTH_BIND_HOST' }
    if (-not $bindHost) {
        $bindHost = '127.0.0.1'
    }

    $portValue = if ($env:HEALTH_PUBLISHED_PORT) { $env:HEALTH_PUBLISHED_PORT } else { Get-DotEnvValue -Key 'HEALTH_PUBLISHED_PORT' }
    [int]$port = 3000
    [int]$parsedPort = 0
    if ($portValue -and [int]::TryParse($portValue, [ref]$parsedPort)) {
        $port = $parsedPort
    }

    return [pscustomobject]@{
        BindHost = $bindHost
        Port = $port
    }
}

function Get-LanIPv4Addresses {
    $addresses = @()

    if (Get-Command Get-NetIPConfiguration -ErrorAction SilentlyContinue) {
        $addresses = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
            Where-Object {
                $_.NetAdapter.Status -eq 'Up' -and
                $_.IPv4DefaultGateway -ne $null -and
                $_.IPv4Address -ne $null
            } |
            ForEach-Object { $_.IPv4Address.IPAddress }
    }

    if (-not $addresses) {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notmatch '^(127\.|169\.254\.)'
            } |
            Select-Object -ExpandProperty IPAddress
    }

    return $addresses | Where-Object { $_ } | Sort-Object -Unique
}

function Get-DashboardPrimaryTarget {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Config
    )

    $bindHostValue = if ($null -ne $Config.BindHost -and $Config.BindHost.ToString().Length -gt 0) { $Config.BindHost } else { '127.0.0.1' }
    $bindHost = $bindHostValue.ToString().ToLowerInvariant()
    $probeHost = $Config.BindHost
    $displayHost = $Config.BindHost

    if ($bindHost -eq '0.0.0.0' -or $bindHost -eq '127.0.0.1' -or $bindHost -eq 'localhost') {
        $probeHost = '127.0.0.1'
        $displayHost = 'localhost'
    }

    return [pscustomobject]@{
        ProbeUrl = "http://${probeHost}:$($Config.Port)/dashboard.json"
        DisplayUrl = "http://${displayHost}:$($Config.Port)/dashboard"
        ProbeHost = $probeHost
        DisplayHost = $displayHost
    }
}

function Show-DashboardAccessSummary {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Config,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$PrimaryTarget
    )

    Write-Host "  Open on this machine: $($PrimaryTarget.DisplayUrl)" -ForegroundColor Gray

    $bindHost = $Config.BindHost.ToString().ToLowerInvariant()
    if ($bindHost -eq '0.0.0.0') {
        $lanAddresses = Get-LanIPv4Addresses
        if ($lanAddresses) {
            foreach ($ip in $lanAddresses) {
                Write-Host "  Open from another device: http://${ip}:$($Config.Port)/dashboard" -ForegroundColor Gray
            }
        } else {
            Write-Host "  WARNING: HEALTH_BIND_HOST=0.0.0.0 but no LAN IPv4 address was detected to print." -ForegroundColor Yellow
        }
        return
    }

    if ($bindHost -ne '127.0.0.1' -and $bindHost -ne 'localhost') {
        Write-Host "  Bound specifically to: http://$($Config.BindHost):$($Config.Port)/dashboard" -ForegroundColor Gray
    }
}

function Wait-DashboardAccess {
    param(
        [int]$TimeoutSec = 90
    )

    $config = Get-DashboardAccessConfig
    $primaryTarget = Get-DashboardPrimaryTarget -Config $config
    $waited = 0

    while ($waited -lt $TimeoutSec) {
        $result = Test-HttpSignal -Url $primaryTarget.ProbeUrl -TimeoutSec 3
        if ($result.Reachable -and $result.StatusCode -lt 500) {
            Write-Host "  Done - Dashboard responded via $($primaryTarget.DisplayUrl)" -ForegroundColor Green
            Show-DashboardAccessSummary -Config $config -PrimaryTarget $primaryTarget
            return $true
        }

        Start-Sleep -Seconds 3
        $waited += 3
        Write-Host "  Waiting for dashboard at $($primaryTarget.DisplayUrl)... ($waited/${TimeoutSec}s)`r" -NoNewline
    }

    Write-Host ""
    Write-Host "  WARNING: Dashboard did not become reachable from this machine at $($primaryTarget.DisplayUrl) after ${TimeoutSec}s" -ForegroundColor Yellow
    return $false
}