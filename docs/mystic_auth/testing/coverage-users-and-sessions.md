# What the User and Session Tests Cover
---

This page walks through what the test suite checks for user CRUD and admin
management, account deletion and purge, the manage-sessions dashboard,
session geolocation, and real-time session events. See
[Testing Overview](overview.md) for how to run the suite.

---

## User CRUD and data model

1. **The base CRUD layer used by every user query is checked directly:**
   - Search matches name or email case-insensitively; an empty search term applies no filter.
   - Status filters (active, inactive, deleted) each exclude the rows they shouldn't include; deleted-only correctly checks `deleted_at` rather than the active flag.
   - An unrecognized sort column falls back to sorting by id instead of raising an error or allowing an arbitrary column name through (this is also what keeps sorting safe from SQL injection via a crafted `sort_by` value).
2. **Filtering the user list by policy name and by permission is checked separately and combined**: filtering by permission alone matches a user either through an assigned policy or a direct grant, and filtering by both policy and permission together requires both to hold on the very same assignment, not just any combination.
3. **Email lookups are normalized**: `get_by_email` and `create` both lowercase and match regardless of the input's original casing, so `Test@Example.com` and `test@example.com` resolve to the same account.
4. The user model itself is checked for the declared role enum's three roles, that the email column is unique and indexed, and that new accounts default to unverified and active.

---

## Admin user management

1. Admin-only listing and updating of users is checked against permission boundaries first: an unauthenticated or under-permissioned caller cannot list all users or update another user's record.
2. Listing is checked for its filters (role, verification status, active status, policy, permission) and sort behavior, and that the total-count response header reflects the filtered total, not just the current page's row count.
3. **The reserved system user gets special protection**: an admin cannot modify, delete, purge, or change the role of the system user, and cannot assign the system role to any other account.
4. Role changes are checked to actually apply (an admin can be promoted then demoted back) and to sit alongside direct permission grants correctly: two users with the identical role can still end up with different effective permissions if one holds extra direct grants or policies, and a roleless user assigned admin-level policies gets admin-level access despite having no role at all.

---

## CSV export

1. Exporting the user list as CSV is checked for the same permission boundary (an unauthenticated or regular user cannot export).
2. The status filter and deletion flag both carry through into the export correctly.
3. A name containing spreadsheet formula syntax (like a leading `=`) is neutralized in the exported file so a downloaded CSV cannot trigger formula injection when opened in Excel or Sheets.
4. A filtered result set larger than the configured export maximum is rejected rather than silently truncated.

---

## Self-service profile and password

1. A regular user can update their own name and email through the self-service endpoint, including a roleless user with no assigned role at all.
2. **Changing your own password is checked to:**
   - Require and verify your current password (except for an OAuth-only account setting a password for the first time, which has none to verify).
   - Reject the same password as the current one.
   - Revoke your other active sessions on success, without logging out the very session that made the change.
3. If session revocation cannot be confirmed (a Redis outage), the response still succeeds but reports that sessions were not confirmed revoked rather than falsely claiming success.
4. A profile update that does not touch the password does not revoke any sessions at all.

---

## Account deletion (self-service and admin)

1. A user can request deletion of their own account: this requires their current password (again, except for an OAuth-only account) and rejects a wrong password.
2. The reserved system user cannot self-delete under any circumstance.
3. Deletion revokes the account's existing sessions and clears its auth cookies on success, and still soft-deletes the account even if session revocation cannot be confirmed.
4. **Deletion confirmation tokens** (sent by email for the "click to confirm" flow) are checked to:
   - Be single-use.
   - Be scoped to the exact account they were issued for (a token minted for one account cannot delete a different one, even if manually replayed against a different account's confirm endpoint).
   - Be rejected outright if garbage or never actually persisted.
   - A concurrent double-submit of the same confirmation token only lets one deletion through.
5. **Admin-initiated deletion and purge** (hard delete after the retention grace period) are checked against:
   - The same system-user protection; an admin cannot delete their own account either.
   - An admin without the dedicated purge permission cannot purge, and a purge holder cannot purge their own account.
   - Purge invalidates the purged user's authorization cache entries only after the row is actually deleted (not before, which would leave a window for a stale cache read), and returns the count of sessions it revoked unchanged from what the revocation step reported.
6. Reactivating a soft-deleted user is checked separately, including that reactivating a user who was never deleted is rejected, and that it requires its own dedicated permission.
7. **The scheduled purge background job is checked to:**
   - Only purge accounts that have actually passed the configured grace period.
   - Ignore accounts that were never deleted at all.
   - Revoke the purged accounts' sessions as part of the job.
   - Skip (rather than abort the whole batch on) a single account whose session revocation cannot be confirmed.

See [Account Deletion](../authentication/account-deletion/README.md) for the full flow, and [coverage-security.md](coverage-security.md) for how login, password change, and deletion lockouts each use their own independent lockout namespace (so hammering the deletion-confirm endpoint cannot lock you out of login, and vice versa).

---

## Manage Sessions dashboard

1. **Listing active sessions is checked end to end**: a login creates a session visible in the list, a second login from a different client shows both sessions with exactly one correctly flagged as the caller's current session, and logging out removes that session from the active list.
2. **Revoking another device's session is checked to:**
   - Actually end that session (its refresh token stops working, scoped only to that one session, not the caller's other sessions).
   - Write an audit event.
   - Publish a real-time event so the affected device is notified live (see "Real-time session events" below).
3. A user cannot revoke another user's session, and revoking your own current session through this endpoint is specifically rejected (logout is the correct action for that).
4. Revoking a session that does not exist returns 404.
5. If the underlying chain-version bump used to revoke the session cannot be confirmed, the endpoint returns 503 rather than falsely reporting success.
6. A concurrency test fires two simultaneous revoke requests for the same session and checks only one actually succeeds.

See [Session Management](../authentication/session-management/README.md).

---

## Session geolocation

Login is checked to surface a resolved city and country when the geolocation lookup is available, and to leave both fields null when geolocation is disabled, rather than showing stale or fabricated location data. See [Geolocation](../geolocation/overview.md).

---

## Real-time session events

1. **The server-sent-events (SSE) stream backing live session updates is checked to:**
   - Publish a revocation event to the affected user's own channel only; a user's events are scoped so a different user's channel is never delivered to them.
   - Send periodic heartbeats while otherwise idle so a silently dead connection is detectable.
2. Publishing a revoked event is checked to swallow a Redis error rather than raise, matching the rest of the system's fail-safe-on-notification pattern.
3. **Connection lifecycle is checked carefully:**
   - The stream unsubscribes cleanly both on a normal close and when server shutdown is signaled mid-stream.
   - An event that is already in flight when shutdown is signaled is still delivered rather than dropped.
   - A long-lived connection is ended promptly once it reaches its configured maximum connection deadline rather than being held open indefinitely.

Frontend coverage for how the UI consumes this stream (query invalidation, dropping permissions synchronously on a `permissions_changed` push) is described in [coverage-frontend.md](coverage-frontend.md).

---