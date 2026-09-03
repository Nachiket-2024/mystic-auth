# Environment and Runtime Configuration
---
Deployment modes use separate environment files so dev, local-prod tunnel variants, and prod can hold real values at the same time without overwriting one another.

---

## 1. Choosing the right env template
---

| Mode | Copy this file | To this file | Use with | Best for |
|---|---|---|---|---|
| Dev | `env/.env.example` | `env/.env` | `docker/compose/docker-compose.dev.yml` | Local development with hot reload |
| Local-prod Cloudflare | `env/.env.local-prod-cloudflare.example` | `env/.env.local-prod-cloudflare` | `docker/compose/docker-compose.local-prod-cloudflare.yml` | Your machine through Cloudflare Tunnel |
| Local-prod ngrok | `env/.env.local-prod-ngrok.example` | `env/.env.local-prod-ngrok` | `docker/compose/docker-compose.local-prod-ngrok.yml` | Your machine through ngrok |
| Local-prod Tailscale | `env/.env.local-prod-tailscale.example` | `env/.env.local-prod-tailscale` | `docker/compose/docker-compose.local-prod-tailscale.yml` | Your machine through Tailscale Funnel |
| Prod | `env/.env.prod.example` | `env/.env.prod` | `docker/compose/docker-compose.prod.yml` | Public server with Caddy TLS |

---

## 2. Copy and run examples
---

```bash
# Dev
cp env/.env.example env/.env
docker compose -f docker/compose/docker-compose.dev.yml up

# Local-prod, ngrok example
cp env/.env.local-prod-ngrok.example env/.env.local-prod-ngrok
docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok up -d --build

# Prod
cp env/.env.prod.example env/.env.prod
docker compose -f docker/compose/docker-compose.prod.yml --env-file env/.env.prod up -d --build
```

---

## 3. Compose env-file rule
---

The `--env-file` flag matters for local-prod and prod. Compose only auto-loads a file literally named `env/.env` for `${VAR}` substitution in Compose YAML. Each service's `env_file:` entry points at the correct dedicated file, but frontend build args and other Compose-level substitutions still need `--env-file`.

Use the helper scripts when possible because they always pass the matching env file:

1. `scripts/docker/dev/dev-up.*`
2. `scripts/docker/local-prod-cloudflare/local-prod-cloudflare-up.*`
3. `scripts/docker/local-prod-ngrok/local-prod-ngrok-up.*`
4. `scripts/docker/local-prod-tailscale/local-prod-tailscale-up.*`
5. `scripts/docker/prod/prod-up.*`

---

## 4. Runtime vs build-time settings
---

| Setting group | Read time | Examples |
|---|---|---|
| Backend runtime settings | Container or process startup | `DATABASE_URL`, `APP_DATABASE_URL`, `SECRET_KEY`, `GOOGLE_REDIRECT_URI`, SMTP settings, rate-limit settings, `SENTRY_DSN` |
| Frontend build settings | Image build time | `VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_BRAND_COLOR`, `VITE_SUPPORT_EMAIL`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` |
| Compose interpolation settings | Compose command evaluation | Tunnel tokens, public domains, frontend build args, image names, exposed ports |

Production-shaped frontend values are baked into the static bundle by `docker/dockerfiles/frontend.Dockerfile`. After changing any `VITE_*` input, rebuild the frontend image with `--build`.

---

## 5. Required production review
---

Review these settings before sharing a production-shaped deployment:

1. Set `ENVIRONMENT=production` to disable `/docs`, `/redoc`, and `/openapi.json`.
2. Generate real values for `SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `GMAIL_APP_PASSWORD`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, and `BUGSINK_SECRET_KEY`.
3. Configure at least one user verification path: SMTP email for password signup or Google OAuth2 login.
4. Set `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` to the public origin for the selected deployment.
5. Set `GOOGLE_REDIRECT_URI` to the exact registered callback URL.
6. Set `JWT_ISSUER` and `JWT_AUDIENCE`, normally to the backend origin for this deployment.
7. Set `TRUSTED_PROXY_IPS` to the reverse-proxy hop that should be trusted for `X-Forwarded-For`.
8. Leave `VITE_API_BASE_URL` empty for the bundled same-origin nginx proxy, or set it only when the frontend is deployed separately.
9. Set `DEFAULT_APP_POLICIES` only when downstream app policies should be assigned to every verified user.
10. Configure `SENTRY_DSN` and `VITE_SENTRY_DSN` only when error monitoring is enabled.
11. Configure `GEOIP_DB_PATH` and `GEOIPUPDATE_*` only when enabling the `geoip` Compose profile.
12. Keep `USER_EXPORT_MAX_ROWS` sized for the largest safe CSV export your deployment can handle.

---

## 6. Related docs
---

1. [Configuration Reference](../configuration/environment.md)
2. [Deployment Guide](guide.md)
3. [Local-Prod Deployment](local-prod/README.md)
4. [Error Monitoring](../error-monitoring/overview.md)
5. [Session Geolocation](../geolocation/overview.md)

---
