import { expect, test } from "../../../../../frontend/e2e/playwright";

test.describe("app landing page browser behavior", () => {
  test("landing page renders and keeps auth actions reachable", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/MysticAuth/);
    await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i }).first()).toBeVisible();
  });
});
