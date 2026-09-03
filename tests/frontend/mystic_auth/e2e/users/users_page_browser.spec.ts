import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow, expectXssNotExecuted } from "../support/browserLayoutAssertions";
import { installAuthenticatedMysticAuthApiRoutes, leastPrivilegeProfile } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("users page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("table, pagination, search, filters, row dialogs, bulk dialogs, and XSS escaping work", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: /users/i })).toBeVisible();
    await expect(page.getByTitle("attacker+<script>@example.com")).toBeVisible();
    await expectXssNotExecuted(page);
    await expect(page.getByRole("button", { name: /next page/i }).first()).toBeEnabled();

    const searchInput = page.getByPlaceholder(/search by name or email/i);
    await searchInput.fill("<script>alert(1)</script>");
    await expectXssNotExecuted(page);
    await searchInput.fill("");

    await page.getByRole("button", { name: /^view$/i }).nth(1).click();
    await expect(page.getByText(/user details/i)).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.getByRole("button", { name: /^policies$/i }).first().click();
    await expect(page.getByRole("dialog", { name: /policies for/i })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    const userRowCheckbox = page.getByRole("checkbox", { name: /select row/i }).nth(1);
    await userRowCheckbox.focus();
    await page.keyboard.press("Space");
    await expect(userRowCheckbox).toBeChecked();
    for (const action of [/assign \/ revoke policy/i, /grant \/ revoke permission/i, /set role/i]) {
      await page.getByRole("button", { name: action }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: /cancel|close/i }).first().click();
    }

    await page.locator('select[aria-label="Filter by role"]').selectOption("user");
    await page.locator('select[aria-label="Filter by verified status"]').selectOption("false");
    await expectNoHorizontalOverflow(page);
  });

  test("least-privileged users cannot directly open the users page", async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page, leastPrivilegeProfile);
    await page.goto("/users");
    await expect(page).toHaveURL(/\/not-authorized$/);
  });
});
