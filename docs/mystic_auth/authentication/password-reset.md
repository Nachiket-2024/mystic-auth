# Password Reset and Password Change

Split out of [Authentication Flows](overview.md). Covers the "forgot password" self-service reset
flow, plus the two places a password can otherwise change (self-service and admin), which share the
same session-revocation and current-password rules for the same reasons.

## Components

| File | Role |
|---|---|
| `backend/mystic_auth/auth/password_logic/password_reset_service.py` | Issues/redeems the reset token, enforces password strength |
| `backend/mystic_auth/auth/password_reset_request/`, `password_reset_confirm/` | Route-facing handlers for request/confirm |
| `backend/mystic_auth/auth/password_logic/password_service.py` | `hash_password`, `verify_password`, `validate_password_strength` |
| `backend/mystic_auth/api/auth_routes/auth_routes.py` | `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` |
| `backend/mystic_auth/api/user_routes/user_self_service_routes.py`, `user_management_update_routes.py` | `PUT /users/me`, `PUT /users/{email}` (password change, not just reset) |

---

## Forgot-password flow

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant API as Backend
    participant R as Redis
    participant E as Email

    U->>API: POST /auth/password-reset/request { email }
    API->>R: SET reset:{token} (single-use, TTL)
    API->>E: send reset link
    API-->>U: 200 generic response (always, either way)

    U->>API: POST /auth/password-reset/confirm { token, new_password }
    API->>R: GETDEL reset:{token} (atomic, single-use)
    alt token valid and password strong enough
        API->>API: hash new password, bump account_ver (revoke every session)
        API-->>U: 200
    else weak password
        API->>R: restore token, capped at its original remaining TTL
        API-->>U: 400
    else token missing/expired/reused
        API-->>U: 400
    end
```

1. **Request** issues a scoped, Redis-backed single-use token (`GETDEL` pattern, same as email
   verification), emailed to the address. **Always** the same generic response whether or not the
   email is registered, closing the same enumeration gap as signup.
2. **Confirm** atomically redeems the token, validates the new password's strength (the same rule
   signup enforces), rejects if it matches the current password, and, critically, **bumps
   `account_ver`**, so a reset actually ends every other session rather than just changing the
   password while old sessions stay valid.
3. **A recoverable failure (e.g. weak password) restores the Redis token entry**, capped at its
   *original* remaining TTL: it doesn't get a fresh full-length window, closing a
   window-extension loophole where repeatedly failing validation could keep the same link alive
   indefinitely.

---

## Password change (self-service and admin)

```mermaid
flowchart TD
    Start(["PUT /users/me or PUT /users/{email}"]) --> HasPwField{"Request includes\na new password field?"}
    HasPwField -- "no" --> Plain["Ordinary profile update\nno session side effects"]
    HasPwField -- "yes" --> WhoAmI{"Self (/me) or admin route?"}
    WhoAmI -- "self" --> ReConfirm{"hashed_password set\non this account?"}
    ReConfirm -- "yes" --> CheckCurrent{"current_password\nmatches?"}
    CheckCurrent -- "no" --> Fail401["401"]
    CheckCurrent -- "yes" --> Change
    ReConfirm -- "no (OAuth-only,\nfirst password)" --> Change["Hash + store new password"]
    WhoAmI -- "admin" --> Change
    Change --> Revoke["revoke_all_tokens_for_user()\nbumps account_ver"]
    Revoke --> Done200["200"]
```

1. `PUT /users/me` (self) and `PUT /users/{email}` (admin) both back onto the same `UserUpdate`
   schema, so a `password` field is handled identically by both once past the checks below.
2. **Self-service requests re-confirm the current password.** `PUT /users/me` requires a matching
   `current_password` whenever the request sets a new `password`: proof of the old credential, not
   just a valid session, since a hijacked `access_token` cookie alone would otherwise be enough to
   lock the real owner out. Skipped only for an OAuth-only account (`hashed_password is None`)
   setting a password for the first time, since there is no existing password to confirm.
3. **The admin route skips that check entirely.** `PUT /users/{email}` authenticates via the
   admin's own `users:update_any` permission, not the target account's old password.
4. **Any successful password change revokes every session on the account**
   (`refresh_token_service.revoke_all_tokens_for_user`, bumps `account_ver`), matching
   password-reset-confirm's behavior exactly: a password change may be happening precisely because
   the account is compromised, so an attacker's existing session shouldn't outlive it. An ordinary
   profile update with no password field never triggers this.

See [Security Decisions: self-service password change requires the current password](../security/decisions.md#self-service-password-change-requires-the-current-password).

---

## Testing coverage

`tests/backend/mystic_auth/unit/auth/password_logic/test_password_reset_unit.py` and
`tests/backend/mystic_auth/unit/auth/password_reset_confirm/` cover the token issue/redeem and
strength-validation logic; `tests/backend/mystic_auth/integration/auth/test_logout_password_reset_integration.py`
exercises the full reset path, including the session-revocation side effect, against real
Postgres/Redis. See [Testing Overview](../testing/overview.md).

---

## See also

- [Authentication Flows](overview.md): tokens/cookies and how this fits alongside the other flows.
- [Account Deletion and Purge](account-deletion.md): the OAuth-only-account deletion-confirmation
  flow reuses this same signed-single-use-token pattern.
