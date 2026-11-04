# Manual accessibility acceptance checklist
---

Automated axe scans are required regression coverage, but they cannot verify
announcement quality, reading order, or every keyboard interaction. Run this
checklist before a public release and after substantial changes to shared UI.
Record the browser, assistive technology, date, and defects found.

---

## What is already checked automatically

- The Playwright axe scan covers common markup, contrast and ARIA problems.
- The Chromium keyboard pass covers focus into and out of dialogs, Escape handling, route controls and focus-visible styles.
- The browser accessibility tree (what a screen reader receives) was dumped and checked on the login, signup, password-reset, legal, dashboard, users, account-settings, audit-log, policies and permissions pages: every interactive control has an accessible name, each page has one `h1`, a `main` landmark and a language, and every data table has an accessible name (`DataTable` takes an `ariaLabel`).

Nobody has listened to a screen reader read the app, so announcement quality and reading order are unverified and the passes below are still manual. This is not a claim of full WCAG conformance.

## Keyboard-only pass

- [ ] Reach signup, login, password reset, and OAuth controls with `Tab` and `Shift+Tab`.
- [ ] Every focused control has a visible focus indicator with sufficient contrast.
- [ ] No focus is trapped in the page shell, navigation, table, drawer, or dialog.
- [ ] Dialogs move focus in, keep focus inside, close with `Escape`, and return focus to the trigger.
- [ ] Visually available actions activate with `Enter` or `Space` as appropriate.
- [ ] Tables, tabs, pagination, filters, and sort controls have an understandable keyboard order.
- [ ] Error messages and validation results are reachable without restarting the flow.
- [ ] At 200% zoom and narrow width, no content or controls disappear.

---

## Screen-reader pass

Run at least one Chromium or Firefox flow with a supported screen reader. On
Linux, Orca is the documented option; VoiceOver and NVDA are also valid.

- [ ] Signup and login announce labels, required fields, errors, and submit state.
- [ ] Password reset and account deletion confirmation communicate the action and outcome.
- [ ] Navigation announces the current page and expanded/collapsed state where applicable.
- [ ] Dialog title, description, controls, and close action are announced in a useful order.
- [ ] Tabs announce selected state and their associated panel.
- [ ] Loading, success, and failure updates are announced without stealing focus.
- [ ] Tables expose meaningful headers and row actions; icon-only controls have names.
- [ ] A control's spoken name contains its visible text (WCAG 2.5.3). Prefer letting the visible text name the control and put extra detail in `aria-description` instead of an `aria-label` that replaces it.
- [ ] The page has one useful main heading and landmarks are not duplicated or misleading.

Do not mark this checklist complete based only on the Playwright axe suite.

---
