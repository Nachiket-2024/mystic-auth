# Cloudflare Quick Tunnel (temporary public URL)

Cloudflare Quick Tunnels are free and require no Cloudflare account or domain.
They are useful for a short demo or for sharing one local HTTP service. A
Quick Tunnel gets a random `trycloudflare.com` hostname each time it starts.
That makes it a poor fit for OAuth providers that require a registered
callback URL: you must update the provider's allowed origin and callback URL,
and the app's public URL settings, every time the hostname changes.

This repository is a base with several tunnel choices. Pick the one that fits
your demo: use Quick Tunnel for a fast, temporary URL; use a stable ngrok
domain if its free domain meets your needs; use Tailscale Funnel if you already
use Tailscale; or use a Cloudflare Named Tunnel with a domain in your
Cloudflare account. See [the comparison](README.md#which-tunnel-do-i-want).

Cloudflare documents Quick Tunnels as temporary and without an uptime
guarantee. They support up to 200 in-flight requests, do not support
Server-Sent Events, and expose the selected local service to anyone who has
the URL. See [Cloudflare's Quick Tunnel guide](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Quick demo: share a local HTTP service

These steps work on Linux, WSL, and Windows PowerShell. Install `cloudflared`
from [Cloudflare's download page](https://developers.cloudflare.com/tunnel/downloads/).
No login or `cloudflared tunnel login` is needed for a Quick Tunnel.

1. Start the service you want to share. For a simple smoke demo from the
   repository root, serve the documentation directory on port 8080:

   ```bash
   python3 -m http.server 8080 --bind 127.0.0.1 --directory docs
   ```

   In Windows PowerShell, use:

   ```powershell
   py -m http.server 8080 --bind 127.0.0.1 --directory docs
   ```

2. Open a second terminal and start the tunnel to that local port:

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

   In Windows PowerShell, the executable may be named `cloudflared.exe`:

   ```powershell
   cloudflared.exe tunnel --url http://localhost:8080
   ```

3. Wait for the `https://<random-name>.trycloudflare.com` URL in the output,
   then open it in a browser or share it with your demo audience. The tunnel
   forwards to the one local service and port from step 2.

4. To stop sharing, press **Ctrl+C** in the `cloudflared` terminal and stop
   the local service. Starting another Quick Tunnel creates a different URL.

For a small extra access check, Cloudflare supports an email PIN gate with
`--allowed-mail`:

```bash
cloudflared tunnel --url http://localhost:8080 --allowed-mail alice@example.com
```

The recipient must enter the one-time PIN sent to that address. This is a
convenience gate for a demo, not a replacement for the app's own authentication.

## Share this repository's full local-prod app

The local-prod Cloudflare Compose file normally includes the Named Tunnel
service. To use a Quick Tunnel instead, start the same app stack while naming
the app services explicitly, which leaves the `cloudflared` service stopped;
then run the Quick Tunnel on the host to the frontend port. The frontend's
nginx serves the built app and proxies API paths to the backend on the same
origin.

1. Install Docker with Compose and `cloudflared`, then prepare local-prod env
   files using the repository setup helper. From the repository root run one
   of:

   ```bash
   ./scripts/mystic_auth/env-tools/setup-env/setup-env.sh
   ```

   ```powershell
   .\scripts\mystic_auth\env-tools\setup-env\setup-env.ps1
   ```

   The helper prepares all mode-specific env files. Fill the local-prod
   Cloudflare and app env files with the required values described in
   [Local-Prod Deployment](README.md#environment-variables), and run
   `scripts/mystic_auth/env-tools/check-env/check-env.sh` (or its PowerShell
   counterpart) on the two files. The Named Tunnel token is not used by the
   selected app services; this walkthrough does not start `cloudflared`.

2. Build and start the local-prod services except `cloudflared`. Run from the
   repository root:

   ```bash
   docker compose -f docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml -f docker/app/compose/docker-compose.local-prod-cloudflare.yml --env-file env/mystic_auth/.env.local-prod-cloudflare --env-file env/app/.env.local-prod-cloudflare up -d --build postgres valkey bugsink bugsink-seed alembic backend frontend procrastinate_worker db_backup
   ```

   This uses the repo's Cloudflare local-prod app configuration but does not
   start the Named Tunnel. The frontend is published on the port configured
   by `FRONTEND_HOST_PORT` (8080 in the example env file).

3. In another terminal, publish that local frontend port through a Quick
   Tunnel. On the default port, use the command from the quick-demo section:

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

   Open the generated HTTPS URL. Keep both the Compose stack and
   `cloudflared` running while the demo is in use. Stop `cloudflared` with
   **Ctrl+C** when finished, then stop the app stack:

   ```bash
   docker compose -f docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml -f docker/app/compose/docker-compose.local-prod-cloudflare.yml --env-file env/mystic_auth/.env.local-prod-cloudflare --env-file env/app/.env.local-prod-cloudflare down
   ```

4. If Google OAuth is enabled, the random public hostname must be registered
   with Google as both an authorized JavaScript origin and an authorized
   redirect URI (`https://<random-name>.trycloudflare.com` and
   `https://<random-name>.trycloudflare.com/auth/oauth2/callback/google`).
   Set `GOOGLE_REDIRECT_URI` to the callback and set `FRONTEND_BASE_URL`,
   `BACKEND_BASE_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` to the generated HTTPS
   origin in `env/mystic_auth/.env.local-prod-cloudflare`. Apply the new
   runtime and frontend build settings from the repository root:

   ```bash
   docker compose -f docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml -f docker/app/compose/docker-compose.local-prod-cloudflare.yml --env-file env/mystic_auth/.env.local-prod-cloudflare --env-file env/app/.env.local-prod-cloudflare up -d --build backend frontend
   ```

   Repeat these updates and the Google registration when the Quick Tunnel
   hostname changes. For a demo without OAuth, skip the Google
   registration and use another account setup already configured in your
   environment.

## When the demo needs a stable OAuth callback

ngrok’s free plan provides one assigned static development domain, which can
keep the OAuth origin and callback stable across restarts. The free tier has
usage limits and an interstitial page; check its current
[plan details](https://ngrok.com/pricing). The repository includes a dedicated
[ngrok local-prod walkthrough](ngrok-tunnel.md). A Cloudflare Named Tunnel
also provides a stable hostname, but requires a domain whose DNS zone is in
the same Cloudflare account. Tailscale Funnel is another option described in
the [tunnel comparison](README.md#which-tunnel-do-i-want).
