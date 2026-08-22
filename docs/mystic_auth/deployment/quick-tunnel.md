# Quick Tunnel (zero setup)

See [Local-Prod Deployment](local-prod.md) for the mode chooser, environment
variables, and how local-prod differs from dev/prod. This page is the
zero-setup Cloudflare Quick Tunnel walkthrough, start to finish.

---

**Step 1: Copy the env file.**

```bash
cp .env.local-prod.example .env.local-prod
```

`.env.local-prod.example` is the local-prod template for
`docker-compose.local-prod.yml`. It is preconfigured for Quick Tunnel:
`VITE_API_BASE_URL` is empty for same-origin API calls, and
`TRUSTED_PROXY_IPS=172.28.0.10` matches the fixed frontend nginx address.
You can boot before filling in Google or SMTP credentials. The CLI-created
system superuser can still sign in and view the dashboard because the script
marks it verified. Regular users need one verification path: SMTP for password
signup, email verification, and password reset, or Google OAuth2 login. See
[System Superuser](../authentication/system-superuser.md) for the interactive
command, or `local-scripts/local-prod/create-system-user.*` for a
non-interactive version.

Do not start local-prod from `.env.example`. That file points the frontend at
localhost dev ports and leaves production routing values unset. See
[Choosing the right env template](guide.md#choosing-the-right-env-template)
for the mode comparison.

---

**Step 2: Start the stack.**

```bash
docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod up -d --build
```

---

**Step 2b (Optional): Enable session geolocation.**

Setting `GEOIP_DB_PATH`/`GEOIPUPDATE_ACCOUNT_ID`/`GEOIPUPDATE_LICENSE_KEY` in
`.env.local-prod` alone does nothing. The `geoipupdate` service that downloads the
`.mmdb` file is gated behind the `geoip` Compose profile, skipped by Step 2's
command as written. Re-run Step 2 with the profile added instead:

```bash
docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod --profile geoip up -d --build
```

Without it, Manage Sessions' Location column silently shows "Unknown" with
nothing in the logs to say why. See
[Session Geolocation](../geolocation/overview.md)
for the MaxMind account/license-key setup this depends on.

---

**Step 3: Get your public URL.**

```bash
docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod logs -f cloudflared
```

Within a few seconds, this prints a `https://<random-words>.trycloudflare.com`
URL: that's your app, live on the internet. Open it in a browser.

`frontend` (port 80) and `backend` (port 8000) are also published to the
host for local debugging, but the public entrypoint is `cloudflared`, not
those ports.

At this point signup, password login, and browsing already work through
that URL. That's because `VITE_API_BASE_URL` is left empty, so the
frontend calls the API on whatever origin it was loaded from, and nginx
proxies that same-origin request to `backend` internally. Google login
needs a few more steps, since it's the one flow tied to the exact tunnel
URL: continue below to enable it.

---

**Step 4: Copy the URL for Google.**

Copy the URL from Step 3's logs (or re-run
`docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod logs cloudflared | grep trycloudflare.com`).
You'll paste it into two places in the next two steps.

Unlike every other flow, the OAuth2 callback (`oauth2_login_handler.py`)
issues a hard, cross-origin redirect built from `FRONTEND_BASE_URL` after
setting the auth cookies on the tunnel host. If `FRONTEND_BASE_URL` is
stale (e.g. left at `http://localhost`), the browser gets sent to a
different origin than the one holding the cookies, `/auth/me` comes back
401, and the user is bounced to `/login`, even though the account was
created/verified successfully server-side. That's what Steps 5–6 prevent.

---

**Step 5: Register that URL with Google.**

In the [Google Cloud Console](https://console.cloud.google.com/), under
**APIs & Services**, **Credentials**, your OAuth 2.0 Client ID, add
`<that URL>/auth/oauth2/callback/google` under **Authorized redirect URIs**
and `<that URL>` under **Authorized JavaScript origins**. Old entries from
past restarts can be removed, or left there (Google allows multiple).

---

**Step 6: Point the app at that URL.**

In `.env.local-prod`, set:

```
GOOGLE_REDIRECT_URI=<that URL>/auth/oauth2/callback/google
FRONTEND_BASE_URL=<that URL>
```

(`FRONTEND_BASE_URL` is also baked into verification/password-reset email
links and the CORS allow-list, so keeping it current matters even beyond
Google login. `BACKEND_BASE_URL` must be *set* for the app to boot, but
nothing reads it at runtime, so it never needs to track the tunnel URL.)

---

**Step 7: Apply it.**

`.env.local-prod` values here are read at container runtime, not baked into the
image, so a plain restart is enough (**no `--build`**):

```bash
docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod up -d
```

**The Quick Tunnel URL changes on every restart**, so if you stop and start
the stack again, repeat Steps 4–7 to keep Google login working. If that's
more friction than it's worth, either test Google login against the dev
stack instead (`http://localhost:5173`,
`GOOGLE_REDIRECT_URI=http://localhost:8000/auth/oauth2/callback/google`), or
switch to [Named Tunnel](named-tunnel.md), where this is one-time setup.

---

**Step 7b: If you get a Cloudflare 502 instead of a 401.**

This is a different failure from Step 4's stale-`FRONTEND_BASE_URL` 401,
and it isn't specific to Google login: every API call fails the same way,
including plain password login. Cause: `frontend`'s nginx resolves the
`backend` hostname to a Docker-internal IP once, when nginx starts, and
keeps using it. If you (or a crash) restart just the `backend` container,
using `docker restart backend` or `docker compose ... up -d --build backend`,
without also restarting `frontend`, backend comes back on a new internal
IP and nginx keeps proxying to the old, now-dead one. `docker logs
<frontend container>` shows `connect() failed (111: Connection refused)
while connecting to upstream`.

Fix: restart `frontend` too, so nginx re-resolves the address:

```bash
docker compose -f docker-compose.local-prod.yml --env-file .env.local-prod restart frontend
```

Safest habit: restart/rebuild `backend` and `frontend` together (or just
re-run Step 2's full `up -d --build`) rather than targeting `backend`
alone.
