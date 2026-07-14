# Security Decisions

A decision log — the *why* behind non-obvious security choices in this codebase, gathered in one place instead of scattered across code comments. Each entry links to where the actual implementation lives.

## Role is never used to decide access

PBAC (policy-based access control), not RBAC. `users.role` is nullable, display/grouping metadata only — every real authorization decision goes through an assigned, active `Policy` (see [../authorization/architecture.md](../authorization/architecture.md)). Two accounts with the identical role can have completely different effective permissions, and a roleless account (`role=NULL`) can still be fully authorized via policies alone.

**Why not RBAC**: a static role → permission mapping means every new access pattern either overloads an existing role's meaning or requires a new role (and a code deploy) to express. Policies are data, not code — a new access pattern is a new policy row, assignable/revocable per-account without touching role definitions at all. The tradeoff is real: PBAC is more moving parts to reason about than "if role == admin." The `Permission` enum (`backend/app/authorization/permissions.py`) still gives the action vocabulary the same fixed-set discipline a role enum would.

**Where this is enforced structurally, not just by convention**: every admin route in `user_routes.py` depends on `require_authorization(action, resource_type)`, never a role comparison. The handful of `role ==` checks that do exist (e.g. "the system account cannot be modified via these generic endpoints") are resource-protection invariants — they protect one specific reserved account from *every* caller regardless of what that caller is otherwise authorized to do — not authorization decisions. See the `UserRole` import comment at the top of `user_routes.py` for the exact reasoning, repeated at each guard site.

## Why current-user lookups re-query the database every time

`current_user_handler.get_current_user` (called on every authenticated request) decodes the JWT *and* re-fetches the user row from Postgres, rather than trusting the token's claims alone. This is the mechanism that makes account deactivation/soft-delete take effect on the very next request, instead of only once the access token's own (up-to-one-hour) `exp` is reached. The cost is one extra DB round-trip per request; the alternative (trust the token until it expires) would mean a just-deleted or just-deactivated account could keep acting on the system for up to the full access-token lifetime.

## Timing-attack mitigations

Applied consistently across every enumeration-sensitive endpoint:

- **Login** (`login_service.py`): the Argon2 password comparison always runs — against the real hash, or a fixed `DUMMY_HASH` if the account doesn't exist or has no password — *before* any existence/verification/active check. "Wrong password," "no such account," and "OAuth2-only account with no password" are all indistinguishable by response time.
- **Signup** (`signup_service.py`): the password is hashed unconditionally before the duplicate-email check, so a registered vs. unregistered email can't be distinguished by how fast the response comes back (only by the identical generic response body).
- **Password reset request**: always returns the same generic "if this email is registered..." message.

## Token replay and reuse detection

Refresh tokens are single-use — revoked (by `jti`, in Redis) immediately upon successful rotation. If a token whose `jti` is already revoked is presented again, the system treats the entire session as potentially compromised (not just that one token): **every** refresh token currently active for that user is revoked, forcing re-authentication on every device, logged at `critical` severity. See [../authentication/overview.md](../authentication/overview.md#refresh-token-rotation). This is deliberately more aggressive than "just reject the reused token" — a reuse is either a client retry bug or actual token theft, and the two are indistinguishable from the server's side, so the response has to assume the worse case.

## OAuth2 CSRF and account-hijacking protections

- **State + PKCE**: a random `state` (Redis + cookie, validated on callback, single-use via atomic `GETDEL`) plus PKCE (S256) — exceeds the minimum CSRF protection a plain OAuth2 `state` parameter alone would provide.
- **`verified_email` is load-bearing**: an OAuth2 login is only trusted if Google's own `verified_email` flag is true. This is the *only* proof of address ownership the flow relies on.
- **Pre-registration hijack window**: if an attacker signs up with a victim's email (password-based, unverified) before the victim ever does, and the victim later authenticates via Google with that same address, the pre-existing account's password is cleared at that moment. Without this, the attacker's chosen password would remain valid on an account Google has now confirmed belongs to someone else. See [../authentication/overview.md](../authentication/overview.md#google-oauth2) for the full walkthrough.
- **Redirect URI is server-side fixed**, never client-influenced — rules out open-redirect-via-OAuth.

## The signup/OAuth2 email race

`user_crud.get_by_email` (existence check) and `user_crud.create` are not wrapped in a single atomic transaction in either `signup_service.py` or `oauth2_service.py` — a genuine TOCTOU race between two concurrent requests for the same brand-new email is theoretically possible at the application level. This is closed at the database level instead: `users.email` carries a **unique constraint**, so the loser of the race gets an `IntegrityError`. Both call sites already wrap their entire body in a broad `except Exception` that logs and returns a clean failure (`False`/`None` → the handler's standard generic error response) rather than propagating a raw 500 — so the practical outcome of the race is "one request succeeds, the other gets an ordinary-looking failure," not a duplicate account or an ugly stack trace to the client.

## Account lifecycle: soft delete by default

Deleting an account defaults to reversible (soft delete: `is_active=False` + `deleted_at` set, row and all FK-referencing audit/policy rows intact) rather than immediate permanent removal. Permanent removal (`purge`) is a separate endpoint gated by its own, more sensitive permission (`users:purge`, granted only by `system_superuser`) — an admin who can delete accounts day-to-day cannot, by that permission alone, irreversibly destroy one. See [../database/design.md](../database/design.md#account-lifecycle) for the full mechanics, including why session invalidation is done explicitly (`revoke_all_tokens_for_user`) rather than relying on the refresh endpoint to notice on its own.

## Rate limiting and lockout are layered, not singular

Login has **both** a generic sliding-window rate limiter (per-IP and per-account) and a separate, purpose-built brute-force lockout service with its own thresholds (`MAX_FAILED_LOGIN_ATTEMPTS` / `MAX_FAILED_LOGIN_ATTEMPTS_PER_IP`). The two serve different purposes: the rate limiter caps *request volume* generically (also applied to refresh, password-reset-request); the lockout service specifically tracks *failed authentication attempts* and can lock an account/IP out even if each individual request was well within the rate limit. See [../authentication/overview.md](../authentication/overview.md#login).

## Known accepted gaps / follow-ups

Recorded here rather than silently left unaddressed, so they're a deliberate backlog, not an oversight:

- ~~**Forwarded-header trust**~~ — **resolved.** `core/client_ip.py::get_client_ip` only trusts `X-Forwarded-For` when the literal TCP peer is listed in `TRUSTED_PROXY_IPS` (`.env`, empty/untrusted by default); every rate-limit, lockout, audit-log, and PBAC context call site (`auth_routes.py`, `rate_limiter_service.py`, `refresh_token_handler.py`, `request_context_builder.py`, `audit_log_service.py`) goes through it. Deploying behind a reverse proxy now only requires setting `TRUSTED_PROXY_IPS` to that proxy's address — no code change needed.
- **Redis has no password** (`requirepass` unset). Low actual risk today since the port isn't published in `docker-compose.prod.yml` (internal network only), but Redis holds rate-limit/lockout state and refresh-token jtis — worth a password anyway as defense-in-depth.
- ~~**`SECRET_KEY` strength is not enforced at startup**~~ — **resolved.** `core/settings.py` now rejects any `SECRET_KEY` under 32 characters at import time (`Settings._secret_key_minimum_strength`) — a placeholder/example value fails fast instead of silently signing tokens with weak entropy. This is a length floor, not a real entropy check (a 32-character low-entropy string still passes) — still worth strengthening if this ever needs to resist a targeted attack.
- **No automated database backups** — [Deployment Guide](../deployment/guide.md) documents a manual `pg_dump` runbook only; no scheduled job exists in this repo since no specific production host/target is assumed.
