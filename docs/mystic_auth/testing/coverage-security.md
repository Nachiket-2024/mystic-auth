# What the Security Tests Cover
---

This page walks through the dedicated `tests/backend/mystic_auth/security/`
suite, plus other security-relevant behavior tested elsewhere in the
codebase (spoofing, forged tokens, IDOR-style access checks). These tests
try to break the app the way an attacker would, and check it is correctly
blocked. See [Testing Overview](overview.md) for how to run the suite, and
[Security Hardening](../security/hardening.md) for the design decisions
behind these protections.

---

## Privilege escalation via policies

A caller holding only `policies:create` cannot mint a brand-new policy that
grants a sensitive action they do not themselves already hold, this closes
the obvious path of "create a policy that grants me anything, then assign
it to myself." The same guard is tested against `policies:update`: adding an
unheld sensitive action to an existing policy is blocked, and so is
self-escalating to system-superuser through a policy assignment when the
caller only holds `policies:assign`.

Two more subtle variants are covered. Rolling back a policy to a prior
revision is blocked if that prior revision holds an action the caller does
not currently have, rollback cannot be used as a side door around the
same guard that blocks a direct edit. Rolling back a policy the caller does
not currently hold is also blocked outright. And repointing a policy's
resource type is checked specifically, changing a policy's declared
resource type could otherwise "activate" an action that was previously
dormant because it never matched anything, and this is blocked the same way
a direct action addition would be.

A system superuser is checked to still be able to perform every one of the
above, confirming the guard is a caller-holds-what-they-grant rule, not a
blanket lock that also breaks legitimate superuser administration.

---
## Privilege escalation via direct permission grants

A caller holding only `permissions:grant` cannot grant another user a
sensitive action they do not themselves hold, and specifically cannot
self-escalate to `users:purge` through the bulk permission-assignment
endpoint (a plausible bypass path if bulk assignment used different
authorization logic than the single-item endpoint). A bulk assignment
containing one item that attempts this escalation still applies the other,
valid items in the same batch rather than failing the whole request, the
escalation attempt is rejected per-item, not by aborting the batch. A
system superuser is checked to still be able to grant permissions normally.

---
## Policy tampering

Baseline (built-in, ship-with-the-template) policies cannot be deleted or
renamed, even by a system superuser, this protects the policies the rest of
the authorization system assumes exist. Removing the last remaining
system-superuser assignment is blocked, so it is not possible to lock every
admin out of the system by revoking the final superuser grant. See
[coverage-authorization.md](coverage-authorization.md) for the equivalent
behavior tested as an ordinary permission boundary, this file tests the
same rule as a deliberate attack.

---
## Condition payload abuse

The policy-condition validator is tested as a target for denial-of-service
style payloads, not just malformed input: a condition object with a huge
number of keys, pathologically deep nesting, or a multi-megabyte string
value is rejected quickly, before the validator would otherwise spend
excessive time or memory walking the structure. A reasonably-shaped
condition still passes through this guard unaffected, the guard is checked
to reject only genuinely abusive shapes, not ordinary ones. An unknown
condition key is rejected and never persisted to the database, and a
malformed time string, invalid IP, or invalid timezone inside a condition
is rejected at the API boundary. A final test confirms an existing policy's
conditions cannot be corrupted into an invalid shape through an update
request, the same validation applies on write, not just on create.

---
## Batch authorization abuse

The `/authorize/batch` endpoint is tested against being used as an
amplification or information-leak vector: an oversized batch is rejected
before any check inside it is evaluated (so an attacker cannot force
expensive evaluation work by submitting a huge batch), an empty batch and a
batch containing one malformed check are both rejected, and the endpoint
requires authentication. A denied result inside a batch response is checked
to never leak the policy names it considered, only the allow/deny outcome,
so a caller cannot use denials to enumerate policy names they cannot read.
A batch at the documented maximum size is checked to still succeed and to
match what individual single-checks would have returned for the same
inputs.

---
## Context spoofing

Authorization decisions that depend on request context (like an IP-based
policy condition) are tested against a caller forging that context
themselves. A forged `X-Forwarded-For` header is checked to never grant
access it should not, and to never bypass a denial, only a header
contributed by an actually-trusted proxy hop is trusted, matching the
client-IP resolution behavior covered in
[coverage-authentication.md](coverage-authentication.md). A "current time"
value supplied in a request body is checked to never be used for a
time-based condition, the server's own clock is always the source of truth,
so a client cannot claim it is within business hours when it is not.

---
## Least-privilege database role

A separate, opt-in suite (skipped unless `APP_DATABASE_URL` is set to a
restricted role) checks the application's own database role against the
principle of least privilege: it can read and write the tables the app
actually needs, but cannot run DDL (create or alter tables), cannot create
or alter other database roles, and is not a superuser role itself. This
guards against the app's own database credentials being useful for more
than the app needs if they were ever leaked.

---
## Forged and malformed tokens

JWT handling is tested against forged and structurally-wrong tokens
throughout the auth suite, not only in this dedicated security folder: a
token of the wrong type presented where another type is expected (access
token as a refresh token, or a `verify` token as a login token) is
rejected, a token whose issuer or audience does not match the configured
values is rejected, an expired token is rejected, and a token whose
account or chain "version" claim is stale (because the account was
logged-out-everywhere or reset since the token was issued) is rejected
even though the token's own signature and expiry are still valid. See
[coverage-authentication.md](coverage-authentication.md) for the full list
of token-handling tests.

---
## IDOR-style access checks

Several integration tests specifically check that one user cannot act on
another user's data by guessing or reusing an identifier: a user cannot
revoke another user's session, a deletion-confirmation token issued for one
account cannot be used to delete a different account even if replayed
directly against the confirm endpoint, and reusing a revoked session's
refresh token stays scoped to that one session rather than accidentally
validating against a different session. These are covered in depth in
[coverage-users-and-sessions.md](coverage-users-and-sessions.md) and
[coverage-authentication.md](coverage-authentication.md).

---