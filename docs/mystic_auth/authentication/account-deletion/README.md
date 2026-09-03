# Account Deletion and Purge

---

This doc covers the full account-deletion lifecycle across backend, frontend, and the scheduled
cleanup job: self-service delete (both the password-account and OAuth-only-account paths), admin
delete/reactivate/purge, and the automatic grace-period purge. It is split out of
[Database Design: Account lifecycle](../../database/design.md#account-lifecycle) and
[Security Decisions: Product](../../security/decisions-product.md) so the full flow, end to end, lives in one place
with the sequence of each path made explicit.

---

## Feature map

| Layer | Files | Responsibility |
|---|---|---|
| Self-service route | `backend/mystic_auth/api/user_routes/user_self_service_routes.py` | `DELETE /users/me`, `POST /users/me/confirm-delete` |
| Self-service services | `backend/mystic_auth/user_lifecycle/user_self_deletion_service.py`, `account_deletion_service.py`, `account_deletion_confirm_handler.py` | Shared soft-delete routine, deletion-confirmation token issue/verify, confirm-endpoint handler |
| Admin routes | `backend/mystic_auth/api/user_routes/user_lifecycle_routes.py` | `DELETE /users/{email}`, `DELETE /users/{email}/purge`, `PATCH /users/{email}/reactivate` |
| Purge routine | `backend/mystic_auth/user_lifecycle/user_purge_service.py` | `purge_user_account()`, shared by the manual purge route and the scheduled job |
| Soft-delete mechanics | `backend/mystic_auth/user/user_crud_modules/user_lifecycle_crud.py` | `soft_delete`, `reactivate`, `get_deleted_before(cutoff)` |
| Scheduled job | `backend/mystic_auth/procrastinate_tasks/account_purge_tasks.py` | Daily 03:00 UTC purge of accounts past their grace period |
| Frontend | `frontend/src/mystic_auth/account_settings/DeleteAccountCard.tsx`, `confirm_delete/ConfirmDeleteAccountPage.tsx` | Delete UI, password re-confirm, "check your email" state, the public `/confirm-delete` landing page |
| Tests | `tests/backend/mystic_auth/integration/user_lifecycle/`, matching unit suites, `tests/frontend/mystic_auth/*/account_settings/` | End-to-end and unit coverage for every path below |

---

## Pages

- [Self-Service Paths](self-service.md): why there are two paths, and how each one works.
- [Admin Actions and Purge](admin-and-purge.md): admin delete/reactivate/purge, and the scheduled grace-period purge.
- [Frontend](frontend.md): `DeleteAccountCard` and the `/confirm-delete` page.

---

## Configuration

| Setting | Meaning | Default |
|---|---|---|
| `ACCOUNT_PURGE_GRACE_DAYS` | Days a soft-deleted account stays recoverable before the scheduled job purges it | 30 |
| `ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES` | Lifetime of the OAuth-only-account confirmation link | 60 |

Both live in `backend/mystic_auth/core/settings.py` and are set via `.env`.

---

## Production checks

- Backend integration tests cover both self-service paths (password re-confirm success/failure,
  OAuth-only send-and-confirm, expired/reused token, rate limiting on the confirm endpoint), admin
  soft-delete/reactivate/purge, self-targeting and system-account guards, and that the scheduled job
  only purges accounts past their grace period.
- Backend unit tests cover `account_deletion_service` token issue/verify and
  `user_purge_service.purge_user_account` in isolation.
- Frontend integration tests cover `DeleteAccountCard` for both account types (password re-confirm
  validation, the "check your email" state) and `ConfirmDeleteAccountPage`'s success/error/expired
  states.

---

## See also

- [Database Design: Account lifecycle](../../database/design.md#account-lifecycle): schema-level view
  of soft delete vs. purge, foreign keys, and cascade behavior.
- [Security Decisions: Product](../../security/decisions-product.md): the *why* behind re-authentication requirements
  on both paths.
- [Session Management](../session-management/README.md): how session revocation (step 2 of every path above)
  actually works.

---
