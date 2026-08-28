# What the Infrastructure Tests Cover
---

This page walks through what the test suite checks for the audit log
system, rate limit dashboard, error monitoring, database and Redis
singletons, email sending, background workers, logging, middleware, health
checks, and settings. See [Testing Overview](overview.md) for how to run
the suite.

---

## Audit log

The audit log is checked to record itself automatically off real request
traffic, not just off explicit test writes: a successful protected action
is logged as allowed, a denied one is logged as denied, and an inspection
endpoint used for the "why would this be denied" debug view does not
pollute the log with entries of its own.

Querying the log is checked for permission boundaries (unauthenticated and
regular-user callers cannot query the global log, only the caller's own
entries via the `/me` route), search and sort behavior (searching and
sorting by user email), and filtering by action and allowed/denied status.
Pagination edge cases are covered directly: an offset past the end of the
results returns an empty list rather than an error, an unrecognized sort
column falls back instead of raising, a limit above the documented maximum
is rejected while the maximum itself is accepted, and a negative offset is
rejected.

A separate security-focused audit log (distinct from the authorization
decision log) records account-level security events: signup, login success
and failure, logout, and policy assignment/revocation each write an entry.
This log has its own permission boundary (a regular user can read their own
entries but not the global log) and its own search/sort/filter coverage.
The event-logging layer itself is checked to never raise if the underlying
repository write fails, redacts metadata keys that look sensitive (like a
key containing "password" or "token") before persisting them, and handles
being called with no request context or no metadata at all without
crashing.

See [coverage-authorization.md](coverage-authorization.md) for how
authorization decisions specifically get queued into this system.

---
## Rate limit dashboard

The admin-facing rate-limit dashboard (list active limiters, reset a
limiter) is checked against permission boundaries first: unauthenticated
and regular-user callers cannot list or reset, and read/reset are split
into their own separate permissions so a caller with only one of the two
cannot perform the other.

Listing is checked to correctly parse both IP-scoped and account-scoped
Redis keys back into readable rows, walk multiple Redis `SCAN` batches
until the cursor reaches zero rather than stopping early, truncate the
result at a configured maximum scanned-key count so an attacker cannot
force an unbounded scan, filter by scope and endpoint (including an email
containing an `@` sign as part of an account-scoped identifier), skip a key
that does not parse into a recognizable shape rather than crashing the
whole listing, and return an empty result rather than raising if Redis
itself errors. An endpoint filter matching nothing returns an empty page
rather than an error.

Resetting a limiter deletes exactly the targeted key, whether IP- or
account-scoped, and ignores an attempted reset of a key outside the rate
limiter's own keyspace (so the reset endpoint cannot be used to delete
arbitrary Redis keys). Resetting an already-absent key is idempotent, and a
concurrency test fires two simultaneous resets of the same key and checks
both resolve successfully rather than one erroring.

---
## Error monitoring

The optional Sentry-compatible error monitoring integration is checked to
be a genuine no-op when no DSN is configured (so it stays fully optional
for a downstream deployment that doesn't want it), and to initialize
correctly when one is set, falling back to a default environment name if
none is explicitly configured. A malformed DSN is handled by logging a
warning rather than crashing app startup. Reported exceptions are checked
to attach the calling user's email when a valid access token cookie is
present, and to omit user context cleanly when there is no cookie or the
token fails to verify.

A related "late DSN" mechanism (for environments like Bugsink where the DSN
file may not exist yet at startup) is checked to pick up the DSN once the
file appears, remain a no-op if the DSN was already set at startup, give up
after a timeout if the file never appears, and return safely without
crashing if the file's contents are malformed.

The global FastAPI exception handler is checked to report an unhandled
exception to error monitoring and still return a generic 500 to the caller
rather than leaking internal details.

See [Error Monitoring](../error-monitoring/overview.md).

---
## Database and Redis singletons

The shared async database engine is checked to be configured from the
settings-provided database URL, have connection pre-ping enabled by
default (so a stale pooled connection is detected and replaced rather than
used and failing mid-request), and recycle connections before common idle
timeouts. The session factory is checked to disable `expire_on_commit`
(needed for how the app accesses ORM objects after commit) and to be bound
to its own engine. A separate constructor path is checked to accept an
arbitrary database URL independent of the shared singleton, used for the
dedicated test database setup described in
[Testing Overview](overview.md#dedicated-test-database).

The Redis client singleton is checked to be a real `Redis` instance
configured from the settings-provided Redis URL, with `decode_responses`
enabled so callers get plain strings back rather than bytes.

---
## Email sending and templates

The email sender is checked to build outgoing messages with the correct
headers derived from settings (falling back to the from-address when a
distinct support-email is not configured), default to HTML content, and
support a plain-text alternative when explicitly requested. Template
rendering is checked to include every value the caller supplies, pull the
app name and support email from settings, and produce a well-formed HTML
document. Email normalization (lowercasing and trimming) is checked
directly, including that it is idempotent (normalizing an already-normal
address is a no-op).

---
## Background workers (Procrastinate tasks)

Email sending and audit log writes both run as background tasks with their
own retry strategy, tested independently: the send task returns true on
success, logs and re-raises on failure (so Procrastinate's own retry
machinery sees the failure), and the configured retry strategy is checked
for its actual behavior, up to three total attempts, exponential backoff
with jitter, a delay capped at a maximum, and that the audit log retry
strategy is deliberately faster than the email retry strategy (audit
writes are more time-sensitive to the caller than email delivery). The
audit log task is checked to write its entry using a fresh database
session rather than reusing one from the request that queued it.

The scheduled account-purge task is checked to run on a daily cron
schedule, purge every account the deletion query returns as past its grace
period, return zero cleanly when nothing is due, and skip (not abort the
whole run for) a single account whose session revocation cannot be
confirmed. See
[coverage-users-and-sessions.md](coverage-users-and-sessions.md) for the
purge behavior itself, and
[Procrastinate](../background-workers/procrastinate.md) for how the worker
system fits together.

---
## Logging and middleware

The correlation-id middleware is checked to generate a fresh request id
when the caller supplies none, echo back an upstream-supplied id
unchanged, reject a malformed or oversized upstream id and generate a
fresh one instead of trusting arbitrary caller input, and reset its
context variable back to the default outside of an active request so one
request's id can never leak into another's logs.

Logger configuration is checked across its different profiles: a routine
info-level log reaches only the file handler, not the terminal, while a
startup-phase logger's info-level output does reach the terminal and has
no file handler at all. The console formatter is plain text in development
and structured JSON in production (checked case-insensitively against the
environment name), while the file handler stays JSON even in development,
so log files are always machine-parseable regardless of environment. A
worker-process logger is checked to write to both the terminal and the
file handler. The access-log file handler is checked to have a bounded
retention window rather than growing without limit.

Security response headers (CSP, HSTS, and related hardening headers) are
checked to be present on every response, including error responses, not
just successful ones. HSTS is present in production and absent outside it.
The interactive docs and redoc pages get a relaxed CSP that allows their
own CDN assets, and this relaxation is checked not to leak into the CSP
used by ordinary application routes. CORS preflight is checked to allow
only the configured frontend origin and reject an untrusted one.

---
## Health checks

The basic health endpoint is checked to return ok with no dependency
checks performed. The readiness endpoint is checked to return 200 when
both the database and Redis are reachable, and 503 when either one
individually is down, so a load balancer or orchestrator can distinguish
"the process is alive" from "the process can actually serve traffic."

---
## Settings

Application settings are checked to construct successfully with only the
explicitly declared fields, fail to construct if any required field is
missing, and ignore environment variables that are not declared fields
rather than silently accepting typos as new settings. The computed CORS
allowed-origins list is checked to include just the frontend base URL when
no additional origins are configured, include additional configured
origins in order, ignore blank entries and stray whitespace, and
deduplicate a repeated origin. The default app-policy-names setting is
checked to parse, deduplicate, and trim a comma-separated value, and to be
empty when unset.

---
## Template scripts

The `create_system_user` script is checked against its several account
states: creating a brand-new system user, promoting an existing password
account only when the promotion is explicitly confirmed, declining the
promotion when not confirmed, stopping if a required baseline policy is
missing, and deleting-and-recreating a Google-only account only when
confirmed (declining otherwise). The `create_rbac_policies` script is
checked to normalize a role name into a consistent policy name, create an
unconditioned policy for a new role, default the resource type to a
wildcard when left blank, skip without making changes when the policy
already exists, and abort cleanly on an empty role name or empty actions
list.

---
## Performance checks (informational, non-blocking)

A small set of timing-oriented tests, run as informational checks rather
than hard gates (see [Testing Overview](overview.md)), sanity-check that
concurrent logins, filtered audit log queries against many rows, and
authorization checks against a large number of background users or a user
holding many policies, all complete within a reasonable bound. These exist
to catch an obvious algorithmic regression (an accidental N+1 query or an
unindexed scan), not to enforce strict latency numbers on shared,
variable-speed CI runners.

---