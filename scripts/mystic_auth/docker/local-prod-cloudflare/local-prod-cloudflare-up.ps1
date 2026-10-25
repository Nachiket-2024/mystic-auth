Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# PowerShell counterpart to local-prod-cloudflare-up.sh. Always passes
# --env-file env/mystic_auth/.env.local-prod-cloudflare, so this stack never
# accidentally reads dev's env/mystic_auth/.env.dev.
#
# Usage: .\scripts\mystic_auth\docker\local-prod-cloudflare\local-prod-cloudflare-up.ps1 up -d --build
#        .\scripts\mystic_auth\docker\local-prod-cloudflare\local-prod-cloudflare-up.ps1 logs -f frontend
# With no arguments, defaults to `up -d --build`.

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location $RepoRoot

$ComposeArgs = if ($args.Count -eq 0) { @("up", "-d", "--build") } else { $args }

$TunnelTokenFile = Join-Path $RepoRoot "env/mystic_auth/.cloudflare-tunnel-token"
if (-not (Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf)) {
  Write-Error "Cloudflare Named Tunnel token file is missing: env/mystic_auth/.cloudflare-tunnel-token"
  Write-Error "Copy env/mystic_auth/.cloudflare-tunnel-token.example and replace its contents with the token from Cloudflare Zero Trust."
  exit 1
}
$TunnelTokenContents = Get-Content -LiteralPath $TunnelTokenFile -Raw
if ([string]::IsNullOrWhiteSpace($TunnelTokenContents) -or $TunnelTokenContents.Trim() -eq "replace_with_your_cloudflare_named_tunnel_token") {
  Write-Error "Cloudflare Named Tunnel token file is empty or still has its example value: env/mystic_auth/.cloudflare-tunnel-token"
  Write-Error "Copy env/mystic_auth/.cloudflare-tunnel-token.example and replace its contents with the token from Cloudflare Zero Trust."
  exit 1
}
$CurrentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$AllowedSids = @($CurrentSid, "S-1-5-18", "S-1-5-32-544")
try {
  $TokenAcl = Get-Acl -LiteralPath $TunnelTokenFile
  $UnsafeAclEntries = @($TokenAcl.Access | Where-Object {
    if ($_.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { return $false }
    try {
      $Sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      return $Sid -notin $AllowedSids
    } catch {
      return $true
    }
  })
  if ($UnsafeAclEntries.Count -gt 0) {
    Write-Error "Cloudflare Named Tunnel token file grants access to another account. Restrict it with icacls before starting."
    exit 1
  }
} catch {
  Write-Error "Could not verify the Cloudflare Named Tunnel token file ACL. Restrict it with icacls before starting."
  exit 1
}

& "$RepoRoot/scripts/mystic_auth/env-tools/check-env/check-env.ps1" `
  "env/mystic_auth/.env.local-prod-cloudflare" `
  "env/app/.env.local-prod-cloudflare"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose `
  -f docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml `
  -f docker/app/compose/docker-compose.local-prod-cloudflare.yml `
  --env-file env/mystic_auth/.env.local-prod-cloudflare `
  --env-file env/app/.env.local-prod-cloudflare `
  @ComposeArgs
exit $LASTEXITCODE
