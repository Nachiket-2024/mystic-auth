// Automated WCAG 2.1 AA accessibility scan (axe-core) across the app's main
// pages, both pre-auth and authenticated. Runs against the same stubbed API
// routes the rest of the browser suite uses, not a live backend - this
// checks markup/ARIA/contrast, not data correctness (that's every other
// spec in this suite). See docs/mystic_auth/testing/browser-e2e.md.
import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoAccessibilityViolations } from "../support/axeCheck";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("accessibility - pre-auth pages", () => {
  test("login page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("signup page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});

test.describe("accessibility - authenticated pages", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("dashboard has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Playwright System" })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("users page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: /users/i })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("policies page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/policies");
    await expect(page.getByRole("heading", { name: /policies/i })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("permissions page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/permissions");
    await expect(page.getByRole("heading", { name: /permissions/i })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("rate limits page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/rate-limits");
    await expect(page.getByRole("heading", { name: /rate limits/i })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("audit log page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/audit-log");
    await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("account settings page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/account-settings");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});
