# Documentation

Documentation for this full-stack template, organized by feature/domain to mirror the actual code layout (`backend/mystic_auth/<domain>/`, `frontend/src/mystic_auth/<domain>/`). If something here disagrees with the code, the code wins, so file an issue or update the doc.

This is the template's own reference documentation, belonging to upstream and not yours to edit. Your own project's docs go in [`docs/app/`](../app/README.md) instead, so they never conflict with a future `scripts/upstream-sync/sync-upstream.sh` run. See [Using This Repository as a Template: the `app/` + `mystic_auth/` split](template-usage/overview.md#the-app--mystic_auth-split) for the full reasoning.

## Architecture

- [System Overview](architecture/system-overview.md): whole-stack component diagram, why the stack is split this way, request lifecycle
- [Backend Architecture](architecture/backend.md): `backend/mystic_auth/` module layout, request pipeline, middleware
- [Frontend Architecture](architecture/frontend.md): `frontend/src/mystic_auth/` module layout, state management, routing, theming

---

## Authentication

- [Authentication Overview](authentication/overview.md): JWT/cookie mechanics, refresh-token rotation, current-session lookups, and links to every flow below
- [Signup and Email Verification](authentication/signup-and-verification.md): account creation, verification token issue/redeem, resend
- [Login](authentication/login.md): rate limiting, brute-force lockout, timing-attack resistance
- [Logout and Logout-All](authentication/logout.md): single-device vs. whole-account session termination, idempotency
- [Password Reset and Password Change](authentication/password-reset.md): forgot-password flow, self-service and admin password change
- [Session Management](authentication/session-management.md): active-session tracking, refresh-token rotation mirror, dashboard card behavior, revoke edge cases
- [Account Deletion and Purge](authentication/account-deletion.md): self-service delete (password re-confirm and OAuth email-confirm paths), admin delete/reactivate/purge, and the scheduled grace-period purge job
- [OAuth2 / PKCE](authentication/oauth2-pkce.md): Google OAuth2 login flow, PKCE code-challenge mechanics, CSRF state protection
- [System Superuser: Bootstrapping and Promotion](authentication/system-superuser.md): `create_system_user.py`'s full behavior, covering fresh creation, promoting an existing account, and the Google-only-account special case

---

## Authorization (PBAC)

- [Architecture Overview](authorization/architecture.md): request flow, component responsibilities, integration points
- [Policy JSON Examples](authorization/policy-examples.md): basic, conditioned, superuser, and self-service policies
- [RBAC Quickstart](authorization/rbac-quickstart.md): plain role-shaped access (no conditions) using the same policies, for projects that don't need PBAC's full generality
- [Common Patterns](authorization/common-patterns.md): modeling common access shapes (e.g. org-chart/company-group hierarchies) on top of PBAC's existing condition types
- [Condition Schema Reference](authorization/condition-schema-reference.md): every supported condition type, field-by-field
- [Adding New Permissions](authorization/adding-permissions.md): extending the action vocabulary
- [Adding New Condition Handlers](authorization/adding-condition-handlers.md): extending the condition framework
- [Writing and Testing Policies](authorization/writing-testing-policies.md): policy lifecycle, local testing, unit test patterns
- [Operational Troubleshooting Guide](authorization/troubleshooting.md): common issues, logging, Redis/DB debugging

---

## Database

- [Database Design](database/design.md): schema, foreign keys, account lifecycle (soft delete/purge/reactivate)

---

## API

- [API Reference](api/reference.md): route inventory grouped by domain, request/response shapes, auth requirements

---

## Background Email Delivery

- [Background Email Delivery](background-workers/procrastinate.md): Procrastinate worker setup, Postgres-backed job queue, backoff retries, failure handling

---

## Security

- [Security Decisions](security/decisions.md): index of the *why* behind non-obvious security choices, plus known accepted gaps, split into [Auth & Session](security/decisions-auth.md), [Infrastructure](security/decisions-infra.md), and [Product](security/decisions-product.md)
- [Security Hardening](security/hardening.md): rate limiting, lockout, security headers, CORS, cookie flags, consolidated
- [SECURITY.md](../../SECURITY.md): how to report a vulnerability privately (not via a public GitHub Issue)

---

## Error Monitoring

- [Error Monitoring](error-monitoring/overview.md): enabled-by-default backend/frontend error reporting via the Sentry SDK protocol; self-hosted Bugsink quickstart and what gets reported

---

## Geolocation

- [Session Geolocation](geolocation/overview.md): off-by-default IP-to-city/country resolution for Manage Sessions' Location column; MaxMind GeoLite2 account/license-key setup, Docker vs. non-Docker

---

## Translations

- [Translations Overview](translations/overview.md): supported languages (English, Hindi, Marathi, Gujarati) and mixed English-chrome modes, translation-store architecture
- [Tutorial: Adding a New Language](translations/adding-a-language.md): step-by-step walkthrough of adding a new language

---

## Testing

- [Testing Overview](testing/overview.md): backend pytest suites, frontend vitest suites, coverage state, how to run

---

## Docker

- [Docker Overview](docker/overview.md): services, Dockerfiles, dev vs. prod compose, healthchecks
- [Docker Validation History](docker/validation-history.md): live-verification passes against the running stack, covering what was run, what it found, what got fixed

---

## CI/CD

- [CI/CD Overview](cicd/overview.md): GitHub Actions workflow, jobs, gaps

---

## Deployment

- [Deployment Guide](deployment/guide.md): shared reference, environment variables, migrations, backups, host requirements
- [Dev Deployment](deployment/dev.md): local development, hot reload, no TLS
- [Local-Prod Deployment](deployment/local-prod.md): self-hosted production image shape exposed via a free Cloudflare Tunnel, no public server needed, with [Quick Tunnel](deployment/quick-tunnel.md) and [Named Tunnel](deployment/named-tunnel.md) walkthroughs
- [Prod Deployment](deployment/prod.md): self-hosted deployment on your own server with Caddy-managed TLS

---

## Concerns, Limitations & Technical Debt

- [Known Issues & Future Improvements](concerns/README.md): tracked limitations, technical debt, deferred security/performance work

---

## Project Story

- [Project Story](project-story/README.md): where this template came from and how it evolved, straight from the commit history
- [The Tools That Built It](project-story/tools.md): the workflows that actually did the work, from manual ChatGPT + VSCode through Claude Code and the first Codex pass

---

## Using This as a Template

- [Template Usage Guide](template-usage/overview.md): for anyone cloning this repo as a starting point for their own auth+PBAC project, covering quickstart, environment configuration, renaming the app, backend customization, OAuth/email setup, adding permissions and protecting routes, replacing the frontend, deployment
- [Frontend Customization](template-usage/frontend-customization.md): theme, pages, routing, state, and the shared-chrome extension points (nav items, navbar content, command palette search, audit log filters)
- [Worked Example: Adding a New Domain, End to End](template-usage/worked-example.md): a copy-and-rename starting point, covering model, schema, router, migration, policy, frontend page, route, and nav link, wired together for one fake domain
- [Staying in Sync with Upstream Template Updates](template-usage/syncing-upstream.md): pulling fixes/features from the original template into your own diverged project, step by step, plus a worked conflict-resolution example

---

## Who this is for

Anyone adding a new protected endpoint, a new permission, a new condition type, or a new policy to this template; anyone integrating a new frontend feature against the API; anyone debugging why an authorization decision or a request came back the way it did; or anyone new to the codebase who needs the system-wide picture before touching auth, authorization, or infrastructure code.

---

## Source of truth

This documentation describes the code as it exists in `backend/mystic_auth/` and `frontend/src/mystic_auth/` at the time of writing. If something here disagrees with the code, the code wins.
