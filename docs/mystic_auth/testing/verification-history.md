# Test Verification History
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

Dated records of what a verification pass measured. Each entry is what was true on that day, not
current-state reference (for that, see [Testing Overview](overview.md#backend-pytest)). Counts here are
frozen and are not kept in sync with the live suite.

---

## 8 October, 2026 verification

- The backend cumulative coverage audit exceeded the unchanged 90% CI gate. It
  includes the app wrapper, unit, integration, and security suites plus focused tests
  for lifecycle events/tasks, session-event failure paths, app lifecycle,
  token-version models, and login protection. The two advisory performance
  modules remain a separate, non-gating run.
- Frontend Vitest passed 873 tests in 137 files. The measured report was
  97.33% statements, 91.20% branches, 95.71% functions, and 97.96% lines.
  The new unit coverage includes shared UI primitives, font-size state,
  security-log details, and existing theme and segmented-control behavior.
- The browser matrix produced 424 passing checks and 25 intentional skips.
  One WebKit language-selector timeout occurred during the shared-host run;
  the exact test passed when rerun in isolation with one worker.
- The Windows PowerShell setup-env regression is a host-level check. Run it
  from native Windows PowerShell; WSL2's absence of `pwsh` does not mean the
  Windows host lacks PowerShell.
- Backend performance checks remain advisory. The concurrent-login check uses
  a 10-second ceiling for 25 real Argon2 verifications: the previous 5-second
  ceiling produced false alarms on WSL2 and shared GitHub runners even after
  the login path's database connection amplification was fixed.

## 10 October, 2026 verification

- Added backend unit cases for both authorization-maintenance CLIs and `/auth/me`
  error handling, including duplicate-email counts, report filtering, invalid
  tokens, inactive accounts, and safe database/unexpected-error responses. The
  cumulative backend suite passed at 95.07% coverage across 1,044 app-wrapper
  and unit tests, 309 integration tests, and 37 security tests. The CI gate
  remains 90%.
- Added four frontend regressions for app-supplied navbar actions, command-
  palette wiring, chart keyboard tooltips, 90-day label thinning, and
  background-refetch feedback. Vitest passed 882 tests in 138 files with
  97.28% statements, 91.59% branches, 95.53% functions, and 97.96% lines.

## 3 November, 2026 verification

- Added passkey coverage at three levels: unit tests for the step-up rules, origin check, sign-in
  lockout, and request bodies; integration tests for register, sign in, bulk removal, and the Google
  confirmation; and a real-browser spec using Chromium's virtual authenticator. See
  [Backend Authentication Test Detail](backend-authentication.md#passkeys).
- The full backend suite passed 1,514 tests. Frontend Vitest passed 929 tests in 147 files with
  97.90% statements, 93.28% branches, 95.80% functions, and 98.38% lines. The three passkey browser
  tests passed on `chromium-desktop`; WebKit could not launch on the development host, and no
  physical authenticator was used.

---

## See also

- [Testing Overview](overview.md)
- [Testing Map](README.md)
