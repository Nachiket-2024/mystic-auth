import { expect, test } from "../../../../../frontend/e2e/playwright";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("policies page browser behavior", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("filters and create, edit, delete dialog cancel behavior work", async ({ page }) => {
    await page.goto("/policies");
    await expect(page.getByText("self_service")).toBeVisible();
    await page.getByPlaceholder(/search by name or description/i).fill("policy_admin");
    await page.locator('select[aria-label="Filter by resource type"]').selectOption("policies");
    await page.locator('select[aria-label="Filter by status"]').selectOption("true");

    await page.getByRole("button", { name: /create policy/i }).click();
    await page.getByRole("button", { name: /create policy/i }).last().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /close dialog/i }).click();

    await page.getByRole("button", { name: /^edit$/i }).first().click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("textbox", { name: /^name$/i })).toHaveValue("self_service");
    await editDialog.getByRole("button", { name: /cancel/i }).click();

    await page.getByRole("button", { name: /^delete$/i }).first().click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
  });
});
