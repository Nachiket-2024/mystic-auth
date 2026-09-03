import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";
import { installAuthenticatedMysticAuthApiRoutes, leastPrivilegeProfile } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("rate limits page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("filters, pagination, and reset cancel flow work", async ({ page }) => {
    await page.goto("/rate-limits");
    await expect(page.getByRole("heading", { name: /rate limits/i })).toBeVisible();
    await expect(page.getByText("127.0.0.1")).toBeVisible();
    await expect(page.getByRole("button", { name: /next page/i }).first()).toBeEnabled();

    await page.locator('select[aria-label="Filter by endpoint"]').selectOption("login");
    await page.getByRole("textbox", { name: /search by email or ip/i }).fill("attacker");
    await page.locator('select[aria-label="Filter by scope"]').selectOption("email");

    await page.getByRole("button", { name: /^reset$/i }).first().click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test("least-privileged users cannot directly open the rate limits page", async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page, leastPrivilegeProfile);
    await page.goto("/rate-limits");
    await expect(page).toHaveURL(/\/not-authorized$/);
  });
});
