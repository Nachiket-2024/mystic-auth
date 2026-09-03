# Docker: Compose Modes

---

## Dev vs. production compose

| | `docker-compose.dev.yml` | `docker-compose.local-prod-{cloudflare,ngrok,tailscale}.yml` | `docker-compose.prod.yml` |
|---|---|---|---|
| Purpose | Local development | Self-hosted production image shape behind a free tunnel | Self-hosted deployment on your own server with Caddy-managed TLS |
| Frontend | Vite dev server, HMR, bind-mounted source | nginx serving the baked-in static build | nginx serving the baked-in static build, reached through Caddy |
| Backend/worker | `--reload`, bind-mounted `./backend:/app` | No reload, code baked into the image | No reload, code baked into the image |
| Restart policy | `restart: always` for Postgres/Redis only | `unless-stopped` on every long-running service | `unless-stopped` on every long-running service |
| Ports exposed | 5433 (Postgres), 6380 (Redis), 8000 (backend), 5173 (frontend), 8010 (Bugsink), all on localhost-friendly dev ports | backend/frontend/Bugsink published for local debugging, offset per tunnel variant (8001/8080/8011 cloudflare, 8101/8180/8111 ngrok, 8201/8280/8211 tailscale) so any of them can run alongside dev and each other | Only 80/443 on Caddy. Postgres, Redis, backend, and frontend are internal-only |
| TLS | None | Terminates at the tunnel provider's edge | Caddy with automatic Let's Encrypt certificates |
| `backend` startup gate | Postgres and Redis healthy | Postgres and Redis healthy, plus `alembic: service_completed_successfully` | Postgres and Redis healthy, plus `alembic: service_completed_successfully` |
| `procrastinate_worker` startup gate | Postgres healthy | Postgres healthy, plus `alembic: service_completed_successfully` | Postgres healthy, plus `alembic: service_completed_successfully` |

All under `docker/compose/`. Use one of the `docker-compose.local-prod-*.yml`
variants when you want to self-host the production image/runtime shape from
a machine that does not own a public IP, with a free tunnel (Cloudflare,
ngrok, or Tailscale Funnel - see [Local-Prod: which tunnel do I want?](../deployment/local-prod/README.md#which-tunnel-do-i-want))
owning the public URL and TLS. Use `docker-compose.prod.yml` when the host
itself should expose only Caddy on 80/443. See [Deployment Guide](../deployment/guide.md).

---

## Each compose file is its own Compose project

All five files declare a top-level `name:` (`mystic-auth-dev`,
`mystic-auth-local-prod-cloudflare`, `mystic-auth-local-prod-ngrok`,
`mystic-auth-local-prod-tailscale`, `mystic-auth-prod`). Without it, Compose
derives the project name from the directory (`mystic-auth` for every file
here, since they all live in the same directory), which means every
container, network, and **named volume** (`postgres_data`, `backend_logs`,
...) from any of the five files collides on the exact same name. Two of
these stacks running "side by side" then aren't actually isolated: they
silently share one Postgres volume, so a command that looks scoped to one
stack (`docker compose -f docker-compose.dev.yml down -v`, or even just
recreating a volume to fix a stale password) can wipe what's actually a
different stack's real data. That's a real incident, not a hypothetical: an
early local-prod test environment's database (test users, custom PBAC
policies) was lost exactly this way, mid-session, before this fix.

With each file's `name:` set, `docker compose -f docker/compose/docker-compose.dev.yml up -d`
and `docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok up -d --build` can run
at the same time on one machine with zero collision - separate containers
(`mystic-auth-dev-postgres-1` vs. `mystic-auth-local-prod-ngrok-postgres-1`),
separate networks, separate volumes. If you have a pre-existing stack from
before this restructure (containers plainly named `mystic-auth-postgres-1`
or `mystic-auth-local-prod-postgres-1`, no tunnel suffix in the name), it's
running under an old project name and is now orphaned from every compose
file's default target - `docker compose -p <old-project-name> -f <old-path>.yml down`
(explicitly naming the old project) stops it; its data volumes
(`<old-project-name>_postgres_data`, ...) survive that and can be inspected
or removed manually once you've confirmed you don't need them.

---

See [Docker Overview](overview.md) for the full service list, or
[Dockerfiles](dockerfiles.md) for image build details.

---
