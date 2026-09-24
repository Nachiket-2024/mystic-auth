import { expect, test } from "../../../../../frontend/e2e/playwright";
import { installAuthenticatedMysticAuthApiRoutes, leastPrivilegeProfile } from "../support/authenticatedMysticAuthApiRoutes";

test.describe("public landing, legal, and status pages", () => {
  test("landing navigation and skip link have observable keyboard behavior", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /auth & authorization/i })).toBeVisible();

    const skip = page.locator('a[href="#main-content"]');
    await skip.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await page.getByRole("link", { name: /^sign up$/i }).first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/signup$/);
    await page.goBack();
    await page.getByRole("link", { name: /^log in$/i }).first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("display controls change state and close their menus with Escape", async ({ page }) => {
    await page.goto("/");

    const theme = page.getByRole("button", { name: /switch to dark mode|switch to light mode/i });
    const initialThemeLabel = await theme.getAttribute("aria-label");
    await theme.focus();
    await page.keyboard.press("Space");
    await expect(theme).not.toHaveAttribute("aria-label", initialThemeLabel ?? "");

    const fontSize = page.getByRole("combobox", { name: /font size/i });
    await fontSize.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveCSS("font-size", /.+/);

    const language = page.getByRole("combobox", { name: /language/i });
    await language.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option").first()).toBeHidden();
    await expect(language).toBeFocused();
  });

  for (const [path, heading] of [["/privacy", /privacy policy/i], ["/terms", /terms of service/i]] as const) {
    test(`${path} renders all document content and its Back button works`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.locator("p").filter({ hasText: /^Last updated:/i })).toBeVisible();
      const backButtons = page.getByRole("button", { name: /back/i });
      await expect(backButtons).toHaveCount(2);
      await backButtons.first().focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test("fresh legal navigation falls back home and preserves the triggering route", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /terms of service/i }).click();
    await expect(page).toHaveURL(/\/terms$/);
    const back = page.getByRole("button", { name: /back/i }).first();
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("404 buttons navigate home and back using keyboard activation", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    const home = page.getByRole("button", { name: /go home/i });
    await home.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/this-route-does-not-exist");
    const back = page.getByRole("button", { name: /go back/i });
    await back.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("403 actions work for a least-privilege authenticated profile", async ({ page }) => {
    await installAuthenticatedMysticAuthApiRoutes(page, leastPrivilegeProfile);
    await page.goto("/not-authorized");
    await expect(page.getByRole("heading", { name: "403" })).toBeVisible();
    await page.getByRole("button", { name: /go home/i }).click();
    // Authenticated users are sent to the app home, which is the dashboard;
    // the public root intentionally redirects signed-in users there.
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
