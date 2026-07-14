# Frontend Architecture

## Purpose

React 19 + TypeScript SPA (`frontend/src/`), built with Vite, styled with Chakra UI v3. Feature-organized to mirror the backend's domain split, with a PBAC-aware UI layer that mirrors the backend's permission vocabulary.

## Module layout

| Module | Purpose |
|---|---|
| `auth/` | Login, signup, logout, logout-all, OAuth2, password reset (request/confirm), account verification, current-user session query — each sub-feature is its own folder (Page/Form/mutation-hook/types) |
| `authorization/` | `permissions.ts` — frontend mirror of the backend `Permission` enum |
| `audit_log/` | `AuditLogPage.tsx` — the caller's own PBAC audit trail, plus an "all users" tab for privileged callers |
| `dashboard/` | Landing page after login |
| `policies/` | Admin CRUD UI for PBAC policies |
| `profile/` | Self-service profile view/update |
| `users_admin/` | Admin user management (list, mutate, assign policies) |
| `api/` | Axios-based typed call functions per backend domain, plus error shaping and the auth-refresh interceptor |
| `services/` | `authorizationService.ts` — batch permission-check calls, policy/audit-log fetches |
| `core/` | App-wide settings (`APP_NAME`, `VITE_API_BASE_URL`) |
| `components/` | Shared UI: `layout/` (AppLayout, Navbar, Sidebar, ThemeToggle), `ui/` (DataTable, ConfirmDialog, FormAlert, PasswordRulesChecklist, toaster, LoadingState), plus the PBAC gates `Authorized`, `IfCan`, `ProtectedRoute` |
| `hooks/` | `useAuthorization`/`useCan`, `usePasswordPolicy`, `useUnsavedChangesWarning` |
| `store/` | Zustand: `authStore.ts` (session/profile/permissions), `themeStore.ts`; plus `queryClient.ts` (shared TanStack Query client) |
| `theme/` | `system.ts` — Chakra UI v3 design tokens |

## State management

- **Zustand** for client state — `authStore` (`isAuthenticated`, `name`, `email`, `role`, `permissions`, `hasPassword`) and `themeStore` (light/dark). No Redux, despite what older documentation claimed — see [Concerns](../concerns/README.md).
- **TanStack Query** for all server state/caching, via one shared `QueryClient` (`store/queryClient.ts`).
- `authStore.isAuthenticated` starts as `null` ("not checked yet") — `App.tsx` blocks rendering the router behind a loading screen until `useAuthSession()` resolves it to `true`/`false`, avoiding a flash of unauthenticated content.

## API layer

`api/axiosInstance.ts` — a single Axios instance, `withCredentials: true` (cookie-based session; the JWT itself is never stored in JS-accessible state — see [Authentication Overview](../authentication/overview.md#tokens-and-cookies)), base URL from `VITE_API_BASE_URL`. Per-domain typed call functions live in `api/*.ts` (`auth_api`, `users_api`, `policies_api`, `audit_api`); `api/apiError.ts` shapes error responses uniformly.

`api/setupAuthInterceptor.ts` implements silent-refresh-on-401: a single in-flight refresh call is shared across concurrently-failing requests (no thundering herd of refresh calls), and login/signup/refresh/logout/reset/verify/oauth2 endpoints are excluded from the retry-after-refresh logic to avoid infinite loops. On an unrecoverable 401, it marks `authStore` unauthenticated and clears the cached `GET /auth/me` query. It does not handle `403` — permission failures are left entirely to route/component-level guards (`ProtectedRoute`, `Authorized`, `IfCan`).

## Routing

`react-router-dom` v7, `BrowserRouter`, defined in `App.tsx`. Only `LoginPage` is eager-loaded (the most common unauthenticated entry point); every other route is `React.lazy`-split.

| Route | Access | Notes |
|---|---|---|
| `/`, `/dashboard` | authenticated | `DashboardPage` |
| `/users` | `USERS_LIST_ALL` | Admin user management |
| `/policies` | `POLICIES_READ` | PBAC policy admin |
| `/audit-log` | authenticated (self-service) | "All users" tab gated separately inside the page |
| `/profile` | authenticated | |
| `/login`, `/signup`, `/verify-account`, `/password-reset-request`, `/reset-password` | public | |
| `/not-authorized` | public | 403 landing — where `ProtectedRoute` sends an authenticated-but-unauthorized user |
| `*` | public | 404 |

All protected routes are wrapped in `ProtectedRoute` (redirects unauthenticated → `/login`, unauthorized → `/not-authorized`) and `AppLayout` (sidebar/top-bar shell), so the shell only renders once access is actually confirmed.

## Authorization on the frontend (PBAC-aware UI)

- `authorization/permissions.ts` mirrors the backend's `Permission` enum as string constants, so route/component gates reference `PERMISSIONS.USERS_LIST_ALL` rather than a hand-typed string.
- `hooks/useAuthorization.ts` reads `authStore.permissions` and exposes `can(action)`, failing closed (`false`) when unauthenticated or still loading. This is a **client-side UX convenience only** — the backend independently enforces every action via `require_authorization` (see [PBAC Architecture](../authorization/architecture.md)); a hidden button is not a security boundary.
- `components/ProtectedRoute.tsx`, `Authorized.tsx`, `IfCan.tsx` — route-level and in-page conditional gates built on `useAuthorization`.
- `services/authorizationService.ts` layers real per-resource/conditional checks (`POST /authorization/batch-check`) on top of the cached flat permission list for cases that need it.
- `role` is explicitly treated as metadata only on the frontend too — never used in a gating decision, mirroring the backend's own design (see [Security Decisions: role is never used to decide access](../security/decisions.md#role-is-never-used-to-decide-access)).

## Theming

Chakra UI v3 (`@chakra-ui/react` + Emotion). `theme/system.ts` defines the design tokens; `themeStore.ts` + `components/layout/ThemeToggle.tsx` handle light/dark switching, independent of the OS-level `prefers-color-scheme`.

## Configuration requirements

`frontend/.env.example` — a single variable, `VITE_API_BASE_URL` (the backend's base URL). All other frontend-facing config (app name, support email shown in emails) is backend-driven and returned via API responses, not baked into the frontend build.

## Edge cases / error handling

- A 401 mid-session (expired access token) triggers one silent refresh-and-retry; a second failure marks the session invalid and, per route, redirects to `/login`.
- A 403 (authorization denial) is a normal API response the calling component/page is responsible for handling — typically a toast or an inline `FormAlert`, not a global redirect (except at the route level via `ProtectedRoute`).

## Testing coverage

Tests live in `tests/frontend/` (outside `src/`), not co-located — Vitest + React Testing Library + jsdom + axios-mock-adapter. See [Testing Overview](../testing/overview.md) for the full breakdown and known coverage gaps.
