# Session Management: Frontend and Production Checks

---

## Frontend behavior

1. **Ownership.** `ManageSessionsCard.tsx` lives in `frontend/src/mystic_auth/dashboard/manage_sessions/`, alongside the page that's its only consumer, rather than a separate top-level folder: it owns its own API query and mutation, but nothing else in the app renders it. Device labels come from `parseUserAgent.ts`; failure and empty states are rendered locally by the card.

---

2. **Table and detail view.** The table itself shows Device, Location, Signed In, and Last Seen columns, plus a row-actions column; `ip_address` is not one of the table's columns at all, and Location is truncated to fit its column width. A "View" action per row opens `SessionDetailsDialog.tsx`, a read-only panel showing the full device string, raw `ip_address` (or "Unknown"), the untruncated `city`/`country` location string, and both timestamps: everything the table's own columns cut off or truncate.

---

3. **Current session handling.** The current session is displayed but not offered as a targeted revoke action. That keeps the user flow unambiguous: use Logout for this device, use Revoke for other devices.

---

4. **Cache hygiene across accounts.** None of the "me"-scoped TanStack Query caches (sessions, policy assignments, own audit history, last login) are keyed by email, so a stale response from whoever was previously logged in in this same browser tab could otherwise flash for the next account before its own refetch lands. `useLogoutMutation`, `useLogoutAllMutation`, and `setupAuthInterceptor.ts`'s session-expiry handler all `removeQueries` (not just invalidate) these keys on the way out; `useLoginMutation` also invalidates them on the way in, as a second layer, since a login can happen without an explicit prior logout in this same tab (e.g. after a silent session expiry elsewhere).

---

## Production checks

The session feature is covered by:

- Backend unit tests for session list/revoke handlers and session repository/service behavior.
- Backend integration tests using real Postgres and Redis for multi-device login, refresh rotation, targeted revoke, self-revoke rejection, foreign-session rejection, logout, logout-all, and session cleanup after password/account lifecycle changes.
- Backend unit tests cover the SSE stream generator (`user_session/session_events.py`) against real Redis Pub/Sub, including publish/subscribe, heartbeats, and disconnect handling. An integration test confirms that a targeted session revoke publishes. The `GET /auth/session-events` route itself is only integration-tested for its auth contract because httpx's ASGITransport test harness does not reliably support a held-open streaming response.
- Frontend integration tests for the Manage Sessions card list, loading, error, empty, current-session, and revoke flows, plus a unit test for `useSessionEventsStream` (connects only while authenticated, closes on unmount, invalidates the relevant queries on a push event).

---

See [Session Management](README.md) for the feature map.

---
