# Environment Configuration
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

Every environment variable this repository currently ships in `env/*.example`, grouped by the code
that reads it and split across three pages so each stays a readable size. Use it with the
deployment walkthroughs:

1. Dev: copy `env/.env.example` to `env/.env`.
1. Local-prod Cloudflare: copy `env/.env.local-prod-cloudflare.example` to
  `env/.env.local-prod-cloudflare`.
1. Local-prod ngrok: copy `env/.env.local-prod-ngrok.example` to
  `env/.env.local-prod-ngrok`.
1. Local-prod Tailscale: copy `env/.env.local-prod-tailscale.example` to
  `env/.env.local-prod-tailscale`.
1. Prod: copy `env/.env.prod.example` to `env/.env.prod`.

`backend/app/main.py` loads `env/.env` before importing `app.sdk` in dev. In
local-prod and prod, Compose passes the mode-specific env file into each
service through `env_file:` and also needs `--env-file` for `${VAR}` build
argument substitution.

---

## Pages

- [Backend Settings](backend.md): fields read by `backend/mystic_auth/core/settings.py`.
- [Frontend Build Settings](frontend.md): `VITE_*` values baked into the static bundle at build time.
- [Compose-Only Settings](compose.md): values read by Docker Compose, entrypoints, or helper scripts, not by the app itself.

---

## Edge Cases

1. `SECRET_KEY` shorter than 32 characters stops backend startup at settings
  import time.
1. `FRONTEND_ADDITIONAL_BASE_URLS` affects CORS only. It never changes email
  links or OAuth redirects.
1. `TRUSTED_PROXY_IPS` must name the immediate proxy that connects to the
  backend, not the public client IP. If the peer is not trusted, forged
  `X-Forwarded-For` is ignored.
1. Frontend `VITE_*` variables in production-style modes are build-time values.
  Restarting the container is not enough after changing them.
1. `APP_DATABASE_URL` can be blank. When set, the app and Procrastinate task
  bodies use it for CRUD work, while Alembic still uses `DATABASE_URL` for DDL.
1. `GEOIP_DB_PATH` alone does not download a database. Docker downloads the
  MaxMind file only when `geoipupdate` is enabled with `--profile geoip`.
1. `EMAIL_ENABLED=false` lets flows enqueue and render email content without
  contacting SMTP, but users still need the resulting token/link through logs
  or tests to finish verification or reset flows.

---
