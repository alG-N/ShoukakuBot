function Get-ExternalSiteChecks {
    @(
        [pscustomobject]@{ Name = 'nhentai'; Url = 'https://nhentai.net/' }
        [pscustomobject]@{ Name = 'pixiv-web'; Url = 'https://www.pixiv.net/' }
        [pscustomobject]@{ Name = 'pixiv-api'; Url = 'https://app-api.pixiv.net/' }
        [pscustomobject]@{ Name = 'reddit'; Url = 'https://www.reddit.com/' }
        [pscustomobject]@{ Name = 'x'; Url = 'https://x.com/' }
        [pscustomobject]@{ Name = 'instagram'; Url = 'https://www.instagram.com/' }
        [pscustomobject]@{ Name = 'tiktok'; Url = 'https://www.tiktok.com/' }
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
    $unreachable = New-Object System.Collections.Generic.List[string]
    $degraded = New-Object System.Collections.Generic.List[string]

    foreach ($site in Get-ExternalSiteChecks) {
        $result = Test-HttpSignal -Url $site.Url -TimeoutSec $timeoutSec

        if (-not $result.Reachable) {
            Write-Host "  WARNING: $($site.Name) did not return a signal ($($site.Url))" -ForegroundColor Yellow
            $unreachable.Add($site.Name)
            continue
        }

        if ($result.StatusCode -ge 500) {
            Write-Host "  WARNING: $($site.Name) responded with HTTP $($result.StatusCode) ($($site.Url))" -ForegroundColor Yellow
            $degraded.Add($site.Name)
            continue
        }

        Write-Host "  Done - $($site.Name) responded with HTTP $($result.StatusCode)" -ForegroundColor Green
    }

    if ($degraded.Count -gt 0) {
        Write-Host "  WARNING: Some providers returned 5xx responses: $($degraded -join ', ')" -ForegroundColor Yellow
    }

    if ($unreachable.Count -eq 0) {
        return
    }

    if ($allowFailures) {
        Write-Host "  WARNING: Continuing despite unreachable providers because ALLOW_EXTERNAL_SITE_FAILURES=1: $($unreachable -join ', ')" -ForegroundColor Yellow
        return
    }

    throw "External provider preflight failed for: $($unreachable -join ', '). Set ALLOW_EXTERNAL_SITE_FAILURES=1 to continue anyway."
}