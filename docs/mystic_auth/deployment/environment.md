# Environment and Runtime Configuration
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

Deployment modes use separate environment files so dev, local-prod tunnel variants, and prod can hold real values at the same time without overwriting one another.

---

## 1. Choosing the right env template
---

| Mode | Copy this file | To this file | Use with | Best for |
|---|---|---|---|---|
| Dev | `env/mystic_auth/.env.dev.example` plus `env/app/.env.dev.example` | `env/mystic_auth/.env.dev` plus `env/app/.env.dev` | `docker/mystic_auth/compose/docker-compose.dev.yml` plus `docker/app/compose/docker-compose.dev.yml` | Local development with hot reload |
| Local-prod Cloudflare | `env/mystic_auth/.env.local-prod-cloudflare.example` plus the matching app example | matching `env/mystic_auth/` and `env/app/` files | matching `docker/mystic_auth/` and `docker/app/` Compose files | Your machine through Cloudflare Tunnel |
| Local-prod ngrok | `env/mystic_auth/.env.local-prod-ngrok.example` plus the matching app example | matching `env/mystic_auth/` and `env/app/` files | matching `docker/mystic_auth/` and `docker/app/` Compose files | Your machine through ngrok |
| Local-prod Tailscale | `env/mystic_auth/.env.local-prod-tailscale.example` plus the matching app example | matching `env/mystic_auth/` and `env/app/` files | matching `docker/mystic_auth/` and `docker/app/` Compose files | Your machine through Tailscale Funnel |
| Prod | `env/mystic_auth/.env.prod.example` plus `env/app/.env.prod.example` | `env/mystic_auth/.env.prod` plus `env/app/.env.prod` | `docker/mystic_auth/compose/docker-compose.prod.yml` plus `docker/app/compose/docker-compose.prod.yml` | Public server with Caddy TLS |

---

## 2. Copy and run examples
---

```bash
# Dev
cp env/mystic_auth/.env.dev.example env/mystic_auth/.env.dev
cp env/app/.env.dev.example env/app/.env.dev
docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml -f docker/app/compose/docker-compose.dev.yml --env-file env/mystic_auth/.env.dev --env-file env/app/.env.dev up

# Local-prod, ngrok example
cp env/mystic_auth/.env.local-prod-ngrok.example env/mystic_auth/.env.local-prod-ngrok
cp env/app/.env.local-prod-ngrok.example env/app/.env.local-prod-ngrok
docker compose -f docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml -f docker/app/compose/docker-compose.local-prod-ngrok.yml --env-file env/mystic_auth/.env.local-prod-ngrok --env-file env/app/.env.local-prod-ngrok up -d --build

# Prod
cp env/mystic_auth/.env.prod.example env/mystic_auth/.env.prod
cp env/app/.env.prod.example env/app/.env.prod
docker compose -f docker/mystic_auth/compose/docker-compose.prod.yml -f docker/app/compose/docker-compose.prod.yml --env-file env/mystic_auth/.env.prod --env-file env/app/.env.prod up -d --build
```

The app-side examples are intentionally empty. Keep template-defined values
in the `mystic_auth` runtime file and add product-specific values in the
matching `env/app/` file; do not edit tracked examples or tracked upstream
Compose files.

---

## 3. Compose env-file rule
---

The `--env-file` flag matters for local-prod and prod. Compose only auto-loads a file named `.env` in the working directory for `${VAR}` substitution in Compose YAML, so the files under `env/` must be passed explicitly. Each service's `env_file:` entry points at the correct dedicated file, but frontend build args and other Compose-level substitutions still need `--env-file`.

Use the helper scripts when possible because they always pass the matching env file:

1. `scripts/mystic_auth/docker/dev/dev-up.*`
2. `scripts/mystic_auth/docker/local-prod-cloudflare/local-prod-cloudflare-up.*`
3. `scripts/mystic_auth/docker/local-prod-ngrok/local-prod-ngrok-up.*`
4. `scripts/mystic_auth/docker/local-prod-tailscale/local-prod-tailscale-up.*`
5. `scripts/mystic_auth/docker/prod/prod-up.*`

---

## 4. Runtime vs build-time settings
---

| Setting group | Read time | Examples |
|---|---|---|
| Backend runtime settings | Container or process startup | `DATABASE_URL`, `APP_DATABASE_URL`, `SECRET_KEY`, `GOOGLE_REDIRECT_URI`, SMTP settings, rate-limit settings, `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`, `SENTRY_DSN` |
| Compose-only scaling setting | Compose command evaluation, not read by the app itself | `UVICORN_WORKERS` |
| Frontend build settings | Image build time | `VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_BRAND_COLOR`, `VITE_SUPPORT_EMAIL`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` |
| Compose interpolation settings | Compose command evaluation | Tunnel tokens, public domains, frontend build args, image names, exposed ports |

Production-shaped frontend values are baked into the static bundle by `docker/mystic_auth/dockerfiles/frontend.Dockerfile`. After changing any `VITE_*` input, rebuild the frontend image with `--build`.

---

## 5. Required production review
---

`scripts/mystic_auth/env-tools/check-env/check-env.sh <file>` (`.ps1`/`.cmd`) automates the part
of this review a script can check: it fails if `ENVIRONMENT=production` but
a secret still equals the shipped placeholder, or the required backup key/upload
command is blank or the upload command does not reference `$DUMP_FILE`; it warns
on remaining `<your_...>` placeholders or a host port already bound by
something else.
Run it before `up`, then review the rest of this list by hand:

Review these settings before sharing a production-shaped deployment:

1. Set `ENVIRONMENT=production` to disable `/docs`, `/redoc`, and `/openapi.json`.
2. Generate real values for `SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `GMAIL_APP_PASSWORD`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, and `BUGSINK_SECRET_KEY`.
3. Configure at least one user verification path: SMTP email for password signup or Google OAuth2 login.
4. Set `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` to the public origin for the selected deployment.
5. Set `GOOGLE_REDIRECT_URI` to the exact registered callback URL.
6. Set `JWT_ISSUER` and `JWT_AUDIENCE`, normally to the backend origin for this deployment.
7. Set `TRUSTED_PROXY_IPS` to the reverse-proxy hop that should be trusted for `X-Forwarded-For`. For the bundled prod/local-prod-* Compose files this is derived automatically from `FRONTEND_STATIC_IP`/the tunnel's `*_STATIC_IP` var - see [Routing: Trusted proxy IPs](routing.md#2-trusted-proxy-ips) - so review those vars instead of `TRUSTED_PROXY_IPS` directly.
8. Leave `VITE_API_BASE_URL` empty for the bundled same-origin nginx proxy, or set it only when the frontend is deployed separately.
9. Set the app-owned `DEFAULT_APP_POLICIES` in the matching `env/app/.env.<mode>` file only when downstream app policies should be assigned to every verified user. Do not add it to `env/mystic_auth`.
10. Configure `SENTRY_DSN` and `VITE_SENTRY_DSN` only when error monitoring is enabled.
11. Configure `GEOIP_DB_PATH` and `GEOIPUPDATE_*` only when enabling the `geoip` Compose profile.
12. Keep `USER_EXPORT_MAX_ROWS` sized for the largest safe CSV export your deployment can handle.
13. `UVICORN_WORKERS` auto-sizes on boot and needs no default value; only set it to override the auto-picked count, and size `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` to match if you do - see [Scaling](scaling.md#1-sizing-workers-on-one-host).
14. For passkeys, set `WEBAUTHN_RP_ID` to the public hostname and `WEBAUTHN_ORIGINS` to the exact HTTPS frontend origin(s), or leave them blank to derive defaults from `FRONTEND_BASE_URL`. Keep the RP ID stable after users register credentials. See [Passkeys](../authentication/passkeys.md#relying-party-configuration-and-domains).

---

## 6. Optional: Running the backend without Docker

---

Useful for iterating on the backend with a debugger attached, or a faster
reload loop than the Dockerized `dev` target gives you. Postgres and Valkey
still run in Docker either way; only the FastAPI process itself moves to
the host.

1. From the repo root, create a virtualenv and install both dependency files: `pip install --require-hashes -r backend/requirements.txt -r backend/requirements-dev.txt`. These files are generated locks; see [Dependency locking](dependency-locking.md) before changing a dependency.
2. Run `scripts/mystic_auth/docker/dev/backend-host-run.sh` (`.ps1`/`.cmd`). It starts only Postgres and Valkey, reads `POSTGRES_HOST_PORT`/`VALKEY_HOST_PORT`, derives the host-reachable URLs in memory, runs migrations, and starts Uvicorn with `--reload`. Pass extra Uvicorn arguments after the script path when needed.

`Settings` (`backend/mystic_auth/core/settings.py`) reads `env/mystic_auth/.env.dev` and `env/app/.env.dev` directly when a variable isn't already in the process environment. The host-run helper supplies only the rewritten connection URLs and leaves the env files unchanged, so a single host-port edit works for both Docker and host-run workflows.

Running the whole suite this way? `tests/backend/conftest.py` does the same `postgres`/`valkey` -> `localhost` derivation automatically from `env/mystic_auth/.env.dev` when `DATABASE_URL`/`VALKEY_URL` aren't already set, so `pytest` from the repo root needs no extra URL setup once the data services are running. See [Testing Overview](../testing/overview.md).

---

## 7. Scaling, multiple backends and secret rotation
---

- [Scaling and Multiple Backend Containers](scaling.md): `UVICORN_WORKERS` auto-sizing, connection budgets, measurements, and running several backend containers behind a load balancer.
- [Rotating Secrets](secret-rotation.md): which secrets the script rotates and the order for secrets a running service also holds.

---

## 8. Related docs
---

1. [Configuration Reference](../environment/README.md)
2. [Deployment Overview](README.md)
3. [Local-Prod Deployment](local-prod/README.md)
4. [Scaling](scaling.md) and [Rotating Secrets](secret-rotation.md)
5. [Error Monitoring](../error-monitoring/overview.md)
6. [Session Geolocation](../geolocation/overview.md)

---
