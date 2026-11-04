# Known Issues, Limitations & Technical Debt
---

Tracked deliberately rather than left as silent gaps. Each entry reflects an active, unresolved limitation in the current implementation: nothing speculative, and nothing already fixed (resolved items live in the relevant feature documentation instead).

---

## CI/CD

---

### Performance tests are non-blocking in CI

**Description**: The backend `performance` suite (`tests/backend/mystic_auth/performance`) runs in CI with `continue-on-error: true`, so a failure there is visible but never fails the build.

**Impact**: A genuine performance regression could land on `main` without CI stopping it. Only a human reviewing that job's result would catch it.

**Why it exists**: These tests assert generous regression-alarm thresholds against a real Postgres/Valkey, so timing is inherently noisier than a correctness test on shared/loaded runners: a slow CI runner or concurrent load can trip a timing assertion with no actual code regression behind it (observed directly during this repo's own manual test runs).

**Possible fix**: Tighten the thresholds and/or the runner environment until false positives are rare enough to make the job blocking, or move to a dedicated, less noisy performance-testing environment instead of sharing CI's general-purpose runners.

**Priority**: Low. Correctness is still enforced elsewhere through blocking unit, integration, and security suites. This only affects how fast a real performance regression would be noticed.

## Operations and scale

---

### The ngrok tunnel image embeds vulnerable Go modules

**Description**: The `local-prod-ngrok` tunnel image ships ngrok's own statically linked agent binary, which embeds six High-severity Go-module advisories that only ngrok can fix by publishing a rebuilt agent. CI scans every image with Trivy (High and Critical, fixed issues only); the ngrok image alone uses the time-boxed exceptions in `ci/mystic_auth/trivy-ngrok.ignore.yaml`, and each exception expires on its listed date so the gap cannot be forgotten.

**Impact**: Only the optional local-prod ngrok tunnel is affected. The backend, frontend, backup, Cloudflare and Tailscale images keep the full gate, and the ngrok container has no access to secrets beyond its own auth token.

**Why it exists**: The project cannot patch modules inside a vendor-built binary.

**Possible fix**: Bump the pinned ngrok image as soon as ngrok publishes a rebuilt agent, then delete the exceptions file entry by entry.

**Priority**: Low.

### Horizontal scaling is documented but not a maintained deployment

**Description**: Production-shaped Compose files are designed for one host.
Worker sizing uses the host's available cores. The deployment docs
document the multi-host path in [Running multiple backend containers](../deployment/scaling.md#2-running-multiple-backend-containers):
shared Postgres and Valkey, one migration runner, cookie-based sessions with
no sticky-session requirement, and a load balancer using `/health/ready`.
There is still no maintained provider-specific deployment or working
multi-host Compose example.

**Impact**: A service that outgrows one VPS needs an architecture decision for
shared Postgres, Valkey, worker concurrency, migrations, sticky-free sessions,
health checks, and deployment coordination.

**Possible fix**: Validate the documented topology in a downstream deployment
or a separate reference deployment rather than assuming one provider in the
template.

**Priority**: Low for the template; high only when one host is approaching its
capacity limit.

---
