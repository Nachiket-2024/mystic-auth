# Named Tunnel (stable URL)

See [Local-Prod Deployment](local-prod.md) for the mode chooser, environment
variables, and how local-prod differs from dev/prod. This page is the stable-URL
Cloudflare Named Tunnel walkthrough, start to finish.

---

Requires a domain added to a free Cloudflare account. The domain's DNS
zone must live in *your own* Cloudflare account for tunnel routing to
work. A subdomain donated by a third-party registry repo (`is-a.dev`,
`rweb.site`, etc.) will not work here, since Cloudflare Tunnel resolves the
target tunnel by matching the request against Public Hostname config in
the account that owns the zone: a zone you don't control can't route to
a tunnel it doesn't know about. If you don't already own a domain, buying
a cheap one (a few dollars a year, e.g. from Namecheap or Porkbun) and
adding its nameservers to your Cloudflare account is the only way to get
this working.

**Step 1: Copy the env file.**

```bash
cp .env.local-prod.example .env
```

Same file as [Quick Tunnel](quick-tunnel.md): see Step 1 there for what it
preconfigures. Do not start local-prod from `.env.example`; that file is for
the dev stack.

---

**Step 2: Create the tunnel in Cloudflare.**

Zero Trust dashboard → Networks → Tunnels → Create a tunnel → Cloudflared
→ name it. Copy the token shown in the install step into `TUNNEL_TOKEN`
in `.env`.

---

**Step 3: Point the tunnel at your app.**

Still in that tunnel's config: Public Hostname → Add a public hostname →
your domain or subdomain → Service: HTTP → `http://frontend:80`.

---

**Step 4: Point the app at that hostname.**

In `.env`, set `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` to
`https://your-hostname` once it's live. Leave `VITE_API_BASE_URL` empty:
frontend and backend share one public origin behind the tunnel, and nginx
(`docker/nginx.frontend.conf`) proxies API prefixes to `backend`
same-origin, so the browser never needs a separate API URL.

---

**Step 5: Register the hostname with Google and enable Google login.**

In the [Google Cloud Console](https://console.cloud.google.com/), under
**APIs & Services**, **Credentials**, your OAuth 2.0 Client ID, add
`https://your-hostname/auth/oauth2/callback/google` under **Authorized
redirect URIs** and `https://your-hostname` under **Authorized
JavaScript origins**. Then set `GOOGLE_REDIRECT_URI` in `.env` to that
same redirect URI. It must match byte-for-byte, or login fails with
`redirect_uri_mismatch`.

---

**Step 6: Switch the compose file to Named Tunnel mode.**

Edit `docker-compose.local-prod.yml`'s `cloudflared` service `command:`
from the Quick Tunnel form to:

```yaml
command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
```

---

**Step 7: Start (or restart) the stack.**

```bash
docker compose -f docker-compose.local-prod.yml up -d --build
```

Open `https://your-hostname` in a browser: that's your app, live at a
stable address. Unlike Quick Tunnel, this URL doesn't change, so Steps 4
and 5 are one-time setup, not something you repeat on every restart. See
[OAuth2 / PKCE](../authentication/oauth2-pkce.md#troubleshooting) if login
still fails after this.

---

**Step 7b (Optional): Enable session geolocation.**

Setting `GEOIP_DB_PATH`/`GEOIPUPDATE_ACCOUNT_ID`/`GEOIPUPDATE_LICENSE_KEY` in
`.env` alone does nothing: the `geoipupdate` service that downloads the
`.mmdb` file is gated behind the `geoip` Compose profile, skipped by Step 7's
command as written. Re-run Step 7 with the profile added instead:

```bash
docker compose -f docker-compose.local-prod.yml --profile geoip up -d --build
```

Without it, Manage Sessions' Location column silently shows "Unknown" with
nothing in the logs to say why. See
[Session Geolocation](../geolocation/overview.md)
for the MaxMind account/license-key setup this depends on.
