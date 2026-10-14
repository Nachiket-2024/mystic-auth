# CI Local Validation

---

*Part of the [CI/CD Overview](overview.md). These commands mirror the local
checks in `.github/workflows/ci.yml`; they do not reproduce GitHub-hosted
runner behavior or artifact upload.*

Run commands from the repository root. Backend suites need the configured
Postgres and Valkey services. Compose commands always use both ownership
overrides and both env files, with MysticAuth first. Never overwrite an
existing runtime env file to make a check run.

---

## Backend and frontend

Install dependencies as in CI, then run the same wrappers:

```bash
# Backend dependency audit, lint, types, and security
ci/mystic_auth/backend.sh audit-dependencies
ci/mystic_auth/backend.sh lint
ci/app/backend.sh lint
ci/mystic_auth/backend.sh typecheck
ci/app/backend.sh typecheck
ci/mystic_auth/backend.sh security
ci/app/backend.sh security

# With Postgres and Valkey available, run migrations and tests in CI order
(cd backend && alembic upgrade head && alembic check)
ci/app/backend.sh unit
ci/mystic_auth/backend.sh unit
ci/mystic_auth/backend.sh integration
ci/mystic_auth/backend.sh security-tests
ci/mystic_auth/backend.sh performance

# Frontend
ci/app/frontend.sh audit
ci/app/frontend.sh typecheck
ci/app/frontend.sh lint
ci/app/frontend.sh test-coverage
ci/app/frontend.sh build
```

CI copies `frontend/.env.example` to the ignored runtime file `frontend/.env`
before frontend checks. Locally, make that copy only when the file is absent;
remove it after validation only if this run created it. Never overwrite an
existing `frontend/.env`.

The app and MysticAuth unit suites append to the same coverage data. Run the
integration and security suites in order so the final 90% gate sees cumulative
coverage, as it does in CI. The performance suite is non-blocking in GitHub
Actions because timing varies between shared runners.

---

## Tooling and Windows PowerShell

Run the `tooling-tests` checks through the repository entry point:

```bash
for check in script-paths split-paths platform-wrappers image-digests \
  log-rotation action-pinning readonly-rootfs env-tools upstream-sync \
  backup-freshness backup-encryption backup-network host-backend; do
  ci/mystic_auth/tooling.sh "$check"
done
```

On a Windows laptop with this checkout in WSL2, invoke the Windows regression
through `powershell.exe`; `pwsh` inside WSL2 is not required:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/ci/mystic_auth/tooling.ps1")"
```

The GitHub Actions Windows runner is still the authoritative hosted result.

---

## Secrets scan

Gitleaks needs the full Git history to match CI:

```bash
gitleaks detect --source . --redact
```

The workflow also runs the pinned Trivy image with the JWT-aware secret
scanner. Run the same image and flags locally, keeping any scan output out of
the terminal if it could contain a detected value:

```bash
docker run --rm -v "$PWD:/repo:ro" \
  aquasec/trivy:0.68.1@sha256:a93fd67162843c0f749002af9245fe9a2e5edc41445bd71d3949c803e95ef05b \
  fs --scanners secret --exit-code 1 --no-progress /repo
```

---

## Docker images and Compose

The image job builds and scans these exact targets:

```bash
docker build --target runtime -f docker/mystic_auth/dockerfiles/backend.Dockerfile -t backend:ci .
docker build --target production -f docker/mystic_auth/dockerfiles/frontend.Dockerfile -t frontend:ci .
docker build -f docker/mystic_auth/dockerfiles/db-backup.Dockerfile -t db-backup:ci .
docker build -f docker/mystic_auth/dockerfiles/ngrok.Dockerfile -t ngrok:ci .
```

Run Trivy against each image with the pinned CI image and these options:
`image --severity CRITICAL,HIGH --exit-code 1 --ignore-unfixed`. For `ngrok:ci`,
also pass `--ignorefile ci/mystic_auth/trivy-ngrok.ignore.yaml`; those
image-scoped exceptions expire on 2026-11-14 and cover only findings in the
vendor-built binary. CI verifies dependency notices, frontend nginx behavior,
the ngrok binary, and generates SPDX JSON SBOMs from the exact image IDs.
GitHub artifact upload and hosted runner metadata cannot be reproduced locally.

To validate all Compose files, CI copies each `.example` file to its runtime
name only after checking none of those paths already exists, then removes only
the files it created. Use the same safeguard for a local run. Production
Compose boot still requires valid deployment credentials; render production
configuration with examples where supported, but record credential-dependent
boot and public host checks separately.

---

## Browser E2E and disposable stack

CI runs `chromium-desktop`, `chromium-mobile`, `firefox-desktop`, and
`webkit-desktop` as separate jobs, each with its own Compose project. To run
one project locally, install the matching Playwright browser in `frontend/`,
then use the stack helper from the repository root:

```bash
ci/mystic_auth/frontend-e2e-stack.sh prepare
ci/mystic_auth/frontend-e2e-stack.sh up
ci/mystic_auth/frontend-e2e-stack.sh wait-backend
ci/mystic_auth/frontend-e2e-stack.sh seed-matrix
ci/mystic_auth/frontend-e2e-stack.sh wait-frontend
ci/mystic_auth/frontend-e2e-stack.sh smoke
ci/mystic_auth/frontend-e2e-stack.sh stop-frontend
```

Run MysticAuth with the project name and worker count from the workflow matrix:

```bash
EMAIL_ENABLED=false PLAYWRIGHT_BASE_URL=http://localhost:5173 \
PLAYWRIGHT_USE_PREVIEW=1 PLAYWRIGHT_WORKERS=2 \
ci/mystic_auth/frontend-e2e.sh --project=chromium-desktop
```

Use `PLAYWRIGHT_WORKERS=1` for WebKit. Run `ci/app/frontend-e2e.sh` once from
the Chromium desktop run. That job also runs:

```bash
ci/mystic_auth/tooling.sh backup-roundtrip
ci/mystic_auth/tooling.sh restore-drill
```

Always tear down the disposable stack after the run, including after a failure:

```bash
ci/mystic_auth/frontend-e2e-stack.sh down
```

The helper refuses to overwrite existing `env/mystic_auth/.env.dev` or
`env/app/.env.dev` files and removes only files it created. It uses the dev
Compose project configured by the example values; do not point it at a stack
that contains data you need.

---

## Main-only Docker full suite

The `docker-full-suite` job runs only on pushes to `main`. It builds the backend
test target and frontend container, then reruns the complete backend and
frontend suites through the running Compose services. Follow that job's
commands in `.github/workflows/ci.yml` when reproducing it locally. Use a
disposable Compose project and clean env files, because the job removes its
database volume during teardown.

GitHub Actions artifact uploads, hosted-runner behavior, and live deployment
checks remain GitHub- or deployment-specific. Report each one as not run when
it cannot be reproduced locally.

---
