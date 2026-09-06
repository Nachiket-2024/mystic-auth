# Preflight check for a real env/.env* file: catches the two mistakes that
# otherwise only surface as a cryptic runtime error, a silently insecure
# deployment, or Docker's raw "port is already allocated" failure.
#
#   1. ERROR (exit 1): ENVIRONMENT=production in this file, but a secret
#      still equals the shipped placeholder from its .example.
#   2. WARNING (exit 0, printed): a <your_...>/<your-domain> placeholder is
#      still present, or a host port this file declares is already bound.
#
# Usage: .\check-env.ps1 [env/.env ...]
# With no arguments, checks every env/.env* file that actually exists.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files = @()
)

Set-Location (Join-Path $PSScriptRoot "../../../..")

if ($Files.Count -eq 0) {
    $candidates = @(
        "env/.env",
        "env/.env.prod",
        "env/.env.local-prod-cloudflare",
        "env/.env.local-prod-ngrok",
        "env/.env.local-prod-tailscale"
    )
    $Files = $candidates | Where-Object { Test-Path $_ }
}

if ($Files.Count -eq 0) {
    Write-Error "No env files found to check. Run scripts/env-tools/setup-env/setup-env.ps1 first."
    exit 1
}

$PlaceholderSecrets = @{
    "SECRET_KEY" = "SECRET_KEY=change_me_in_production_generate_your_own_random_32plus_char_key"
    "BUGSINK_SECRET_KEY" = "BUGSINK_SECRET_KEY=change_me_in_production_generate_your_own_random_50plus_char_key"
    "POSTGRES_PASSWORD" = "POSTGRES_PASSWORD=change_me_in_production"
    "APP_DB_PASSWORD" = "APP_DB_PASSWORD=change_me_in_production"
    "BUGSINK_SUPERUSER_PASSWORD" = "BUGSINK_SUPERUSER_PASSWORD=change_me_in_production"
}

function Test-PortInUse([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $connected = $result.AsyncWaitHandle.WaitOne(200)
        if ($connected -and $client.Connected) {
            $client.EndConnect($result)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    } catch {
        return $false
    }
}

$HasError = $false
$HasWarning = $false

foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        Write-Host "skip (not found): $f"
        continue
    }

    Write-Host "=== $f ==="
    $content = Get-Content $f -Raw
    $isProd = $content -match '(?m)^ENVIRONMENT=production$'

    if ($isProd) {
        foreach ($key in $PlaceholderSecrets.Keys) {
            $line = $PlaceholderSecrets[$key]
            if (($content -split "`n") -contains $line) {
                Write-Host "  ERROR: $key is still the shipped placeholder, but ENVIRONMENT=production."
                $HasError = $true
            }
        }
    }

    $placeholderMatches = [regex]::Matches($content, '<your[a-z_-]*>|<your-domain>') |
        ForEach-Object { $_.Value } | Sort-Object -Unique
    if ($placeholderMatches) {
        Write-Host "  WARNING: still has placeholder value(s): $($placeholderMatches -join ' ')"
        $HasWarning = $true
    }

    foreach ($portVar in @("POSTGRES_HOST_PORT", "REDIS_HOST_PORT", "BACKEND_HOST_PORT", "FRONTEND_HOST_PORT", "BUGSINK_HOST_PORT")) {
        if ($content -match "(?m)^$portVar=(\d+)") {
            $port = [int]$Matches[1]
            if (Test-PortInUse $port) {
                Write-Host "  WARNING: $portVar=$port is already bound by something else on this machine."
                $HasWarning = $true
            }
        }
    }

    if (Test-Path "$f.bak") {
        Write-Host "  WARNING: $f.bak still exists - a leftover plaintext copy of the old secrets. Delete it once you've confirmed $f is correct."
        $HasWarning = $true
    }

    Write-Host ""
}

if ($HasError) {
    Write-Host "Found placeholder secrets in a file set to ENVIRONMENT=production. Rotate them before starting this stack:"
    Write-Host "  scripts/env-tools/rotate-secrets/rotate-secrets.ps1 (SECRET_KEY/BUGSINK_SECRET_KEY only; see its own header for POSTGRES_PASSWORD/APP_DB_PASSWORD/BUGSINK_SUPERUSER_PASSWORD, which need a live-database step too)"
    exit 1
}

if ($HasWarning) {
    Write-Host "Warnings above won't stop the stack from starting, but review them first."
}

exit 0
