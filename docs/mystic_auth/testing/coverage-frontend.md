# What the Frontend Tests Cover
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

This page gives an overview of what `tests/frontend/` actually checks,
across both unit and integration tests. See [Testing Overview](overview.md)
for how to run the suite.

---

## Unit tests

Covers, roughly:

1. Every API client function calls the right method, URL, and body, and rejects rather than swallows 401/403/422/429/500 responses.
2. The auth session store and the `setupAuthInterceptor` axios interceptor (silent token refresh on 401, coordinating concurrent 401s behind one in-flight refresh).
3. The authorization hooks and components (`useCan`, `useAuthorization`, `Authorized`, `ProtectedRoute`) that gate UI and routes on held permissions.
4. **The `useSessionEventsStream` SSE consumer** (see [Real-time session events](coverage-users-and-sessions.md#real-time-session-events) for the backend side): connects only once authenticated, closes cleanly on unmount, invalidates the current-user/sessions queries on a plain `revoked` push, and on `permissions_changed` synchronously zeroes the Zustand permissions store and calls `resetQueries()` (not `invalidateQueries()`) so no `keepPreviousData`-cached page can keep serving stale data through the refetch. A dedicated case checks the `permissions_changed` handler skips that synchronous zero-out for the one push right after this tab's own self-targeted grant/revoke (armed via `markSelfPermissionMutation()` in the policy/permission mutation hooks, consumed single-use by `wasSelfPermissionMutationRecent()`), and that a second push in the same window is still treated as a genuine change, not swallowed as the same echo twice.
5. Password rule evaluation and the strength meter.
6. Theme, language, and network-status stores.
7. The shared `DataTable`, `ConfirmDialog`, toaster, and error boundary components.
8. The app shell (navbar, sidebar, command palette) including its `extraNavItems`/`extraItems` downstream-extension points.
9. A repo-wide translation-key-parity check that all four supported languages expose the same set of keys as English.

---

## Integration tests: page-level behavior

The integration suite renders real pages against a mocked API layer and checks the page as a whole behaves correctly, not just one function in isolation. This is where permission-gated UI, multi-step flows, and real-request-shaped interactions are exercised together.

---

### Auth flow and login page

1. **The full login-to-authenticated-store flow is checked:**
   - A successful login updates the auth store, shows a success message, and fires the caller's `onSuccess` callback.
   - A wrong-password failure shows an error and never marks the session authenticated.
   - A locked account (429) surfaces the lockout message distinctly from a plain wrong-password error.
2. Logout is checked both for the happy path and for a logout call that fails because there was no session to begin with: the store is still cleared and the user still navigates away either way.
3. A companion test checks the login form is not unmounted while the post-login profile fetch is still in flight (which would otherwise cause a visible flicker), and that whatever the user typed stays on screen if login ultimately fails, instead of the form being cleared out from under them.
4. **Password policy consistency is checked between the client-side rule checker and what the backend actually enforces**: a password with upper case, a digit, and a special character but no lower case is rejected client-side without ever calling the API, while a password with upper, lower, and a digit but no special character is accepted, since the backend does not require a special character either.

---

### PBAC-gated UI

1. A dedicated flow test checks that UI gated behind specific permissions is shown only to a logged-in user who actually holds them, and that a user with broader (admin-level) permissions sees the admin-gated UI too.
2. Importantly, a failed login never reveals any protected content regardless of what a later session check might resolve to: permission gating fails closed on the client, matching the server-side behavior covered in [coverage-authorization/README.md](coverage-authorization/README.md).

---

### Dashboard

1. Checks a loading state renders before the current-user request resolves, the real user data renders once `GET /auth/me` resolves, an error state renders if that request fails, and the stats row and quick actions appear once the user has loaded.
2. A single-session logout control is specifically checked to not appear on the dashboard: that control lives in the app shell, not duplicated here.

---

### Manage Sessions card

1. Checks an error message when the sessions request fails, an empty state with no active sessions, the session list correctly flagging which entry is the caller's current device, and resolved city/country shown in the location column.
2. Checks that ending another device's session calls the dedicated session-revoke endpoint rather than the general logout endpoint.
3. Ending the current device's own session is checked to behave distinctly from ending another device's.

---

### Policies page

1. Checks the create-policy button and row actions (edit, delete) are shown or hidden based on exactly which `policies:*` actions the caller holds, including a restricted read-only view with a standalone create button for a caller who holds only `policies:create` without `policies:read`.
2. Create and edit both submit through the expected form payload and close the dialog on success; a local validation error is shown, without touching the API, when the conditions field contains invalid JSON.
3. Deleting a policy is checked to go through the shared `ConfirmDialog` rather than deleting immediately on click.
4. A separate file covers the list controls: numbered pagination driven by the `X-Total-Count` response header, debounced server-side search, filtering by resource type and status, and sortable column headers that toggle direction on a second click, each of these resets pagination back to page 1.

---

### Users page

1. Covers the same shape of permission-gated row actions (view, delete, reactivate, purge) as the policies page, plus list controls (search, role filter, policy filter, permission filter, CSV export triggering a browser download, sortable columns).
2. A details dialog is checked to show the union of a user's assigned-policy actions and their direct grants as "effective permissions," with the raw direct grants also shown separately, and to show a restricted-view notice, not a generic failure message, for a viewer who lacks the `policies:read`/`permissions:read` needed to see that section, distinguishing "you can't see this" from "this genuinely failed to load."
3. Separate files cover the Policies and Permissions management dialogs reachable from a user's row: assigning and revoking a policy or a direct permission through the real endpoints, and specifically that the assign/grant dropdown excludes an option that would add nothing new, because it is already fully covered by another assigned policy, a wildcard grant, or (for the bulk actions, described next) something the sole selected user already effectively holds.

---

### Bulk actions on the users page

1. Three dedicated files cover bulk role assignment, bulk policy assignment/removal, and bulk direct-permission grant/removal, each checked to call the real bulk endpoint with every selected user.
2. Each is checked to not still display a previous run's result once a new bulk action starts.
3. The bulk action buttons are always rendered but only enabled once at least one row is selected.

---

### Audit log and rate limits pages

1. The audit log page is checked for numbered pagination driven by `X-Total-Count` and fetching the next page on click, alongside its own scoping and filter behavior.
2. **The rate limits page is checked for:**
   - An empty state, listing active limiters with their scope badges.
   - Resetting a limiter after confirmation.
   - Hiding the reset action for a caller without `rate_limits:reset`.
   - Filtering by endpoint through a dropdown (not free text) that resets back to the first page.
   - Surfacing distinct error states for a failed list request versus a failed reset request.

See [coverage-infrastructure/README.md](coverage-infrastructure/README.md) for the backend side of both of these.

---

### Account settings

1. Covers the profile tab (name change via `PUT /users/me`), the permissions tab (rendering effective policies and permissions from the self-service `/me` endpoints, including collapsing a specific grant into its covering wildcard), and password change (requiring and validating the current password, except for an OAuth-only account setting a password for the first time).
2. A separate file covers the appearance/brand-color card: defaulting to the shipped brand color, validating a hex input, a debounced live preview committed to the theme store ahead of an explicit save, and resetting back to the default.
3. Account deletion has its own two files: the delete-account card (requiring current password, confirming through the dialog, distinct messaging for an OAuth-only account that gets a confirmation email instead of immediate deletion) and the standalone confirm-delete page reached from that email link (disabled without a token, success redirects to login, failure leaves the button re-clickable rather than stuck in a spinner).

---

### Routing and legal pages

1. **The top-level router is checked for the core navigation contract:**
   - An unauthenticated visitor is redirected away from a protected route to `/login`.
   - An authenticated visitor is redirected from `/` to `/dashboard`.
   - A visitor missing a required permission is sent to `/not-authorized` rather than the protected page.
   - An unknown route renders a 404 instead of a blank screen.
2. **The legal pages (Terms of Service, Privacy Policy) are checked to:**
   - Disclose the specific data actually collected (session IPs and audit log retention, matching what the backend really stores).
   - Have "back" links that return to whichever page the visitor actually came from, falling back sensibly to `/dashboard` or the landing page when there is no prior page in history.

---