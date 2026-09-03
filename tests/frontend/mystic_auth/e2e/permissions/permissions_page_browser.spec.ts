import { expect, test } from "../../../../../frontend/e2e/playwright";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("permissions page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("list filtering and details dialog work", async ({ page }) => {
    await page.goto("/permissions");
    await expect(page.getByText("users:read_own")).toBeVisible();
    await page.getByPlaceholder(/search by action or description/i).fill("policies");
    await page.locator('select[aria-label="Filter by resource type"]').selectOption("policies");
    await page.getByRole("button", { name: /^view$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("policies:read")).toBeVisible();
  });
});
