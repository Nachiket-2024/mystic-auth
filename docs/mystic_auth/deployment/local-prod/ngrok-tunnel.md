# ngrok Tunnel (stable URL, no Cloudflare account)

---

See [Local-Prod Deployment](README.md) for the mode chooser, environment
variables, and how local-prod differs from dev/prod. This page is the ngrok
walkthrough, start to finish.

---

## Files used by this guide

| File | Why it matters |
|---|---|
| `docker/compose/docker-compose.local-prod-ngrok.yml` | Runs the local-prod stack and the `ngrok` tunnel container. |
| `env/.env.local-prod-ngrok.example` | Source template for ngrok local-prod settings. |
| `env/.env.local-prod-ngrok` | Your local, gitignored copy with `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, public URLs, Google callback, and secrets. |
| `scripts/docker/local-prod-ngrok/local-prod-ngrok-up.*` | Compose helpers that always pass the ngrok env file. |
| `local-scripts/local-prod-ngrok/create-system-user.*` | Optional non-interactive system-superuser creation scripts. |

---

## Platform setup

A free ngrok account, its authtoken, and a free static domain are required
before the tunnel comes up at all. ngrok's free tier issues one static
domain per account, and the `ngrok` service in
`docker/compose/docker-compose.local-prod-ngrok.yml` is pinned to it with
`--url=https://${NGROK_DOMAIN}` in its `command:`, so the URL is stable
from the first boot and Steps 1-6 below are one-time setup, not something
to repeat on every restart.

---

**Step 1: Create a free ngrok account and grab your authtoken.**

Sign up at [ngrok.com](https://ngrok.com/) (a free account is enough).
Then, in the [ngrok dashboard](https://dashboard.ngrok.com/), go to
**Getting Started → Your Authtoken** and copy it.

---

**Step 2: Claim a free static domain.**

In the dashboard, go to **Domains** and create a free static domain, e.g.
`my-app.ngrok-free.app`. Unlike ngrok's older random-URL tunnels, this
domain does not change between restarts.

---

**Step 3: Copy the env file.**

```bash
cp env/.env.local-prod-ngrok.example env/.env.local-prod-ngrok
```

`env/.env.local-prod-ngrok.example` is the local-prod template for
`docker/compose/docker-compose.local-prod-ngrok.yml`. It preconfigures
same-origin API routing (`VITE_API_BASE_URL` empty) and the fixed frontend
nginx proxy IP (`TRUSTED_PROXY_IPS`, derived automatically from
`FRONTEND_STATIC_IP`/`NGROK_STATIC_IP`). Do not start
this stack from `env/.env.example` or `env/.env.local-prod-cloudflare.example`;
those are dev's and Cloudflare's files respectively. See
[Choosing the right env template](../environment.md#1-choosing-the-right-env-template)
for the full comparison.

---

**Step 4: Fill in your authtoken and domain.**

In the copied `env/.env.local-prod-ngrok`, set:

```
NGROK_AUTHTOKEN=<the authtoken from Step 1>
NGROK_DOMAIN=<your-app>.ngrok-free.app
```

Both are required.

---

**Step 5: Point the app at that domain.**

Still in `env/.env.local-prod-ngrok`, set:

```
GOOGLE_REDIRECT_URI=https://<your-app>.ngrok-free.app/auth/oauth2/callback/google
FRONTEND_BASE_URL=https://<your-app>.ngrok-free.app
JWT_ISSUER=https://<your-app>.ngrok-free.app
JWT_AUDIENCE=https://<your-app>.ngrok-free.app
```

`FRONTEND_BASE_URL` is baked into verification/password-reset email links
and the CORS allow-list too, so it matters even if you never enable Google
login. `BACKEND_BASE_URL` must be *set* for the app to boot, but nothing
reads it at runtime, so it can stay the same value. `JWT_ISSUER`/
`JWT_AUDIENCE` don't have to match `FRONTEND_BASE_URL` for tokens to work
(they're only checked against themselves, see
[Authentication Overview](../../authentication/overview.md)), but leaving
them at the placeholder default means every deployment that copies this
tutorial mints tokens with the same `iss`/`aud`, so update them to this
deployment's real domain too.

---

**Step 6: Register the domain with Google and enable Google login.**

In the [Google Cloud Console](https://console.cloud.google.com/), under
**APIs & Services**, **Credentials**, your OAuth 2.0 Client ID, add
`https://<your-app>.ngrok-free.app/auth/oauth2/callback/google` under
**Authorized redirect URIs** and `https://<your-app>.ngrok-free.app` under
**Authorized JavaScript origins**. It must match `GOOGLE_REDIRECT_URI`
byte-for-byte, or login fails with `redirect_uri_mismatch`.

---

**Step 7: Start the stack.**

```bash
docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok up -d --build
# or: ./scripts/docker/local-prod-ngrok/local-prod-ngrok-up.sh
```

Open `https://<your-app>.ngrok-free.app` in a browser: that's your app,
live on the internet, at a URL that stays the same across restarts. See
[OAuth2 / PKCE](../../authentication/oauth2-pkce.md#troubleshooting) if login
still fails after this.

`frontend` (port 8180) and `backend` (port 8101) are also published to the
host for local debugging, but the public entrypoint is the `ngrok` service,
not those ports.

---

**Step 7b (Optional): Enable session geolocation.**

Setting `GEOIP_DB_PATH`/`GEOIPUPDATE_ACCOUNT_ID`/`GEOIPUPDATE_LICENSE_KEY` in
`env/.env.local-prod-ngrok` alone does nothing: the `geoipupdate` service
that downloads the `.mmdb` file is gated behind the `geoip` Compose
profile, skipped by Step 7's command as written. Re-run Step 7 with the
profile added instead:

```bash
docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok --profile geoip up -d --build
```

Without it, Manage Sessions' Location column silently shows "Unknown" with
nothing in the logs to say why. See
[Session Geolocation](../../geolocation/overview.md)
for the MaxMind account/license-key setup this depends on.

---

## Bugsink stays private

`bugsink` (self-hosted error monitoring) binds to `127.0.0.1:8111` only, not
the ngrok tunnel: `ngrok` in this file proxies `frontend:80` alone. Reach
Bugsink locally at `http://localhost:8111`, or over SSH port-forwarding if
this is a remote host.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ngrok` container exits | `NGROK_AUTHTOKEN` or `NGROK_DOMAIN` is missing or invalid. | Check `env/.env.local-prod-ngrok`, then run `docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok logs ngrok`. |
| Public URL returns an ngrok error page | The static domain is not assigned to your ngrok account or the tunnel is not running. | Confirm the domain in the ngrok dashboard and restart the stack. |
| Google login returns `redirect_uri_mismatch` | Google Cloud Console callback does not match `GOOGLE_REDIRECT_URI`. | Register `https://<your-app>.ngrok-free.app/auth/oauth2/callback/google`. |
| API calls fail but the landing page loads | nginx or backend is unhealthy inside Docker. | Check `docker compose ... ps`, `docker compose ... logs frontend backend`, and the backend ready check on `http://localhost:8101/health/ready`. |
| Bugsink is not reachable through ngrok | This is expected. The tunnel only exposes `frontend:80`. | Use `http://localhost:8111` on the host or an SSH port-forward. |

---
