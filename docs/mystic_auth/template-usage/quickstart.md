# Quickstart

---

*Part of [Using This Repository as a Template](overview.md). This page covers everything needed to go from a fresh clone to a running login with real credentials: the one-command path, each step run by hand, keeping env files honest over time, and the two things (OAuth, email) that need real values.*

## Quickstart

Prefer to hand this to an AI coding agent (Claude Code, Codex, or similar) instead of following the steps below yourself? See [`agent-prompts/new-project-setup.md`](../../../agent-prompts/mystic_auth/new-project-setup.md) at the repo root for a ready-to-paste prompt.

1. Click **[Use this template](https://github.com/Nachiket-2024/mystic-auth/generate)**, then clone *your* new repo.
2. Run `./scripts/mystic_auth/env-tools/quickstart/quickstart.sh` (`.ps1` for PowerShell, `.cmd` for Command Prompt).

   This is the fastest path from a fresh clone to a working login: it runs `setup-env` for you if `env/mystic_auth/.env` doesn't exist yet, brings the dev stack up and waits for every service to become healthy, offers to create the system superuser right there, then tails `backend`/`frontend`/`procrastinate_worker` logs the same way `dev-up` normally does. Safe to re-run any time - each step is skipped or made a no-op once it's already done.

Prefer to see and run each step yourself instead of one script doing all of it? That's exactly what `quickstart` runs under the hood:

- **Env setup**: `./scripts/mystic_auth/env-tools/setup-env/setup-env.sh` (`.ps1`/`.cmd`). Creates `env/mystic_auth/.env` (and every other `env/mystic_auth/.env*` file, plus `frontend/.env`) from its `.example`, asks once for an app name and brand color and applies both everywhere, and generates a distinct random secret for every password field, so this just works for local dev as-is. It skips any file that already exists, so it's safe to re-run. Only two things need real values before those specific features work: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ([OAuth setup](#oauth-setup-google)) and `FROM_EMAIL`/`GMAIL_APP_PASSWORD` ([Email setup](#email-setup)). Everything else runs fine without them. Prefer to do it by hand instead? `cp env/mystic_auth/.env.example env/mystic_auth/.env` still works exactly like it always has.
- **Bring the stack up**: `./scripts/mystic_auth/docker/dev/dev-up.sh` (`.ps1`/`.cmd`). Brings up backend, frontend, Postgres, Redis, Procrastinate, and Bugsink, migrations included, then settles into showing just `backend`/`frontend`/`procrastinate_worker` logs instead of every service's full startup output (see [Docker Overview](../docker/dev-workflow.md#day-to-day-dev-up-helpers)). Plain `docker compose up` still works if you want everything's logs interleaved instead.
- **Create the system superuser** (one-time, CLI-only):

  ```bash
  docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml exec -it backend python -m mystic_auth.scripts.create_system_user
  ```

  See [System Superuser: Bootstrapping and Promotion](../authentication/system-superuser/README.md) for the prompts.

---

Once it's up:

- **Backend docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Bugsink** (error monitoring): [http://localhost:8010](http://localhost:8010)
- **Procrastinate** (email worker, retries, and scheduled account-purge, all in one process): no UI or port, it just runs. The dev helper includes `procrastinate_worker` in the live log tail. Use `docker compose logs -f procrastinate_worker` when you want only its logs. See [Background Email Delivery](../background-workers/procrastinate.md).
- Postgres/Redis are reachable on `localhost:5433`/`localhost:6380` (non-default host ports, to avoid clashing with anything else you have running locally).

---

## Keeping an env file honest over time

Three more scripts complement `setup-env`, once a file is no longer freshly generated:

- **`scripts/mystic_auth/env-tools/set-env-field/set-env-field.sh`** (`.ps1`/`.cmd`): sets one or more fields in every env file that already declares each key, for values meant to be the same everywhere (a contact address, OAuth credentials, a shared rate limit, `DEFAULT_APP_POLICIES`) instead of opening and editing five files by hand. Easiest way: copy `shared-values.env.example` (next to the script) to `shared-values.env`, fill in whichever fields you want with a normal text editor, run the script with no arguments. `set-env-field.sh SUPPORT_EMAIL=you@example.com GOOGLE_CLIENT_ID=...` also works directly, for scripting or an agent prompt. Added a field of your own that only `env/app/` declares? The parallel `scripts/app/env-tools/set-env-field/shared-values.env.example` covers that without ever touching upstream's copy of the script - see [the ownership split](ownership-split.md) for why that file exists.

- **`scripts/mystic_auth/env-tools/check-env/check-env.sh`** (`.ps1`/`.cmd`): run this before starting local-prod or prod. It fails if `ENVIRONMENT=production` but a secret still equals the shipped placeholder, and warns on remaining `<your_...>` placeholders or a host port already bound by something else. It never writes anything.
- **`scripts/mystic_auth/env-tools/rotate-secrets/rotate-secrets.sh`** (`.ps1`/`.cmd`): regenerates `SECRET_KEY` and/or `BUGSINK_SECRET_KEY` in an existing env file. It's deliberately scoped to just those two: `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `BUGSINK_SUPERUSER_PASSWORD`, and `REDIS_PASSWORD` are backed by state a live service already has (a running Postgres only applies `POSTGRES_PASSWORD` on first volume init), so editing the file alone would just break the connection instead of rotating anything. Rotating those safely means changing them at the live service first (`ALTER ROLE ...`, Bugsink's own admin tools), not something either script attempts. Your own `env/app/` secret field, safe to rotate by editing the file? List it in `scripts/app/env-tools/rotate-secrets/fields.env.example`'s copy and this script picks it up too.

---

## Environment configuration

[`env/mystic_auth/.env.example`](../../../env/mystic_auth/.env.example) is the source of truth for which values dev ships with and where they live; comments there are kept short and point at the full field-by-field reference instead of repeating it: [Environment Configuration](../environment/README.md) (split across [Backend Settings](../environment/backend.md), [Frontend Build Settings](../environment/frontend.md), and [Compose-Only Settings](../environment/compose.md)). `frontend/.env.example` only matters if you run the frontend locally with `npm run dev` instead of Docker.

To rename the app: set `APP_NAME` in `env/mystic_auth/.env`, then `docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml up --build`. `docker-compose.dev.yml` aliases `VITE_APP_NAME` from that same `APP_NAME` (the frontend value is baked in at build time), so there's only one setting to change, not two. Nothing else hardcodes a product name. CI keeps using its own placeholder `APP_NAME` regardless; that's expected, not something to sync.

To change the default brand color: set `BRAND_COLOR` in `env/mystic_auth/.env` the same way, aliased to `VITE_BRAND_COLOR`. See [Appearance: Per-User Brand Color](../appearance/overview.md#default-brand-color).

Both `APP_NAME` and `BRAND_COLOR` need to be set again in whichever other
`env/mystic_auth/.env.*.example`-derived files you actually use (`env/mystic_auth/.env.prod`,
`env/mystic_auth/.env.local-prod-cloudflare`, etc.) - each mode reads its own separate
env file, so the value you set in `env/mystic_auth/.env` only affects the dev stack.
`scripts/mystic_auth/env-tools/setup-env/setup-env.sh` (see [Quickstart](#quickstart) above)
applies the same value to every file it creates in one pass, so this only
matters if you set these by hand instead.

If you'll ever run this fork on the same machine as another mystic-auth
fork (another "Use this template" project, yours or someone else's), also
set `COMPOSE_PROJECT_NAME`, the `*_HOST_PORT` vars, and `DOCKER_SUBNET`/the
`*_STATIC_IP` vars in `env/mystic_auth/.env` (and in whichever other `env/mystic_auth/.env.*` files
you use) to something unique to this fork - every fork otherwise defaults
to the exact same Compose project name, host ports, and Docker network
subnet, and the two collide. The built frontend image name derives
from `COMPOSE_PROJECT_NAME` automatically, and the Bugsink team/project
label derives from `APP_NAME` automatically - neither needs a separate
setting. See
[Docker: Compose Modes](../docker/compose-modes.md#two-forks-of-this-template-collide-with-each-other-too).

---

## OAuth setup (Google)

1. Create an OAuth 2.0 Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application type).
2. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI` exactly (scheme, host, path, trailing slash all matter).
3. Fill in `env/mystic_auth/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:8000/auth/oauth2/callback/google` locally).

See [OAuth2 / PKCE](../authentication/oauth2-pkce.md) for the mechanics and troubleshooting.

---

## Email setup

| Variable | Purpose |
|---|---|
| `FROM_EMAIL` | The Gmail account sending mail (also the SMTP username) |
| `GMAIL_APP_PASSWORD` | A Gmail [App Password](https://myaccount.google.com/apppasswords) (needs 2FA enabled) |
| `SUPPORT_EMAIL` | Optional `Reply-To`, falls back to `FROM_EMAIL` |

Without these, signup/verification/reset emails fail to send after retries, but the rest of the app keeps working. See [Background Email Delivery](../background-workers/procrastinate.md).

---

See [Using This Repository as a Template](overview.md) for the rest: what this template provides, the ownership split, customizing the frontend/backend, deployment, and staying in sync with upstream.

---
