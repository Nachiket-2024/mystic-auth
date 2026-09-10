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

  test("stat tile filter shortcuts, and cancel on delete/purge/role-change dialogs, leave state untouched", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: /users/i })).toBeVisible();

    const roleFilter = page.locator('select[aria-label="Filter by role"]');
    const verifiedFilter = page.locator('select[aria-label="Filter by verified status"]');

    // Each stat tile is a filter shortcut (UserStatsCard.tsx): clicking one
    // applies its filter and clears every other one.
    await page.getByRole("button", { name: "Filter users: Verified" }).click();
    await expect(verifiedFilter).toHaveValue("true");

    await page.getByRole("button", { name: "Filter users: Unverified" }).click();
    await expect(verifiedFilter).toHaveValue("false");

    await roleFilter.selectOption("user");
    await page.getByRole("button", { name: "Filter users: Total users" }).click();
    await expect(roleFilter).toHaveValue("");
    await expect(verifiedFilter).toHaveValue("");

    // Delete: cancel must close the dialog without calling DELETE.
    let deleteCalled = false;
    await page.route("**/users/attacker*", (route) => {
      if (route.request().method() === "DELETE") deleteCalled = true;
      route.continue();
    });
    // .nth(1): the system row's own Delete button (index 0) is disabled
    // (usersColumns.tsx disables it for role === "system"), so the first
    // *enabled* Delete button belongs to the attacker row.
    await page.getByRole("button", { name: "Delete", exact: true }).nth(1).click();
    await expect(page.getByRole("heading", { name: "Delete user" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Delete user" })).not.toBeVisible();
    expect(deleteCalled).toBe(false);
    await expect(page.getByTitle("attacker+<script>@example.com")).toBeVisible();

    // Purge (only offered for the already soft-deleted row): same contract.
    let purgeCalled = false;
    await page.route("**/users/deleted*/purge", (route) => {
      purgeCalled = true;
      route.continue();
    });
    await page.getByRole("button", { name: "Purge" }).click();
    await expect(page.getByRole("heading", { name: "Permanently remove user" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Permanently remove user" })).not.toBeVisible();
    expect(purgeCalled).toBe(false);

    // Role change: cancel must leave the trigger showing the original role.
    // Asserted against the visible trigger (Select.ValueText), not the
    // accessibility-only Select.HiddenSelect node: Playwright's
    // selectOption() sets that hidden native <select>'s DOM value directly,
    // which Chakra's Select doesn't re-sync from since its own `value` prop
    // (still "user", untouched by cancel) never changes across the
    // cancel - what a real user actually sees is the trigger text below.
    const roleTrigger = page.getByRole("combobox", { name: "Change role for attacker+<script>@example.com" });
    await expect(roleTrigger).toHaveText("User");
    await page.locator('select[aria-label="Change role for attacker+<script>@example.com"]').selectOption("admin");
    await expect(page.getByRole("heading", { name: "Change role" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Change role" })).not.toBeVisible();
    await expect(roleTrigger).toHaveText("User");
  });

  test("least-privileged users cannot directly open the users page", async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page, leastPrivilegeProfile);
    await page.goto("/users");
    await expect(page).toHaveURL(/\/not-authorized$/);
  });
});
