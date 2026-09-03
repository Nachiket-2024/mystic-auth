import { expect, test } from "../../../../../frontend/e2e/playwright";
import { deleteBrowserSystemUser, SEEDED_PASSWORD, seedBrowserSystemUser, seededSystemEmail } from "../support/disposableSystemUser";

test.describe("auth and routing in a real browser", () => {
  test("login page renders and blocks empty submissions locally", async ({ page }) => {
    let loginRequests = 0;
    await page.route("**/auth/login", (route) => {
      loginRequests += 1;
      return route.fulfill({ status: 400, json: { detail: "Invalid credentials" } });
    });

    await page.goto("/login");
    await expect(page.getByText(/sign in to continue/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^password$/i })).toBeVisible();

    await page.getByRole("button", { name: /^login$/i }).click();
    expect(loginRequests).toBe(0);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeFocused();
  });

  test("protected routes redirect logged-out users to login", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/sign in to continue/i)).toBeVisible();
  });

  test("logs in with the disposable seeded system user", async ({ page }, testInfo) => {
    const email = seededSystemEmail(testInfo.project.name);
    seedBrowserSystemUser(email);
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /^password$/i }).fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: /^login$/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Playwright System" })).toBeVisible();
  });

  test("logout returns the browser to the login page", async ({ page }, testInfo) => {
    const email = seededSystemEmail(testInfo.project.name);
    seedBrowserSystemUser(email);
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /^password$/i }).fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: /^login$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: /^logout$/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.afterEach(({ page }, testInfo) => {
  void page;
  deleteBrowserSystemUser(seededSystemEmail(testInfo.project.name));
});
