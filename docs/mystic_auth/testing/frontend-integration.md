# Frontend Integration Tests
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

These tests render a page or a meaningful page section with Testing Library
and controlled API responses. They prove how the frontend combines requests,
loading and error states, dialogs, tables, navigation, and permission gates.
The backend is mocked, so these files prove frontend behavior rather than
server authorization. Real enforcement is covered by backend integration tests
and the real-account browser matrix.

---

## App-owned Vitest tests

- `tests/frontend/app/app_routing.test.tsx` verifies the host application's
  route selection and the boundary between app-owned and MysticAuth routes.
- `tests/frontend/app/app_import_boundary.test.ts` verifies files under
  `frontend/src/app/` import MysticAuth code only through `sdk.ts`,
  `app_sdk.ts` and the shared entry points.
- `tests/frontend/app/legal/legal_pages.test.tsx` verifies legal-page
  rendering and the static/localized content contract.
- `tests/frontend/app/status_pages/status_pages.test.tsx` verifies status,
  not-found, and not-authorized page rendering.

---

## Account settings and sessions

- `mystic_auth/integration/account_settings/account_settings_page.test.tsx`
  verifies settings navigation, profile/password/appearance data, save states,
  and permission-sensitive controls.
- `account_settings/account_settings_tab_persistence.test.tsx` verifies that
  the selected settings tab survives the supported navigation and reload cases.
- `account_settings/appearance_card.test.tsx` verifies appearance choices,
  theme updates, and saving/error feedback.
- `passkeys/passkeys_card.test.tsx` verifies the Passkeys tab: count and last-used
  display, inline rename on blur (Escape reverts), confirm-before-remove, the step-up dialog
  (password, wrong password, Google for accounts without a password) with the blocked action
  retried, the return-from-Google toast, and bulk Remove selected and Remove all.
- `account_deletion/confirm_delete_account_page.test.tsx` verifies valid,
  missing, expired, and invalid deletion-confirmation states.
- `account_deletion/delete_account_card.test.tsx` verifies the destructive
  account-deletion dialog, confirmation requirements, and API failures.
- `active_sessions/active_sessions_card.test.tsx` verifies session listing,
  current-device labeling, revoke actions, empty state, and errors.

---

## Audit log, authentication, and authorization

- `audit_log/audit_log_page.test.tsx` verifies category rendering, query
  loading/error/empty states, details, and scope controls with mocked audit
  responses.
- `audit_log/audit_log_tab_and_filter_persistence.test.tsx` verifies that
  audit category, scope, and filters persist across the supported navigation.
- `auth/auth_flow.test.tsx` verifies authenticated state transitions, logout,
  refresh behavior, and protected navigation.
- `auth/login_page.test.tsx` verifies login form validation, pending state,
  errors, lockout messaging, and successful navigation.
- `auth/password_policy_consistency.test.tsx` verifies the frontend password
  rules match the backend-provided policy contract.
- `authorization/pbac_authorization_flow.test.tsx` verifies permission-driven
  content, fail-closed loading behavior, and protected UI transitions.

---

## Dashboard, permissions, policies, and rate limits

- `dashboard/dashboard_page.test.tsx` verifies dashboard data, statistics,
  identity, quick actions, loading, error, and session controls.
- `permissions/permissions_page_details_and_errors.test.tsx` verifies catalog
  details, missing-data handling, and API error presentation.
- `permissions/permissions_page_filters.test.tsx` verifies permission search,
  category filtering, empty results, and filter state.
- `permissions/permissions_page_groups.test.tsx` verifies grouping and
  expandable permission presentation.
- `policies/policies_page_follow_up_dialog.test.tsx` verifies the follow-up
  dialog after policy mutation and its success/error actions.
- `policies/policies_page_follow_up_guards.test.tsx` verifies that follow-up
  actions are hidden or disabled when the effective grant is insufficient.
- `policies/policies_page_list_and_form.test.tsx` verifies policy listing,
  create/edit forms, validation, and mutation feedback.
- `policies/policies_page_list_controls.test.tsx` verifies policy search,
  filters, sorting, pagination, and empty states.
- `policies/policies_page_status_and_delete.test.tsx` verifies status changes,
  deletion confirmation, protected-policy guards, and errors.
- `rate_limits/rate_limits_page.test.tsx` verifies rate-limit data, account
  email labels and shortened digests, filters, reset behavior, loading/errors, and permission gates.

---

## Users and permission management

- `users/users_page.test.tsx` verifies user listing, filtering, pagination,
  row actions, and page-level permission gates.
- `users/users_page_access_dialog_details.test.tsx` verifies selected-user
  details and effective-access presentation.
- `users/users_page_access_dialog_permissions.test.tsx` verifies direct
  permission grant/revoke controls and their request states.
- `users/users_page_access_dialog_policies.test.tsx` verifies policy assignment
  controls and effective-policy display.
- `users/users_page_access_dialog_policy_actions.test.tsx` verifies action-
  level policy changes and the resulting follow-up state.
- `users/users_page_access_dialog_self_protection.test.tsx` verifies that an
  a permission holder cannot remove the access needed to protect the current user.
- `users/users_page_bulk_actions.test.tsx` verifies selection, confirmation,
  success, partial failure, and refresh for bulk user actions.
- `users/users_page_bulk_permission_actions.test.tsx` verifies bulk direct
  permission assignment and result reporting.
- `users/users_page_bulk_policy_actions.test.tsx` verifies bulk policy
  assignment/removal and result reporting.
- `users/users_page_list_controls.test.tsx` verifies user search, filters,
  sorting, pagination, and empty states.
- `users/users_page_stats_card.test.tsx` verifies user statistics, loading,
  errors, and responsive presentation.

Support modules are not test cases, but they are part of the integration
boundary and explain how the scenarios are made repeatable:

- `permissions/permissionsPageTestSupport.tsx` provides permission-page API
  fixtures and stable render helpers.
- `policies/policiesPageTestSupport.tsx` provides policy-page fixtures and
  common request assertions.
- `policies/policiesPageFollowUpTestSupport.tsx` provides follow-up dialog
  setup and mutation-response helpers.
- `users/userAccessDialogTestSupport.tsx` provides selected-user access
  fixtures and dialog render helpers.

---

## Additional integration tests

- `tests/frontend/mystic_auth/integration/users/user_passkeys_dialog.test.tsx` verifies the operator passkey dialog lists names without credential material and removes one or all after confirmation.
- `tests/frontend/mystic_auth/integration/users/users_page_need_to_know.test.tsx` verifies a caller without `policies:read` sees no policy controls and the page does not request them.
- `tests/frontend/app/legal/legal_policy_parity.test.ts` verifies every language's policy matches the English structure and technical facts.

---

## See also

- [Frontend Test Map](frontend.md)
- [Frontend Unit Tests](frontend-unit.md)
- [Frontend Browser E2E Tests](frontend-e2e.md)
- [Testing Overview](overview.md)

---
