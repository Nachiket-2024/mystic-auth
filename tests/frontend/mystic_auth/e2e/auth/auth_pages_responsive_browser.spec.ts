import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";

test.describe("mystic auth pages responsive browser behavior", () => {
  test("auth pages render without horizontal overflow", async ({ page }) => {
    for (const path of ["/login", "/signup", "/password-reset-request", "/verify-account"]) {
      await page.goto(path);
      await expect(page.locator("#root")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
