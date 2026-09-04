# Browser E2E Tests
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

The browser E2E suite uses Playwright through `frontend/playwright.config.ts`.
Tests live under `tests/frontend/app/e2e/` and
`tests/frontend/mystic_auth/e2e/`, not inside `frontend/`, so they match the
repo-wide test layout and the same app/template split used by unit and
integration tests.

The suite starts the Vite dev server from the frontend package and runs against
Chromium desktop and mobile projects. It verifies real browser rendering,
keyboard behavior, responsive layout, protected routing, auth boundaries, and
dialog open/cancel flows.

---

## Required stack

Run the Docker dev stack with email delivery disabled before running tests that
use the real login endpoint:

```bash
EMAIL_ENABLED=false docker compose --env-file env/.env -f docker/compose/docker-compose.dev.yml up -d postgres redis alembic backend frontend procrastinate_worker
```

---

Do not run browser tests that submit login credentials against a backend with
real email delivery enabled. The Playwright seeded-user helper also passes
`EMAIL_ENABLED=false` when it creates and removes disposable test accounts.

---

## Seeded account

`tests/frontend/mystic_auth/e2e/auth/login_and_logout_browser_flow.spec.ts`
creates a disposable system user inside the Docker backend container before the
real login tests run. The email address is derived from the Playwright project
name, for example `playwright-system-chromium-desktop@example.com`, so desktop
and mobile runs cannot delete each other's account.

The helper removes only those disposable Playwright addresses and the older
`playwright-system@example.com` cleanup address. It does not touch local
developer accounts.

---

## Commands

```bash
npm run test:browser --prefix frontend
npm run test:browser --prefix frontend -- --project=chromium-desktop
npm run test:browser --prefix frontend -- --project=chromium-mobile
npm run test:browser --prefix frontend -- --project=chromium-desktop ../tests/frontend/mystic_auth/e2e/users
```

---

Playwright writes screenshots, traces, and error context only when a test fails.
Generated artifacts such as `frontend/test-results/` are ignored by Git.

---

## CI

`.github/workflows/ci.yml` runs the browser suite in the `docker-build` job after
the dev Compose stack is healthy. That job starts Postgres, Redis, Alembic, the
backend, the frontend, and the Procrastinate worker with `EMAIL_ENABLED=false`.

---

## Coverage

The browser suite covers these UI areas:

1. Login page rendering, local required-field validation, protected-route
  redirect, seeded-user login, OAuth redirect/error behavior, and logout.
1. Signup rendering, password validation, legal links, XSS-safe display, and
  stubbed signup submission.
1. Password reset request, reset-token confirmation, manual-token fallback,
  local password validation, cooldown behavior, and session-revocation warning.
1. Account verification request, token confirmation, success redirect, and
  stubbed email-triggering endpoints.
1. Dashboard layout, main actions, desktop rendering, mobile rendering, mobile
  horizontal-overflow checks, and least-privilege authorization redirect.
1. Account settings tabs, profile edit controls, password form local validation,
  appearance controls, delete-account dialog open/cancel behavior, and mobile
  overflow checks.
1. Account deletion confirmation page, missing-token disabled state, token
  redemption through a stubbed endpoint, and login redirect.
1. Users table, pagination, search, filters, row actions, row dialogs, bulk
  action dialogs, least-privilege authorization redirect, and escaped rendering
  of attacker-like user names and emails.
1. Policies list, filters, create/edit/delete dialogs, validation behavior,
  cancel behavior, and least-privilege authorization redirect.
1. Permissions list, filters, permission details, and least-privilege
  authorization redirect.
1. Audit log tabs, filters, pagination, detail visibility, and least-privilege
  authorization redirect.
1. Rate limits list, filters, pagination, reset dialog open/cancel behavior, and
  least-privilege authorization redirect.
1. App shell sidebar, navbar controls, command palette, theme toggle, language
  control, font-size control, responsive menu, keyboard shortcut behavior, and
  Escape handling.
1. Legal pages, status pages, not-found routing, and not-authorized routing.

Destructive flows are limited to dialog open/cancel and local validation unless
the data is a disposable Playwright account created by the test.

---
