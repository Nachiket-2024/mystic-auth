# Docker: Dev Workflow

---

## Day-to-day: dev-up helpers

`docker compose up` (no `-d`) attaches to and interleaves *every* service's
full stdout/stderr into one stream: Postgres's own boot log, Alembic's
migration list, Bugsink's 100+ Django migrations, and (worst of it)
Bugsink's own healthcheck hitting `/health/ready` every 10 seconds,
forever, all mixed in with whatever you actually started the stack to look
at. None of that is useful once the stack is actually up.

Use the helper for your shell:

```bash
# Git Bash, WSL, Linux, macOS
./scripts/docker/dev/dev-up.sh
```

```powershell
# PowerShell
.\scripts\docker\dev\dev-up.ps1
```

```bat
rem Command Prompt
scripts\docker\dev\dev-up.cmd
```

---

The helper script starts the stack detached, restarts `backend` and
`procrastinate_worker` so their startup banners are fresh, waits for health checks,
prints one status line per service, and tails fresh logs from
`backend`/`frontend`/`procrastinate_worker`. The tail includes startup banners, API
traffic, Vite output, and async email task execution.

The script records a timestamp before starting Compose and passes it to
`docker compose logs --since`, so old request or task activity is not replayed
as if it belonged to the current startup. If a service fails to come up, the
status table still prints and the script exits non-zero.

---

Because `backend`/`procrastinate_worker` restart on every invocation, running the
helper a second time while it (or another copy of it) is already tailing
the same stack will restart both again because each invocation is independent.
In-flight requests or tasks may retry, and you should expect an extra boot
banner in that case.

It deliberately does **not** use `docker compose up --wait`, despite that
being the obvious built-in choice. `--wait` treats *any* exited container
as a failure to reach "running," with no exception for a one-shot job that
exited 0 on purpose. `alembic` and `bugsink-seed` (see [Healthchecks](healthchecks.md))
are exactly that. `--wait` reports this stack as failed on every single
successful start, because those two containers correctly finished and
exited. The dev-up helpers poll the long-running services' own status
text directly instead, entirely sidestepping that mismatch.

Plain `docker compose up` still has its place. Run it directly when you
want everything's full logs in one interleaved stream, e.g. actually
debugging Postgres/Bugsink/Alembic startup itself rather than the app.

---

## Running a one-off command inside a container

**Shortcut: `scripts/docker/dev/backend-exec.sh <command>` (Git Bash/WSL/Linux/macOS), `scripts\docker\dev\backend-exec.ps1 <command>` (PowerShell), or `scripts\docker\dev\backend-exec.cmd <command>` (Command Prompt)** run this section's recommended invocation. Both workarounds below are built in and are harmless no-ops on platforms that do not need them. Use these day to day. The raw command is spelled out below for cases the wrapper does not cover.

`docker compose exec -w /repo backend <command>` (used throughout this documentation to run tests against the whole repo: see [Testing Overview](../testing/overview.md)) runs `<command>` with its working directory set to `/repo` inside the container (the whole-repo bind mount: see `docker/compose/docker-compose.dev.yml`'s `backend` service).

---

**On Windows, using Git Bash specifically:** this can fail with `OCI runtime exec failed: exec failed: Cwd must be an absolute path`, even though `/repo` clearly is one. Git Bash silently rewrites arguments that look like Unix paths into Windows paths before handing them to non-MSYS programs like `docker.exe`, which mangles `-w /repo` into something Docker no longer recognizes. Two ways around it, either works:

```bash
# Option 1: disable Git Bash's path rewriting for this one command
MSYS_NO_PATHCONV=1 docker compose exec -w /repo backend <command>

# Option 2: cd inside the container's own shell instead of using -w
docker compose exec backend bash -c "cd /repo && <command>"
```

This is specific to Git Bash's own path handling: PowerShell, Command Prompt, and native Linux/macOS terminals all run `-w /repo` as written, with nothing to work around.

---

**Running `pytest` specifically needs `--user root`, on native Linux.** `pytest.ini` writes coverage output (`.coverage`, `htmlcov/`) to the current working directory: `/repo`, the whole-repo bind mount: and that directory's actual ownership on disk is whatever owns the host's checkout, not the container's own non-root `app` user (same root cause as [why `/app/logs` is a named volume](#why-applogs-is-a-named-volume-not-part-of-the-backendapp-bind-mount), just for coverage's output files instead of the app's own log directory, and not something a single named-volume mount can carve out the way `/app/logs` could, since coverage's output isn't confined to one fixed path). Invisible on Docker Desktop for the same reason as always; a hard `PermissionError`/`INTERNALERROR` on native Linux otherwise:

```text
docker compose exec --user root -w /repo backend pytest tests/backend/
```

Running as root here is scoped to this one throwaway test invocation: it has no bearing on the actual application, which still runs as its normal non-root `app` user by default (`backend.Dockerfile`'s `USER app`) for every real request it serves. One minor side effect worth knowing on native Linux specifically: `.coverage`/`htmlcov/` end up root-owned on the host afterward, so a later `rm -rf htmlcov/` may need `sudo`. Docker Desktop (Windows/Mac) doesn't have this wrinkle either, for the same permissive-bind-mount reason as above.

---

## Why `/app/logs` is a named volume, not part of the `./backend:/app` bind mount

Dev's `backend` and `procrastinate_worker` services bind-mount `./backend:/app` for
hot reload. `mystic_auth/logging/logging_config.py` writes to `/app/logs`.
Without a separate volume, that path would live inside the bind mount and be
owned by the host checkout owner, not the container's non-root `app` user.

Docker Desktop on Windows and macOS hides this because its bind mounts are more
permissive. Native Linux does not. A fresh clone has no `backend/logs/`
directory because it is gitignored, so the container's `app` user cannot create
it inside the host-owned bind mount. `os.makedirs()` then raises
`PermissionError` at import time before the app starts serving. This broke CI
the first time a job booted the dev Compose stack on a Linux runner.

The fix has two parts. `docker/dockerfiles/backend.Dockerfile` creates `/app/logs` and
`chown`s it to the `app` user at build time. `docker/compose/docker-compose.dev.yml` mounts a
Docker-managed volume, `backend_logs:/app/logs`, on top of that path for both
`backend` and `procrastinate_worker`. Docker initializes a fresh named volume from the
image path, including ownership, so the app always writes to a directory owned
by the container user. The tradeoff is that `backend/logs/access.log` is no
longer directly readable from the host in dev. Use
`docker compose exec backend tail -f logs/access.log`, or
`docker compose logs backend` for WARNING and above.

---

See [Docker Overview](overview.md) for the full service list.

---
