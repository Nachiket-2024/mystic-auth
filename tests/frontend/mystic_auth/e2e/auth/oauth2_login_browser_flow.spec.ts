import { expect, test } from "../../../../../frontend/e2e/playwright";

test.describe("oauth2 login browser behavior", () => {
  test("google button navigates to the backend oauth endpoint without an API mutation", async ({ page }) => {
    await page.route("http://localhost:8000/auth/oauth2/login/google", (route) =>
      route.fulfill({ status: 204, body: "" }),
    );

    await page.goto("/login");
    const oauthRequest = page.waitForRequest("http://localhost:8000/auth/oauth2/login/google");
    await page.getByRole("button", { name: /sign in with google/i }).click();
    expect((await oauthRequest).url()).toBe("http://localhost:8000/auth/oauth2/login/google");
  });

  test("oauth error query renders a translated error and is removed from the URL", async ({ page }) => {
    await page.goto("/login?error=OAUTH_STATE_INVALID");
    await expect(page.getByText(/sign-in attempt expired|sign in attempt expired/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
