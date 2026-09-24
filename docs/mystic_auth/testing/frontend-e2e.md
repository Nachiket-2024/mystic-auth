# Frontend Browser E2E Tests
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

These 26 Playwright specs exercise the application in a real browser. “Mocked”
means the browser receives deterministic route fixtures. “Real disposable
account” means the test creates or uses a short-lived account against the local
stack. “Real seeded accounts” means the test depends on the PBAC matrix seeded
by `local-scripts/app/seed-user-permission-matrix.py`. “Live” is opt-in.

The CI browser run uses all four configured browser projects with two workers
and two retries. Two workers keep the real-account matrix and shared dev
backend deterministic on standard runners without relaxing the 30-second test
timeout or the CI performance budgets. Set `PLAYWRIGHT_WORKERS` when
deliberately validating on a larger runner; the browser fixture also accepts
`PLAYWRIGHT_COMPOSE_PROJECT_NAME` for an isolated Compose stack.
For a native run without an already booted frontend container, set
`PLAYWRIGHT_USE_PREVIEW=1` to build once and serve the production bundle via
Vite preview, avoiding dev-server HMR noise during the browser matrix.

---

## App and public pages

- `tests/frontend/app/e2e/landing/landing_page_browser.spec.ts` verifies the
  public landing route, visible content, and responsive browser rendering.
- `tests/frontend/app/e2e/legal/legal_pages_browser.spec.ts` verifies each
  legal page in real browser projects and checks navigation/rendering.
- `tests/frontend/app/e2e/status_pages/status_pages_browser.spec.ts` verifies
  status, not-found, and not-authorized pages and their browser navigation.
- `mystic_auth/e2e/public/public_pages_browser.spec.ts` verifies public auth
  pages, zoom behavior, responsive widths, and horizontal-overflow safety.

## Authentication and account settings

- `auth/auth_pages_responsive_browser.spec.ts` checks auth layouts at narrow
  widths and guards against mobile overflow. Backend mode: mocked.
- `auth/login_and_logout_browser_flow.spec.ts` creates or uses a disposable
  account to verify login, protected navigation, logout, and logout-all.
- `auth/signup_and_verification_browser_flow.spec.ts` verifies signup,
  validation, verification-request, and verification-result browser states.
  Backend mode: mocked endpoints.
- `auth/password_reset_browser_flow.spec.ts` verifies reset request, token
  confirmation, validation, cooldown, and navigation. Backend mode: mocked.
- `auth/oauth2_login_browser_flow.spec.ts` verifies OAuth redirect, callback
  errors, cancellation, and retry states. Backend mode: mocked OAuth.
- `auth/protected_route_redirect_browser.spec.ts` verifies unauthenticated and
  unauthorized redirects and return-route behavior. Backend mode: mocked auth.
- `auth/preauth_keyboard_and_confirmation_browser.spec.ts` verifies keyboard-
  only pre-auth controls, focus order, and confirmation interactions.
- `account_settings/account_settings_page_browser.spec.ts` verifies settings
  tabs, profile/password/appearance controls, deletion dialog, and overflow.
  Backend mode: mocked API.
- `account_settings/confirm_delete_account_browser_flow.spec.ts` verifies the
  deletion-confirmation token page for valid, missing, and invalid tokens.
  Backend mode: mocked endpoint.

## Authenticated pages

- `dashboard/dashboard_page_browser.spec.ts` verifies dashboard controls,
  responsive layout, loading/data states, and least-privilege redirects.
  Backend mode: mocked API.
- `dashboard/active_sessions_browser.spec.ts` verifies session cards, revoke
  actions, confirmation dialogs, and focus restoration. Backend mode: mocked.
- `users/users_page_browser.spec.ts` verifies user tables, filters, row/bulk
  dialogs, escaped content, and permission gates. Backend mode: mocked API.
- `policies/policies_page_browser.spec.ts` verifies policy lists/forms,
  filters, dialogs, keyboard behavior, and permission gates. Mocked API.
- `permissions/permissions_page_browser.spec.ts` verifies catalog listing,
  details, filters, and permission gates. Backend mode: mocked API.
- `rate_limits/rate_limits_page_browser.spec.ts` verifies rate-limit listing,
  filters, reset confirmation, and permission gates. Mocked API.
- `audit_log/audit_log_page_browser.spec.ts` verifies audit categories, scope,
  filters, pagination, details, and tab behavior. Mocked API.
- `layout/app_shell_controls.spec.ts` verifies sidebar/navbar, command palette,
  theme/language/font controls, responsive menu, shortcuts, and Escape.
- `accessibility/accessibility_browser.spec.ts` runs axe WCAG 2.1 AA checks
  over public and authenticated major pages. Backend mode: mocked API.

## Authorization matrix

- `authorization/permission_matrix_browser.spec.ts` exercises nine mocked
  permission profiles across protected routes, controls, dialogs, focus
  restoration, and fail-closed states. It proves broad frontend gating with
  synthetic `/auth/me` responses.
- `authorization/permission_matrix_real_accounts_browser.spec.ts` exercises
  the seeded real-account matrix. It checks exact `/auth/me` permission sets,
  route gates, authorization-log “All users” visibility, and the Security
  Events “All users” tab for `security_audit:read`. The seed currently creates
  40 role/policy/direct-grant combinations, of which 32 verified-active
  buckets are selected for browser coverage across four Playwright projects.
  Known issue: WebKit can race cookie commit immediately after the login
  request, so the test retries `/auth/me` once after 150 ms. That is a browser
  fixture timing race, not a permission failure; failures after the retry are
  actionable.

## Performance and live deployment

- `performance/admin_responsiveness_browser.spec.ts` checks delayed admin
  tables, repeated destructive confirmation, filtering, sorting, and browser
  responsiveness. Backend mode: mocked API.
- `live/live_deployment_smoke.spec.ts` verifies signup/login, inert stored XSS,
  protected redirects, and 390px overflow against `LIVE_BASE_URL`. It is
  skipped unless the live environment variables are supplied.

---

## See also

- [Frontend Test Map](frontend.md)
- [Frontend Test Map](frontend.md)
- [Frontend Integration Tests](frontend-integration.md)
- [Testing Overview](overview.md)
