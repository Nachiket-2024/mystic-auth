import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("audit log page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("tabs, filters, pagination, and detail visibility work", async ({ page }) => {
    await page.goto("/audit-log");
    await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
    await expect(page.getByTitle("users:list_all")).toBeVisible();
    await expect(page.getByRole("button", { name: /next page/i }).first()).toBeEnabled();
    await page.locator('select[aria-label="Filter by action"]').selectOption("users:list_all");
    await page.locator('select[aria-label="Filter by result"]').first().selectOption("true");

    await page.getByRole("tab", { name: /all users/i }).click();
    await expect(page.getByText("playwright-system@example.com")).toBeVisible();

    await page.getByRole("tab", { name: /security events/i }).click();
    await expect(page.getByTitle("login_success")).toBeVisible();
    await page.locator('select[aria-label="Filter by result"]').last().selectOption("true");
    await page.getByLabel(/filter by ip address/i).fill("127.0.0.1");
    await expectNoHorizontalOverflow(page);
  });
});
