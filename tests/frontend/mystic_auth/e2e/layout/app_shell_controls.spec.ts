import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";
import { installAuthenticatedMysticAuthApiRoutes } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("app shell browser controls", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page);
  });

  test("sidebar, navbar, command palette, theme, language, and font controls work", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/dashboard");

    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /open search/i })).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await palette.getByRole("textbox").fill("settings");
    await palette.getByRole("button", { name: /account settings/i }).click();
    await expect(page).toHaveURL(/\/account-settings/);

    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(page.getByRole("button", { name: /switch to light mode/i })).toBeVisible();
    await page.getByRole("combobox", { name: /language/i }).click();
    await expect(page.getByRole("option", { name: "English", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: /font size/i }).click();
    await expect(page.getByRole("option", { name: /large/i })).toBeVisible();
  });

  test("responsive menu opens without horizontal overflow or obvious overlap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /toggle navigation menu/i }).click();
    await expect(page.getByRole("link", { name: /users/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/\/users$/);
  });
});
