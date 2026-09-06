# Rotates SECRET_KEY and/or BUGSINK_SECRET_KEY in place in one or more real
# env/.env* files, generating a fresh random value for each.
#
# Scope is deliberately narrow: these two fields are the only secrets safe
# to rotate by just editing the file and restarting. Every other secret
# field (POSTGRES_PASSWORD, APP_DB_PASSWORD, BUGSINK_SUPERUSER_PASSWORD,
# REDIS_PASSWORD) is backed by state a live service already has: Postgres
# only applies POSTGRES_PASSWORD on first volume init, so editing the file
# after that does nothing to the role's real password and just breaks
# DATABASE_URL; Bugsink's admin password lives in its own database, not
# this file. Rotating those safely means changing them at the live service
# (ALTER ROLE, Bugsink's own admin tools) first, not something this script
# attempts.
#
# Usage:
#   .\rotate-secrets.ps1 [-Field SECRET_KEY|BUGSINK_SECRET_KEY] [file ...]
#
# With no file arguments, rotates every env/.env* file that actually exists.
# With no -Field, rotates both fields wherever present in a given file.
param(
    [string]$Field = "",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files = @()
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../../../..")

function New-Secret([int]$Length) {
    $bytes = New-Object byte[] ($Length * 2)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $raw = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
    return $raw.Substring(0, [Math]::Min($Length, $raw.Length))
}

if ($Field -and $Field -ne "SECRET_KEY" -and $Field -ne "BUGSINK_SECRET_KEY") {
    Write-Error "Unknown -Field '$Field'. Only SECRET_KEY and BUGSINK_SECRET_KEY are safe to rotate this way."
    exit 1
}

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
    Write-Error "No env files found to rotate. Run scripts/env-tools/setup-env/setup-env.ps1 first."
    exit 1
}

$RotatedAny = $false

foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        Write-Host "skip (not found): $f"
        continue
    }

    $content = Get-Content $f -Raw
    $rotatedHere = @()

    if (($Field -eq "" -or $Field -eq "SECRET_KEY") -and $content -match '(?m)^SECRET_KEY=') {
        $content = $content -replace '(?m)^SECRET_KEY=.*', "SECRET_KEY=$(New-Secret 40)"
        $rotatedHere += "SECRET_KEY"
    }

    if (($Field -eq "" -or $Field -eq "BUGSINK_SECRET_KEY") -and $content -match '(?m)^BUGSINK_SECRET_KEY=') {
        $content = $content -replace '(?m)^BUGSINK_SECRET_KEY=.*', "BUGSINK_SECRET_KEY=$(New-Secret 60)"
        $rotatedHere += "BUGSINK_SECRET_KEY"
    }

    if ($rotatedHere.Count -gt 0) {
        Set-Content -Path $f -Value $content -NoNewline
        Write-Host "rotated in ${f}: $($rotatedHere -join ' ')"
        $RotatedAny = $true
    } else {
        Write-Host "nothing to rotate in $f"
    }
}

if ($RotatedAny) {
    Write-Host ""
    Write-Host "Restart whichever stack reads the rotated file(s) for the new value to take effect."
    Write-Host "Rotating SECRET_KEY invalidates every outstanding access/refresh token and session:"
    Write-Host "everyone gets logged out. Rotating BUGSINK_SECRET_KEY invalidates Bugsink's own"
    Write-Host "signed sessions/cookies the same way."
}
