# Infrastructure Coverage: Database, Logging, Health, Settings, Scripts

---

## Database and Redis singletons

1. **The shared async database engine is checked to:**
   - Be configured from the settings-provided database URL.
   - Have connection pre-ping enabled by default (so a stale pooled connection is detected and replaced rather than used and failing mid-request).
   - Recycle connections before common idle timeouts.
2. The session factory is checked to disable `expire_on_commit` (needed for how the app accesses ORM objects after commit) and to be bound to its own engine.
3. A separate constructor path is checked to accept an arbitrary database URL independent of the shared singleton, used for the dedicated test database setup described in [Testing Overview](../overview.md#dedicated-test-database).
4. The Redis client singleton is checked to be a real `Redis` instance configured from the settings-provided Redis URL, with `decode_responses` enabled so callers get plain strings back rather than bytes.

---

## Logging and middleware

1. **The correlation-id middleware is checked to:**
   - Generate a fresh request id when the caller supplies none, and echo back an upstream-supplied id unchanged.
   - Reject a malformed or oversized upstream id and generate a fresh one instead of trusting arbitrary caller input.
   - Reset its context variable back to the default outside of an active request so one request's id can never leak into another's logs.
2. **Logger configuration is checked across its different profiles:**
   - A routine info-level log reaches only the file handler, not the terminal, while a startup-phase logger's info-level output does reach the terminal and has no file handler at all.
   - The console formatter is plain text in development and structured JSON in production (checked case-insensitively against the environment name), while the file handler stays JSON even in development, so log files are always machine-parseable regardless of environment.
   - A worker-process logger is checked to write to both the terminal and the file handler.
   - The access-log file handler is checked to have a bounded retention window rather than growing without limit.
3. **Security response headers (CSP, HSTS, and related hardening headers) are checked to:**
   - Be present on every response, including error responses, not just successful ones.
   - HSTS is present in production and absent outside it.
   - The interactive docs and redoc pages get a relaxed CSP that allows their own CDN assets, and this relaxation is checked not to leak into the CSP used by ordinary application routes.
   - CORS preflight is checked to allow only the configured frontend origin and reject an untrusted one.

---

## Health checks

1. The basic health endpoint is checked to return ok with no dependency checks performed.
2. The readiness endpoint is checked to return 200 when both the database and Redis are reachable, and 503 when either one individually is down, so a load balancer or orchestrator can distinguish "the process is alive" from "the process can actually serve traffic."

---

## Settings

1. Application settings are checked to construct successfully with only the explicitly declared fields, fail to construct if any required field is missing, and ignore environment variables that are not declared fields rather than silently accepting typos as new settings.
2. **The computed CORS allowed-origins list is checked to:**
   - Include just the frontend base URL when no additional origins are configured.
   - Include additional configured origins in order.
   - Ignore blank entries and stray whitespace, and deduplicate a repeated origin.
3. The default app-policy-names setting is checked to parse, deduplicate, and trim a comma-separated value, and to be empty when unset.

---

## Template scripts

1. **The `create_system_user` script is checked against its several account states:**
   - Creating a brand-new system user.
   - Promoting an existing password account only when the promotion is explicitly confirmed, declining the promotion when not confirmed.
   - Stopping if a required baseline policy is missing.
   - Deleting-and-recreating a Google-only account only when confirmed (declining otherwise).
2. **The `create_rbac_policies` script is checked to:**
   - Normalize a role name into a consistent policy name.
   - Create an unconditioned policy for a new role, defaulting the resource type to a wildcard when left blank.
   - Skip without making changes when the policy already exists.
   - Abort cleanly on an empty role name or empty actions list.

---

## Performance checks (informational, non-blocking)

1. A small set of timing-oriented tests, run as informational checks rather than hard gates (see [Testing Overview](../overview.md)), sanity-check that concurrent logins, filtered audit log queries against many rows, and authorization checks against a large number of background users or a user holding many policies, all complete within a reasonable bound.
2. These exist to catch an obvious algorithmic regression (an accidental N+1 query or an unindexed scan), not to enforce strict latency numbers on shared, variable-speed CI runners.

---

See [Infrastructure Coverage](README.md) for the rest, or [Testing Overview](../overview.md) for how to run the suite.

---
