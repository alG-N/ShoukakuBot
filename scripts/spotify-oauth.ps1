# Spotify OAuth - Get Refresh Token
# One-time setup to get a refresh token for playlist access

param(
    [string]$Code
)

$ErrorActionPreference = 'Stop'

# Load .env file if it exists
$envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}

$clientId = $env:SPOTIFY_CLIENT_ID
$clientSecret = $env:SPOTIFY_CLIENT_SECRET
$redirectUri = 'http://127.0.0.1:8888/callback'

if (-not $clientId -or -not $clientSecret) {
    Write-Host 'ERROR: Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env file' -ForegroundColor Red
    Write-Host 'Set them in your .env file first.' -ForegroundColor Yellow
    exit 1
}

if (-not $Code) {
    $scopes = 'playlist-read-private playlist-read-collaborative'
    $encodedScopes = [System.Uri]::EscapeDataString($scopes)
    $encodedRedirect = [System.Uri]::EscapeDataString($redirectUri)

    $authUrl = "https://accounts.spotify.com/authorize?client_id=$clientId&response_type=code&redirect_uri=$encodedRedirect&scope=$encodedScopes"

    Write-Host '==========================================' -ForegroundColor Cyan
    Write-Host '  Spotify OAuth Setup' -ForegroundColor Cyan
    Write-Host '==========================================' -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'Step 1: Open this URL in your browser:' -ForegroundColor Yellow
    Write-Host ''
    Write-Host $authUrl -ForegroundColor Green
    Write-Host ''
    Write-Host 'Step 2: After authorizing, you will be redirected to:' -ForegroundColor Yellow
    Write-Host '  http://127.0.0.1:8888/callback?code=XXXXXX' -ForegroundColor Gray
    Write-Host ''
    Write-Host '  The page will fail to load - that is normal!' -ForegroundColor Gray
    Write-Host '  Copy the code parameter value from the URL bar.' -ForegroundColor Gray
    Write-Host ''
    Write-Host 'Step 3: Run this script again with the code:' -ForegroundColor Yellow
    Write-Host '  .\scripts\spotify-oauth.ps1 -Code PASTE_CODE_HERE' -ForegroundColor Green
    Write-Host ''

    Start-Process $authUrl
    Write-Host '(Browser opened automatically)' -ForegroundColor Gray
} else {
    Write-Host 'Exchanging authorization code for refresh token...' -ForegroundColor Yellow

    $credentials = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${clientId}:${clientSecret}"))

    $body = @{
        grant_type   = 'authorization_code'
        code         = $Code
        redirect_uri = $redirectUri
    }

    try {
        $response = Invoke-RestMethod -Uri 'https://accounts.spotify.com/api/token' `
            -Method POST `
            -Body $body `
            -Headers @{ Authorization = "Basic $credentials" } `
            -ContentType 'application/x-www-form-urlencoded'

        Write-Host ''
        Write-Host '==========================================' -ForegroundColor Green
        Write-Host '  SUCCESS! Token obtained' -ForegroundColor Green
        Write-Host '==========================================' -ForegroundColor Green
        Write-Host ''
        Write-Host "Access Token:  $($response.access_token.Substring(0, 20))..." -ForegroundColor Gray
        Write-Host "Token Type:    $($response.token_type)" -ForegroundColor Gray
        Write-Host "Expires In:    $($response.expires_in)s" -ForegroundColor Gray
        Write-Host "Scope:         $($response.scope)" -ForegroundColor Gray
        Write-Host ''
        Write-Host 'Refresh Token:' -ForegroundColor Yellow
        Write-Host $response.refresh_token -ForegroundColor Green
        Write-Host ''
        Write-Host 'Add this to your .env file:' -ForegroundColor Yellow
        Write-Host "  SPOTIFY_REFRESH_TOKEN=$($response.refresh_token)" -ForegroundColor Cyan
        Write-Host ''

        # Try to append to .env file
        $envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
        if (Test-Path $envFile) {
            $envContent = Get-Content $envFile -Raw
            if ($envContent -match 'SPOTIFY_REFRESH_TOKEN=') {
                $envContent = $envContent -replace 'SPOTIFY_REFRESH_TOKEN=.*', "SPOTIFY_REFRESH_TOKEN=$($response.refresh_token)"
                Set-Content $envFile $envContent -NoNewline
                Write-Host 'Updated SPOTIFY_REFRESH_TOKEN in .env file' -ForegroundColor Green
            } else {
                Add-Content $envFile "`nSPOTIFY_REFRESH_TOKEN=$($response.refresh_token)"
                Write-Host 'Added SPOTIFY_REFRESH_TOKEN to .env file' -ForegroundColor Green
            }
        } else {
            Write-Host 'No .env file found - add the token manually.' -ForegroundColor Yellow
        }

        Write-Host ''
        Write-Host 'After adding to .env, restart the bot:' -ForegroundColor Yellow
        Write-Host '  .\restart.ps1 -BotOnly' -ForegroundColor Cyan
    } catch {
        Write-Host ''
        Write-Host 'ERROR: Token exchange failed!' -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red

        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
            Write-Host "Response: $errorBody" -ForegroundColor Gray
        }

        Write-Host ''
        Write-Host 'Common causes:' -ForegroundColor Yellow
        Write-Host '  - Code already used (each code works only once)' -ForegroundColor Gray
        Write-Host '  - Code expired (codes expire in about 10 minutes)' -ForegroundColor Gray
        Write-Host '  - Redirect URI mismatch with Spotify dashboard' -ForegroundColor Gray
        Write-Host ''
        Write-Host 'Try generating a new code by running:' -ForegroundColor Yellow
        Write-Host '  .\scripts\spotify-oauth.ps1' -ForegroundColor Cyan
    }
}
