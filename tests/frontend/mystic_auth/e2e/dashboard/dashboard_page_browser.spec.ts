import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("dashboard page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("main actions and layout render at desktop and mobile sizes", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Playwright System" })).toBeVisible();
    await expect(page.getByRole("button", { name: /account settings/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /logout all/i })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Playwright System" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
