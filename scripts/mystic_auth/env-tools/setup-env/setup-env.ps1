# Bootstraps every env/.env* file (plus frontend/.env) from its .example,
# generating a distinct random value for every secret/password field and
# applying one app name / brand color across all of them. Never touches a
# file that already exists - safe to re-run after filling in your own
# per-mode fields (OAuth, SMTP, domain, tunnel tokens) by hand.
#
# See docs/mystic_auth/template-usage/overview.md for what's still yours to
# fill in after this runs.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../../../..")

function New-Secret([int]$Length) {
    $bytes = New-Object byte[] ($Length * 2)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $raw = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
    return $raw.Substring(0, [Math]::Min($Length, $raw.Length))
}

$AppName = Read-Host "App name [MysticAuth]"
if ([string]::IsNullOrWhiteSpace($AppName)) { $AppName = "MysticAuth" }
$BrandColor = Read-Host "Brand color hex [#d97706]"
if ([string]::IsNullOrWhiteSpace($BrandColor)) { $BrandColor = "#d97706" }

$Pairs = @(
    @{ Src = "env/.env.example"; Dst = "env/.env" }
    @{ Src = "env/.env.prod.example"; Dst = "env/.env.prod" }
    @{ Src = "env/.env.local-prod-cloudflare.example"; Dst = "env/.env.local-prod-cloudflare" }
    @{ Src = "env/.env.local-prod-ngrok.example"; Dst = "env/.env.local-prod-ngrok" }
    @{ Src = "env/.env.local-prod-tailscale.example"; Dst = "env/.env.local-prod-tailscale" }
    @{ Src = "frontend/.env.example"; Dst = "frontend/.env" }
)

$StillNeeded = @()

foreach ($pair in $Pairs) {
    $src = $pair.Src
    $dst = $pair.Dst

    if (-not (Test-Path $src)) { continue }

    if (Test-Path $dst) {
        Write-Host "skip (already exists): $dst"
        continue
    }

    Copy-Item $src $dst
    $content = Get-Content $dst -Raw

    $content = $content -replace '(?m)^APP_NAME=.*', "APP_NAME=$AppName"
    $content = $content -replace '(?m)^BRAND_COLOR=.*', "BRAND_COLOR=$BrandColor"
    $content = $content -replace '(?m)^VITE_APP_NAME=.*', "VITE_APP_NAME=$AppName"
    $content = $content -replace '(?m)^VITE_BRAND_COLOR=.*', "VITE_BRAND_COLOR=$BrandColor"

    # Distinct generated secrets, only for fields that ship a shared
    # "change_me_in_production..." placeholder. Each variable and each file
    # gets its own independently generated value - a leaked dev secret
    # doesn't compromise prod, and Postgres's superuser password never
    # matches the app role's or Bugsink's.
    if ($content -match '(?m)^POSTGRES_PASSWORD=') {
        $pgPw = New-Secret 24
        $content = $content -replace '(?m)^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$pgPw"
        $content = $content -replace 'postgres:change_me_in_production@', "postgres:$pgPw@"
    }

    if ($content -match '(?m)^APP_DB_PASSWORD=') {
        $appPw = New-Secret 24
        $content = $content -replace '(?m)^APP_DB_PASSWORD=.*', "APP_DB_PASSWORD=$appPw"
        $content = $content -replace 'mystic_auth_app:change_me_in_production@', "mystic_auth_app:$appPw@"
    }

    if ($content -match '(?m)^SECRET_KEY=') {
        $content = $content -replace '(?m)^SECRET_KEY=.*', "SECRET_KEY=$(New-Secret 40)"
    }

    if ($content -match '(?m)^BUGSINK_SECRET_KEY=') {
        $content = $content -replace '(?m)^BUGSINK_SECRET_KEY=.*', "BUGSINK_SECRET_KEY=$(New-Secret 60)"
    }

    if ($content -match '(?m)^BUGSINK_SUPERUSER_PASSWORD=') {
        $content = $content -replace '(?m)^BUGSINK_SUPERUSER_PASSWORD=.*', "BUGSINK_SUPERUSER_PASSWORD=$(New-Secret 24)"
    }

    Set-Content -Path $dst -Value $content -NoNewline
    Write-Host "created: $dst"

    # REDIS_PASSWORD is deliberately left blank: it's optional hardening, and
    # setting it also requires manually rewriting REDIS_URL to embed it (see
    # docs/mystic_auth/security/hardening-infra.md#redis-authentication) -
    # not something safe to script blindly.

    $placeholders = [regex]::Matches($content, '<your[a-z_-]*>|<your-domain>') |
        ForEach-Object { $_.Value } | Sort-Object -Unique
    if ($placeholders) {
        $StillNeeded += "$dst`: $($placeholders -join ' ')"
    }
}

Write-Host ""
Write-Host "Done. Secrets, APP_NAME, and BRAND_COLOR are filled in wherever a new file was created."
if ($StillNeeded.Count -gt 0) {
    Write-Host "Still needs your own values (Google OAuth, SMTP, domain, tunnel tokens):"
    foreach ($line in $StillNeeded) {
        Write-Host "  - $line"
    }
}
Write-Host "See docs/mystic_auth/template-usage/overview.md for OAuth/SMTP/tunnel setup."
