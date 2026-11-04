# Rotates SECRET_KEY and/or BUGSINK_SECRET_KEY in place in real
# env/mystic_auth/.env* files, with a fresh random value for each. Also rotates
# any of your own env/app/ secrets listed in
# scripts/app/env-tools/rotate-secrets/fields.env (ships empty).
#
# Narrow on purpose: only these fields are safe to rotate by editing the file and
# restarting. POSTGRES_PASSWORD, APP_DB_PASSWORD, BUGSINK_SUPERUSER_PASSWORD and
# VALKEY_PASSWORD are also stored by a live service, so change them there first.
# List a field in fields.env only if editing the file and restarting is enough.
#
# Usage:
#   .\rotate-secrets.ps1 [-Field NAME] [file ...]
#
# With no file arguments, rotates every env/mystic_auth/.env* file, plus
# every env/app/.env* file if fields.env declares at least one field.
# With no -Field, rotates every applicable field wherever present in a
# given file.
param(
    [string]$Field = "",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files = @()
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../../../..")

function New-Secret([int]$Length) {
    $bytes = New-Object byte[] ($Length * 2)
    # Windows PowerShell 5.1's .NET Framework does not expose the static
    # RandomNumberGenerator.Fill API that newer PowerShell versions have.
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    $raw = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
    return $raw.Substring(0, [Math]::Min($Length, $raw.Length))
}

# mystic_auth's own fields (fixed lengths, always in scope) plus whatever
# a fork declared in its own fields.env (name=length pairs).
$FieldLengths = [ordered]@{
    SECRET_KEY = 40
    BUGSINK_SECRET_KEY = 60
}

$AppFieldsFile = "scripts/app/env-tools/rotate-secrets/fields.env"
if (Test-Path $AppFieldsFile) {
    foreach ($line in Get-Content $AppFieldsFile) {
        if ($line -eq "" -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }
        $idx = $line.IndexOf("=")
        $key = $line.Substring(0, $idx)
        $length = $line.Substring($idx + 1)
        if ($length -eq "") { $length = 40 }
        $FieldLengths[$key] = [int]$length
    }
}

if ($Field -and -not $FieldLengths.Contains($Field)) {
    Write-Error "Unknown -Field '$Field'. Known fields: $($FieldLengths.Keys -join ', '). Add your own to scripts/app/env-tools/rotate-secrets/fields.env to extend this."
    exit 1
}

if ($Files.Count -eq 0) {
    # Globs rather than a fixed list, so a fork's own new mode (e.g. a
    # hand-added env/mystic_auth/.env.staging) is rotated too.
    $globDirs = @("env/mystic_auth")
    if (Test-Path $AppFieldsFile) { $globDirs += "env/app" }
    $Files = Get-ChildItem -Path $globDirs -Filter ".env*" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '\.(example|bak|ci-created)$' } |
        ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) -replace '\\', '/' }
}

if ($Files.Count -eq 0) {
    Write-Error "No env files found to rotate. Run scripts/mystic_auth/env-tools/setup-env/setup-env.ps1 first."
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

    foreach ($key in $FieldLengths.Keys) {
        if (($Field -eq "" -or $Field -eq $key) -and $content -match "(?m)^$key=") {
            $content = $content -replace "(?m)^$key=.*", "$key=$(New-Secret $FieldLengths[$key])"
            $rotatedHere += $key
        }
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
