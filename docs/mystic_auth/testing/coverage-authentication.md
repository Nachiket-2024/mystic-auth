# What the Authentication Tests Cover
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

This page walks through what the test suite actually checks for signup,
login, logout, password reset, OAuth2, refresh tokens, and rate limiting. It
does not list file names or counts; see [Testing Overview](overview.md) for
that. For how these flows work, see
[Authentication Overview](../authentication/overview.md).

---

## Signup and account verification

1. A new signup sends a verification email and always returns the same generic response, whether or not the email was already registered, so an attacker cannot use signup to find out which emails exist.
2. A duplicate signup does not create a second user or send a second email, and this holds even when the duplicate is submitted with different letter casing (`Test@example.com` vs `test@example.com`).
3. The account gets its default self-service policy assigned on creation, and signup still succeeds even if that default policy is missing from the database, rather than failing the whole signup.
4. Verification tokens are single-use: a token can confirm an account exactly once, and a second attempt with the same token is rejected.
5. The route no longer accepts a token passed as a query string, only in the request body.
6. A concurrency test fires many signup-then-verify chains at once, sequentially and in parallel, and checks a legitimate fresh verification token is never rejected by a race with itself.

See [Signup and Verification](../authentication/signup-and-verification.md) for the full flow.

---

## Login

1. Login is checked against wrong password, unknown email, unverified account, deactivated account, and OAuth-only account (no password set) cases.
2. A login attempt against a nonexistent user still performs a password hash comparison using a dummy hash, so response timing does not reveal whether the email exists. The same timing-safety property is checked for unverified accounts.
3. Casing is normalized: a user who signed up as `Test@example.com` can log in as `test@example.com`.
4. **Lockout is tested from both directions:**
   - Failed attempts accumulate towards a lockout threshold, a successful login resets the counter, and once locked, even the correct password is rejected.
   - The account-level lock and the source-IP-level lock are both checked independently.
   - The "locked out, try again in N minutes" response is identical whether the pre-check or the post-check caught the lockout, so the response itself does not leak which one triggered.
   - The retry-time estimate never reports zero minutes for an account that is still actually locked.

See [Login](../authentication/login.md).

---

## Logout and logout-all

1. Logout revokes the presented refresh token and clears both auth cookies, including when the token is already revoked or fails to decode at all: those responses still succeed and still clear cookies rather than leaking a 500.
2. Logout writes an accurate audit entry in both cases, including when the token cannot be decoded (the entry is recorded without an email in that case).
3. Logout-all revokes every session for the account by bumping the account's token version, so already-issued access tokens stop working immediately, not just the refresh token.
4. It is tested against the same edge cases as single logout: undecodable tokens, already-revoked tokens, and no active sessions at all still return success and clear cookies.
5. If the version bump itself cannot be confirmed (for example a Redis hiccup), the route returns a 503 rather than reporting success on an unconfirmed revocation.

See [Logout](../authentication/logout.md).

---

## OAuth2 and PKCE

1. The Google OAuth2 login flow is tested end to end: a brand-new Google login creates a verified user with no password, and a Google login for an existing email links the accounts.
2. **Linking behavior is specific about password handling**: an unverified password account gets its password cleared when Google verifies the same email (so an attacker who pre-registered the victim's email cannot keep using a stale password), but an already-verified account's password is left untouched by a later Google login.
3. **PKCE (Proof Key for Code Exchange) is checked for correctness**: the code verifier is hashed with SHA-256 and sent as the challenge, and a mismatched verifier fails closed with no user created, end to end.
4. OAuth state tokens are single-use and tied to a cookie: a state/cookie mismatch, a missing state, and a replayed state are all rejected, and Google reporting an unverified email is rejected outright.
5. A user cancelling the Google consent screen redirects cleanly back to the app instead of surfacing a raw 422.

See [OAuth2 and PKCE](../authentication/oauth2-pkce.md).

---

## Password reset

1. Requesting a reset persists a single-use reset token.
2. Confirming a reset consumes the token, revokes the account's existing sessions, and rejects a reused or unknown token.
3. A concurrent double-submit of the same reset token is checked to let only one request through.
4. **Retry-friendliness is specifically tested**: if the new password is weak, the account already had that password, or the database write fails, the original reset token is restored so the user can retry without requesting a brand new email. The restored token's remaining lifetime is capped by whatever time was actually left on the original JWT: it is never extended.

See [Password Reset](../authentication/password-reset.md).

---

## Refresh tokens and session rotation

1. Refresh tokens rotate on every use: the old token is rejected once a new one has been issued.
2. A concurrent replay of the exact same refresh token only lets one of the simultaneous requests through.
3. Reusing an already-rotated (stale) token is treated as a compromise signal and revokes the affected session chain. Tests check this revocation is scoped to just that chain when chain information is available, and falls back to revoking everything for the account when it is not (an older token minted before chain tracking existed).
4. Type confusion is rejected: presenting an access token where a refresh token is expected (and vice versa) fails without being mistaken for reuse abuse.
5. A genuinely expired refresh token is also rejected.
6. Repeated, legitimate refreshes do not themselves trip the failed-attempt lockout meant for guessing attacks.

---

## Rate limiting and lockout

1. The IP-based and account-based rate limiters are tested as independent keys: an attacker cannot dodge an account lock by rotating IPs, or lock out a victim by hammering just the IP key.
2. The limiter is checked to fail closed: if Redis itself is unreachable, requests are rejected (429) rather than let through unchecked.
3. A failure inside the optional account-extractor callback is logged but does not crash the request.
4. Expiry (TTL) on a rate-limit counter is only set on the very first request in a window, not reset on every subsequent one.
5. **Client IP resolution is tested against proxy spoofing:**
   - With no trusted proxies configured, the raw TCP peer address is used.
   - With trusted proxies configured, the right-most `X-Forwarded-For` entry contributed by a trusted hop is used, and entries a caller could forge earlier in the chain are ignored, including a multi-hop chain where every forwarded entry claims to be a trusted hop itself.

See [Security Hardening](../security/hardening.md) for how rate limiting fits the wider abuse-prevention picture.

---

## Session and cookie handling

1. Both the access and refresh token cookies are checked to carry the expected security flags (`Secure`, matching `SameSite`), and their max-age values are derived from settings rather than hardcoded.
2. The refresh token cookie is specifically scoped to the auth path only, so it is not sent on every request, while the access token cookie is not path-restricted.
3. Clearing cookies on logout is checked to use a matching `SameSite` and the same scoped path, so the browser actually deletes the cookie that was set (a mismatched clear-cookie call silently fails to remove it).

See [Session Management](../authentication/session-management/README.md) for the
manage-sessions dashboard covered in
[coverage-users-and-sessions.md](coverage-users-and-sessions.md).

---