# Security Decisions: Product

See [Security Decisions](decisions.md) for the full index, including auth/session and infrastructure
decisions. This page covers the *why* behind product-level scope decisions: account lifecycle, MFA,
deferred features, and known gaps.

---

## Account lifecycle: soft delete by default

Deleting an account defaults to reversible (soft delete: `is_active=False` + `deleted_at` set, row and all FK-referencing audit/policy rows intact) rather than immediate permanent removal. Permanent removal (`purge`) is a separate endpoint gated by its own, more sensitive permission (`users:purge`, granted only by `system_superuser`): an admin who can delete accounts day-to-day cannot, by that permission alone, irreversibly destroy one. See [../database/design.md](../database/design.md#account-lifecycle) for the full mechanics, including why session invalidation is done explicitly (`revoke_all_tokens_for_user`) rather than relying on the refresh endpoint to notice on its own.

Self-service deletion (`DELETE /users/me`, `user_self_service_routes.py::delete_my_account`) reuses this same soft-delete path, never purge: the row is soft-deleted and sessions are revoked exactly like `delete_any_user` minus the path-parameterized target and the "not your own account" guard, which doesn't apply here since acting on your own account is the entire point. It writes a distinct audit event (`account_deleted_self`, vs. admin-initiated `account_deleted`) so the security audit log can tell the two apart at a glance. A soft-deleted account (self- or admin-initiated) is not held forever: a daily Procrastinate periodic task (`procrastinate_tasks/account_purge_tasks.py::purge_expired_soft_deleted_accounts`, `@app.periodic(cron="0 3 * * *")`, running inside the worker process itself via Procrastinate's own `PeriodicDeferrer`, so there's no separate scheduler process for this to depend on) hard-purges any account whose `deleted_at` is older than `ACCOUNT_PURGE_GRACE_DAYS` (default 30), going through the exact same revoke → audit → delete sequence as a manual purge (`user_lifecycle/user_purge_service.py::purge_user_account`, shared by both call sites) so the grace-period purge and an admin's manual purge can never drift apart. This is what gives self-service deletion an actual recovery window instead of either purging synchronously (no recovery at all) or never purging (an unbounded pile of soft-deleted rows).

Both the soft-delete step and the actual re-authentication proving intent differ by account type, though, and deliberately so:

- **An account with a password** re-authenticates and is deleted synchronously, in the same request: the caller supplies their current password (the same `password_service.verify_password` call the self-service password-change flow uses), and on success `delete_my_account` runs the soft-delete → revoke-sessions → audit sequence immediately, then clears the `access_token`/`refresh_token` cookies on its `Response` before returning (the same cookie shape `logout_handler.py` uses, including `refresh_token`'s `path="/auth"`): a gap the endpoint had before this cookie-clearing was added, unlike every other session-ending endpoint.
- **An OAuth-only account** (`hashed_password is None`) has no password to re-confirm with, so an active session cookie alone would otherwise be sufficient proof: a stolen access-token cookie (e.g. via XSS) could delete the account outright with nothing else required. Rather than skip re-authentication for this case, `account_deletion_service.py` gives it an async, email-confirmed equivalent, modeled directly on `auth/password_logic/password_reset_service.py`: a signed JWT (`type` claim `"account_delete"`, scoping it away from access/refresh/reset tokens sharing the same `SECRET_KEY`) is minted, persisted in Redis under `account_delete:{token}` with a TTL from `ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES` (default 60), and emailed as a link to the frontend's `/confirm-delete` page. `delete_my_account` returns immediately in this branch without deleting anything: the account and the calling session stay untouched until the link is used. `POST /users/me/confirm-delete` (deliberately unauthenticated, same trust model as `POST /auth/password-reset/confirm`: the token itself is the proof, and the link must work from whatever device the caller opened their email on) redeems the token via Redis `GETDEL` (atomic single-use, for the same replay-race reason `password_reset_service.reset_password`'s doc-comment explains), then runs the exact same soft-delete → revoke-sessions → audit sequence as the password-account path. Both paths call one shared function (`user_lifecycle/user_self_deletion_service.py::finalize_self_deletion`) so they can't drift apart, mirroring `purge_user_account`'s share between the admin purge route and the scheduled grace-period job. The confirm endpoint also gets its own login-lockout-style rate limiting via `login_protection_service.check_and_record_action`, under a `account_delete_confirm_lock:email:` namespace distinct from both `login_lock:email:` and `password_reset_confirm_lock:email:`, for the same reason those two stay distinct from each other: a stale or reused deletion link must never count towards, or be able to trip, an unrelated lockout for that email.

---

## Why MFA is not enabled

No multi-factor authentication (TOTP, SMS, WebAuthn, or otherwise) is implemented: this is an intentionally deferred scope boundary for a template repository, not an oversight discovered late:

- `authorization/conditions/condition_types/security_context_condition.py` and `authorization/context/request_context_builder.py` both carry explicit comments that `security_context` starts empty because this app does not implement MFA/device-trust infrastructure; any policy condition keyed on it (e.g. a hypothetical `mfa_verified` check) would currently always evaluate to false/deny.
- The PBAC condition framework (`context_attributes`, `security_context` condition types: see [../authorization/condition-schema-reference.md](../authorization/condition-schema-reference.md)) was deliberately built generic enough that a real MFA layer could plug in later by populating `security_context` at authentication time and writing policies that key off it: without any redesign of the authorization engine itself. The `mfa_verified` key appears in tests and docs today purely as an illustrative example of the generic mechanism, not a real, enforced check.
- **Why not build it now**: MFA enrollment/verification is a substantial feature on its own (secret storage, recovery codes, rate-limiting the verification step itself, UI for enrollment/challenge) that would roughly double the scope of the authentication surface for a template whose goal is a solid PBAC/session foundation, not a complete IdP feature set. Adding a half-built MFA flow (e.g. TOTP storage with no recovery-code UX) would be worse than not having it: a template should not ship a security feature that looks complete but isn't.
- Any real deployment that needs MFA should treat it as a deliberate follow-up: add a TOTP/WebAuthn enrollment+verification flow, populate `security_context.mfa_verified` on successful step-up auth, and gate sensitive policies on that context key: the hooks already exist to receive it.

---

## Intentionally deferred features

Recorded in one place rather than scattered across code comments: each of these was a deliberate scope decision for this template, not something missed:

- **MFA / device trust**: see above.
- **Per-endpoint rate-limit overrides**: one global `MAX_REQUESTS_PER_WINDOW`/`REQUEST_WINDOW_SECONDS` applies to every rate-limited route; the login-specific brute-force lockout layers a second, endpoint-specific control on top of the highest-risk route instead. See [Concerns](../concerns/README.md).
- **Email provider swapping beyond SMTP**: `emails/email_sender.py` now isolates the transport behind an `EmailSender` protocol, but only one implementation (`SMTPEmailSender`) exists; adding SES/SendGrid/Postmark support is a new class, not a framework change, and is left for whoever needs a specific provider.
- **Deploy automation**: CI verifies both Dockerfiles build but never pushes to a registry or deploys anywhere; this template assumes no specific production host (see [Deployment Guide](../deployment/guide.md#production-host-requirements)).

---

## Known accepted gaps / follow-ups

Recorded here rather than silently left unaddressed, so it's a deliberate backlog, not an oversight. (Forwarded-header trust, Redis authentication, and `SECRET_KEY` strength enforcement were also tracked here previously: all three are resolved and documented in [Security Hardening: Infrastructure](hardening-infra.md) now, rather than lingering here as crossed-out history.)

- **No automated database backups**: `scripts/db/db_backup.sh`/`scripts/db/db_restore.sh` now script the `pg_dump`/`psql` runbook (see [Deployment Guide](../deployment/guide.md#backups)), but there's still no *scheduler* wired up anywhere in this repo, since no specific production host/cloud target is assumed to hang a cron job on.
