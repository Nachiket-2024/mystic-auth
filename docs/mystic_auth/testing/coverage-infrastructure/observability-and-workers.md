# Infrastructure Coverage: Audit Log, Rate Limits, Error Monitoring, Email, Workers

---

## Audit log

1. The audit log is checked to record itself automatically off real request traffic, not just off explicit test writes: a successful protected action is logged as allowed, a denied one is logged as denied, and an inspection endpoint used for the "why would this be denied" debug view does not pollute the log with entries of its own.
2. **Querying the log is checked for:**
   - Permission boundaries (unauthenticated and regular-user callers cannot query the global log, only the caller's own entries via the `/me` route).
   - Search and sort behavior (searching and sorting by user email), and filtering by action and allowed/denied status.
   - Pagination edge cases: an offset past the end of the results returns an empty list rather than an error, an unrecognized sort column falls back instead of raising, a limit above the documented maximum is rejected while the maximum itself is accepted, and a negative offset is rejected.
3. **A separate security-focused audit log** (distinct from the authorization decision log) records account-level security events: signup, login success and failure, logout, and policy assignment/revocation each write an entry.
   - This log has its own permission boundary (a regular user can read their own entries but not the global log) and its own search/sort/filter coverage.
   - The event-logging layer itself is checked to never raise if the underlying repository write fails, redacts metadata keys that look sensitive (like a key containing "password" or "token") before persisting them, and handles being called with no request context or no metadata at all without crashing.

See [coverage-authorization/README.md](../coverage-authorization/README.md) for how authorization decisions specifically get queued into this system.

---

## Rate limit dashboard

1. The admin-facing rate-limit dashboard (list active limiters, reset a limiter) is checked against permission boundaries first: unauthenticated and regular-user callers cannot list or reset, and read/reset are split into their own separate permissions so a caller with only one of the two cannot perform the other.
2. **Listing is checked to:**
   - Correctly parse both IP-scoped and account-scoped Redis keys back into readable rows.
   - Walk multiple Redis `SCAN` batches until the cursor reaches zero rather than stopping early.
   - Truncate the result at a configured maximum scanned-key count so an attacker cannot force an unbounded scan.
   - Filter by scope and endpoint (including an email containing an `@` sign as part of an account-scoped identifier).
   - Skip a key that does not parse into a recognizable shape rather than crashing the whole listing, and return an empty result rather than raising if Redis itself errors.
   - Return an empty page rather than an error when an endpoint filter matches nothing.
3. **Resetting a limiter:**
   - Deletes exactly the targeted key, whether IP- or account-scoped.
   - Ignores an attempted reset of a key outside the rate limiter's own keyspace (so the reset endpoint cannot be used to delete arbitrary Redis keys).
   - Is idempotent when the key is already absent.
   - A concurrency test fires two simultaneous resets of the same key and checks both resolve successfully rather than one erroring.

---

## Error monitoring

1. The optional Sentry-compatible error monitoring integration is checked to be a genuine no-op when no DSN is configured (so it stays fully optional for a downstream deployment that doesn't want it), and to initialize correctly when one is set, falling back to a default environment name if none is explicitly configured.
2. A malformed DSN is handled by logging a warning rather than crashing app startup.
3. Reported exceptions are checked to attach the calling user's email when a valid access token cookie is present, and to omit user context cleanly when there is no cookie or the token fails to verify.
4. **A related "late DSN" mechanism** (for environments like Bugsink where the DSN file may not exist yet at startup) is checked to:
   - Pick up the DSN once the file appears.
   - Remain a no-op if the DSN was already set at startup.
   - Give up after a timeout if the file never appears.
   - Return safely without crashing if the file's contents are malformed.
5. The global FastAPI exception handler is checked to report an unhandled exception to error monitoring and still return a generic 500 to the caller rather than leaking internal details.

See [Error Monitoring](../../error-monitoring/overview.md).

---

## Email sending and templates

1. The email sender is checked to build outgoing messages with the correct headers derived from settings (falling back to the from-address when a distinct support-email is not configured), default to HTML content, and support a plain-text alternative when explicitly requested.
2. Template rendering is checked to include every value the caller supplies, pull the app name and support email from settings, and produce a well-formed HTML document.
3. Email normalization (lowercasing and trimming) is checked directly, including that it is idempotent (normalizing an already-normal address is a no-op).

---

## Background workers (Procrastinate tasks)

1. Email sending and audit log writes both run as background tasks with their own retry strategy, tested independently: the send task returns true on success, logs and re-raises on failure (so Procrastinate's own retry machinery sees the failure).
2. **The configured retry strategy is checked for its actual behavior:**
   - Up to three total attempts.
   - Exponential backoff with jitter, a delay capped at a maximum.
   - The audit log retry strategy is deliberately faster than the email retry strategy (audit writes are more time-sensitive to the caller than email delivery).
3. The audit log task is checked to write its entry using a fresh database session rather than reusing one from the request that queued it.
4. **The scheduled account-purge task is checked to:**
   - Run on a daily cron schedule.
   - Purge every account the deletion query returns as past its grace period.
   - Return zero cleanly when nothing is due.
   - Skip (not abort the whole run for) a single account whose session revocation cannot be confirmed.

See [coverage-users-and-sessions.md](../coverage-users-and-sessions.md) for the purge behavior itself, and [Procrastinate](../../background-workers/procrastinate.md) for how the worker system fits together.

---

See [Infrastructure Coverage](README.md) for the rest, or [Testing Overview](../overview.md) for how to run the suite.

---
