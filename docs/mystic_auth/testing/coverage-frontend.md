# What the Frontend Tests Cover
---

This page gives an overview of what `tests/frontend/` actually checks,
across both unit and integration tests. See [Testing Overview](overview.md)
for how to run the suite.

---

## Unit tests

Covers, roughly: every API client function calls the right method, URL, and
body, and rejects rather than swallows 401/403/422/429/500 responses; the
auth session store and the `setupAuthInterceptor` axios interceptor (silent
token refresh on 401, coordinating concurrent 401s behind one in-flight
refresh); the authorization hooks and components (`useCan`,
`useAuthorization`, `Authorized`, `ProtectedRoute`) that gate UI and routes
on held permissions; password rule evaluation and the strength meter; theme,
language, and network-status stores; the shared `DataTable`, `ConfirmDialog`,
toaster, and error boundary components; the app shell (navbar, sidebar,
command palette) including its `extraNavItems`/`extraItems`
downstream-extension points; and a repo-wide translation-key-parity check
that all four supported languages expose the same set of keys as English.

---
## Integration tests: page-level behavior

The integration suite renders real pages against a mocked API layer and
checks the page as a whole behaves correctly, not just one function in
isolation. This is where permission-gated UI, multi-step flows, and
real-request-shaped interactions are exercised together.

---

### Auth flow and login page

The full login-to-authenticated-store flow is checked: a successful login
updates the auth store, shows a success message, and fires the caller's
`onSuccess` callback; a wrong-password failure shows an error and never
marks the session authenticated; a locked account (429) surfaces the
lockout message distinctly from a plain wrong-password error. Logout is
checked both for the happy path and for a logout call that fails because
there was no session to begin with, the store is still cleared and the
user still navigates away either way. A companion test checks the login
form is not unmounted while the post-login profile fetch is still in
flight (which would otherwise cause a visible flicker), and that whatever
the user typed stays on screen if login ultimately fails, instead of the
form being cleared out from under them.

Password policy consistency is checked between the client-side rule
checker and what the backend actually enforces: a password with upper case,
a digit, and a special character but no lower case is rejected client-side
without ever calling the API, while a password with upper, lower, and a
digit but no special character is accepted, since the backend does not
require a special character either.

---

### PBAC-gated UI

A dedicated flow test checks that UI gated behind specific permissions is
shown only to a logged-in user who actually holds them, that a user with
broader (admin-level) permissions sees the admin-gated UI too, and,
importantly, that a failed login never reveals any protected content
regardless of what a later session check might resolve to, permission
gating fails closed on the client, matching the server-side behavior
covered in [coverage-authorization.md](coverage-authorization.md).

---

### Dashboard

Checks a loading state renders before the current-user request resolves,
the real user data renders once `GET /auth/me` resolves, an error state
renders if that request fails, and the stats row and quick actions appear
once the user has loaded. A single-session logout control is specifically
checked to not appear on the dashboard, that control lives in the app
shell, not duplicated here.

---

### Manage Sessions card

Checks an error message when the sessions request fails, an empty state
with no active sessions, the session list correctly flagging which entry
is the caller's current device, resolved city/country shown in the
location column, and that ending another device's session calls the
dedicated session-revoke endpoint rather than the general logout endpoint.
Ending the current device's own session is checked to behave distinctly
from ending another device's.

---

### Policies page

Checks the create-policy button and row actions (edit, delete) are shown
or hidden based on exactly which `policies:*` actions the caller holds,
including a restricted read-only view with a standalone create button for
a caller who holds only `policies:create` without `policies:read`. Create
and edit both submit through the expected form payload and close the
dialog on success; a local validation error is shown, without touching the
API, when the conditions field contains invalid JSON. Deleting a policy is
checked to go through the shared `ConfirmDialog` rather than deleting
immediately on click. A separate file covers the list controls: numbered
pagination driven by the `X-Total-Count` response header, debounced
server-side search, filtering by resource type and status, and sortable
column headers that toggle direction on a second click, each of these
resets pagination back to page 1.

---

### Users page

Covers the same shape of permission-gated row actions (view, delete,
reactivate, purge) as the policies page, plus list controls (search, role
filter, policy filter, permission filter, CSV export triggering a browser
download, sortable columns). A details dialog is checked to show the union
of a user's assigned-policy actions and their direct grants as "effective
permissions," with the raw direct grants also shown separately, and to
show a restricted-view notice, not a generic failure message, for a viewer
who lacks the `policies:read`/`permissions:read` needed to see that
section, distinguishing "you can't see this" from "this genuinely failed
to load."

Separate files cover the Policies and Permissions management dialogs
reachable from a user's row: assigning and revoking a policy or a direct
permission through the real endpoints, and specifically that the
assign/grant dropdown excludes an option that would add nothing new,
because it is already fully covered by another assigned policy, a
wildcard grant, or (for the bulk actions, described next) something the
sole selected user already effectively holds.

---

### Bulk actions on the users page

Three dedicated files cover bulk role assignment, bulk policy
assignment/removal, and bulk direct-permission grant/removal, each
checked to call the real bulk endpoint with every selected user, and each
checked to not still display a previous run's result once a new bulk
action starts. The bulk action buttons are always rendered but only
enabled once at least one row is selected.

---

### Audit log and rate limits pages

The audit log page is checked for numbered pagination driven by
`X-Total-Count` and fetching the next page on click, alongside its own
scoping and filter behavior. The rate limits page is checked for an empty
state, listing active limiters with their scope badges, resetting a
limiter after confirmation, hiding the reset action for a caller without
`rate_limits:reset`, filtering by endpoint through a dropdown (not free
text) that resets back to the first page, and surfacing distinct error
states for a failed list request versus a failed reset request. See
[coverage-infrastructure.md](coverage-infrastructure.md) for the backend
side of both of these.

---

### Account settings

Covers the profile tab (name change via `PUT /users/me`), the permissions
tab (rendering effective policies and permissions from the self-service
`/me` endpoints, including collapsing a specific grant into its covering
wildcard), and password change (requiring and validating the current
password, except for an OAuth-only account setting a password for the
first time). A separate file covers the appearance/brand-color card:
defaulting to the shipped brand color, validating a hex input, a debounced
live preview committed to the theme store ahead of an explicit save, and
resetting back to the default. Account deletion has its own two files: the
delete-account card (requiring current password, confirming through the
dialog, distinct messaging for an OAuth-only account that gets a
confirmation email instead of immediate deletion) and the standalone
confirm-delete page reached from that email link (disabled without a
token, success redirects to login, failure leaves the button re-clickable
rather than stuck in a spinner).

---

### Routing and legal pages

The top-level router is checked for the core navigation contract: an
unauthenticated visitor is redirected away from a protected route to
`/login`, an authenticated visitor is redirected from `/` to `/dashboard`,
a visitor missing a required permission is sent to `/not-authorized`
rather than the protected page, and an unknown route renders a 404 instead
of a blank screen. The legal pages (Terms of Service, Privacy Policy) are
checked to disclose the specific data actually collected (session IPs and
audit log retention, matching what the backend really stores), and their
"back" links return to whichever page the visitor actually came from,
falling back sensibly to `/dashboard` or the landing page when there is no
prior page in history.

---