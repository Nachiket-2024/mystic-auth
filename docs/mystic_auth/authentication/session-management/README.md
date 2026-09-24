# Session Management

---

*New to a term here? See the [Authentication & Sessions Glossary](../../glossary/authentication.md).*

This doc covers the Manage Sessions feature across backend, frontend, database, and tests. It is split out of the main authentication overview so that login, refresh, and logout remain readable while the session-display edge cases stay documented in one place.

---

## Feature map

| Layer | Files | Responsibility |
|---|---|---|
| Routes | `backend/mystic_auth/api/auth_routes/auth_routes.py` | Mounts `GET /auth/sessions` and `DELETE /auth/sessions/{session_id}` under the auth router |
| Handlers | `backend/mystic_auth/auth/manage_sessions/` | Builds response rows, computes `is_current`, rejects self-revoke, maps missing/foreign/revoked sessions to `404` |
| Persistence mirror | `backend/mystic_auth/user_session/` | Stores one row per visible login session, updates the row when refresh tokens rotate, marks rows revoked |
| Geolocation | `backend/mystic_auth/user_session/session_geolocation.py` | Best-effort city/country lookup for a login IP, via a local MaxMind GeoLite2-City `.mmdb` file |
| Token authority | `backend/mystic_auth/auth/token_logic/jwt_service.py` and `auth/refresh_token_logic/refresh_token_service.py` | Valkey-backed version counters (`account_ver`, `chain_ver`), single-use rotation claim, reuse detection |
| Frontend | `frontend/src/mystic_auth/active_sessions/` | Shared card that lists sessions, formats device metadata, and revokes another active session |
| Real-time push | `backend/mystic_auth/user_session/session_events.py`, `GET /auth/session-events`, `frontend/src/mystic_auth/auth/session_lifecycle/useSessionEventsStream.ts` | Server-Sent Events + Valkey Pub/Sub nudge every open tab/device the instant a session is revoked or a new one is created. See [Real-Time Push](real-time-push.md) |
| Tests | `tests/backend/mystic_auth/integration/user_session/test_manage_sessions_integration.py` and matching unit suites | End-to-end and handler/service coverage for list, revoke, self-revoke, foreign session, logout, logout-all, and rotation behavior |

---

## Source of truth

Token validity is version-based, not identity-based. Every access and refresh token embeds two numbers at mint time:

1. `account_ver`: the whole account's version. Bumping it (`jwt_service.bump_account_version`, one Valkey `INCR`) invalidates every token on the account immediately, with no per-token iteration.
2. `chain_ver`, scoped to the token's `chain` claim. The `chain` value is a random id minted once at login and carried forward unchanged across every rotation of that login. Bumping it (`jwt_service.bump_chain_version`) ends exactly that one session and leaves every other session on the account untouched.

The actual Valkey reads/writes (`account_ver:{email}` and `chain_ver:{email}:{chain_id}` keys) live in `auth/token_logic/token_version_store.py`'s `TokenVersionStore`, not in `jwt_service.py` itself. `jwt_service` imports it and re-exposes `get_account_version`/`get_chain_version`/`bump_account_version`/`bump_chain_version` as its own attributes, so every caller above (and everywhere else in this doc) goes through `jwt_service`, never `token_version_store` directly. `chain_ver` keys carry a TTL matching `REFRESH_TOKEN_EXPIRE_MINUTES`; `account_ver` never expires.

---

### Read vs. bump failure modes

Reads and bumps fail differently on a Valkey outage, deliberately:

- A **read** (`get_account_version`/`get_chain_version`) swallows the error and returns `0`, a version any real token will already exceed, so an outage fails open on the read side rather than locking every session out.
- A **bump** (`bump_account_version`/`bump_chain_version`) instead returns `False` rather than swallowing the failure: a bump that couldn't be confirmed hasn't actually revoked anything, so callers (`refresh_token_service`, `session_service`) raise `TokenVersionUnavailableError` and let each caller's own route handler decide what that means for its response, instead of quietly reporting success for a revoke that never happened. See [Bump failure handling](token-lifecycle.md#bump-failure-handling).

`verify_token` rejects a token the instant either embedded number falls behind Valkey's current value. There is no registry of live tokens to maintain, prune, or iterate: a revoke is always a single `INCR`, regardless of how many devices are logged in.

---

### Rotation is a separate, narrower concern

Refresh-token rotation is additionally single-use, orthogonal to versioning: `jwt_service.claim_jti_for_rotation` uses an atomic `SET...NX` per `jti` so the exact same refresh token can never be redeemed twice (a real replay, or two concurrent requests racing the same token), whether or not its version is still current.

---

### The `user_sessions` mirror

The `user_sessions` table is a best-effort mirror for user experience, independent of the Valkey versions that actually govern validity:

1. `id` is the stable identifier returned to the frontend and used for targeted revoke.
2. `current_jti` points at the refresh token that currently represents that session; `chain_id` is the stable identity across every rotation of it (what a targeted revoke actually bumps in Valkey, and what `is_current`/self-revoke comparisons use, since a row's `current_jti` can be momentarily stale mid-rotation while `chain_id` never changes).
3. `created_at` is the first login time for that session.
4. `last_used_at` is updated when the session is created or its refresh token rotates.
5. `expires_at` mirrors the current refresh token expiry, for display only.
6. `revoked_at` marks the row as ended. Rows are not deleted during normal revoke, so session history remains inspectable in the database.
7. `ip_address` and `user_agent` are display metadata only. They may be null because some tests and service calls do not have a live request object.
8. `city` and `country` are a best-effort geolocation of `ip_address` at the time the row was created (`session_geolocation.resolve_city_country`), resolved against a local MaxMind GeoLite2-City `.mmdb` file. Both are `None` whenever `GEOIP_DB_PATH` is unset, the database fails to open, the IP is missing/private/unresolvable, or the lookup itself fails; every one of those cases fails open silently (logged at most once, at `error` for a bad `GEOIP_DB_PATH` and `warning` per failed lookup), never blocking login or refresh. The MaxMind `.mmdb` file itself is never shipped in this repo (MaxMind's license forbids redistribution); a deployment that wants geolocation needs its own free MaxMind account and license key to download one.

If a `user_sessions` write fails, auth still succeeds or fails based on the real Valkey version checks. The service intentionally logs the failure and keeps the auth flow moving, matching the same design used for audit logging.

---

## Lifecycle

1. Password login and OAuth2 login mint a fresh `chain_id` and issue an access token and refresh token embedding it, plus the account's current `account_ver`/`chain_ver`.
2. The login service records a `user_sessions` row using the new refresh-token `jti`, `chain_id`, expiry, IP address, and user agent.
3. `POST /auth/refresh/` first checks that the presented token's own version is still current (`jwt_service.is_current_version`). A stale token already invalidated by a revoke elsewhere is rejected as invalid, not treated as reuse. It then claims the `jti` as single-use and rotates successfully by issuing a new pair carrying the same `chain_id`, then updating `current_jti`, `last_used_at`, and `expires_at` on the existing row.
4. A `jti` found already claimed is first checked against a short grace window (`REFRESH_TOKEN_REUSE_GRACE_SECONDS`, default 10, `0` disables). If the first use was within that window and came from the same client IP, it is a benign duplicate (two tabs, or a response lost to a reload): the caller gets a fresh pair on the same chain and nothing is revoked. Anything else is reuse.
5. Refresh-token reuse, where the claim step above finds a `jti` already claimed outside that window (or from a different IP), revokes only the compromised rotation chain (`chain_ver`). It does not revoke every session on the account. See [Rotation chains and reuse detection](token-lifecycle.md#rotation-chains-and-reuse-detection).
5. `POST /auth/logout` bumps that one session's `chain_ver` and marks the matching session row revoked (`session_service.revoke_session_on_logout`). It is functionally the same operation as a targeted Manage Sessions revoke, triggered by the device ending its own session.
6. `POST /auth/logout/all`, password reset confirm, password changes, account soft delete, and account purge all bump `account_ver` through `refresh_token_service.revoke_all_tokens_for_user`. One `INCR` ends every session on the account at once.

---

## Pages

- [Rotation and Bump Failure Handling](token-lifecycle.md): reuse detection, and how each endpoint responds when a Valkey bump can't be confirmed.
- [Real-Time Push](real-time-push.md): how another open tab learns about a revoke, a new login, or a permissions change.
- [List and Revoke API](list-and-revoke-sessions.md): `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, and the active session count on `/auth/me`.
- [Frontend and Production Checks](frontend-and-checks.md): the Manage Sessions card, and test coverage.

---
