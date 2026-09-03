import { expect, test } from "../../../../../frontend/e2e/playwright";
import { expectNoHorizontalOverflow } from "../support/browserLayoutAssertions";
import { fulfillUnauthenticatedAuthJson } from "../support/unauthenticatedAuthApiResponses";

test.describe("password reset browser behavior", () => {
  test("reset request posts only to the stubbed reset endpoint and starts cooldown", async ({ page }) => {
    let resetRequests = 0;
    await page.route("http://localhost:8000/auth/password-reset/request", async (route) => {
      resetRequests += 1;
      expect(route.request().postDataJSON()).toEqual({ email: "reset-browser@example.com" });
      return fulfillUnauthenticatedAuthJson(route, { message: "Password reset link sent." });
    });

    await page.goto("/password-reset-request");
    await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("textbox", { name: /^email$/i }).fill("reset-browser@example.com");
    await page.getByRole("button", { name: /request password reset/i }).click();

    await expect(page.getByText(/password reset link sent/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /try again in/i })).toBeDisabled();
    expect(resetRequests).toBe(1);
  });

  test("reset confirmation validates locally and redeems URL tokens through the stubbed endpoint", async ({ page }) => {
    let confirmRequests = 0;
    await page.route("http://localhost:8000/auth/password-reset/confirm", async (route) => {
      confirmRequests += 1;
      expect(route.request().postDataJSON()).toEqual({ token: "reset-token", new_password: "ValidPass123" });
      return fulfillUnauthenticatedAuthJson(route, { message: "Password reset.", sessions_revoked: true });
    });

    await page.goto("/reset-password?token=reset-token");
    await page.getByRole("textbox", { name: /^new password$/i }).fill("ValidPass123");
    await page.getByRole("textbox", { name: /^confirm new password$/i }).fill("Different123");
    await page.getByRole("button", { name: /^reset password$/i }).click();
    expect(confirmRequests).toBe(0);
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();

    await page.getByRole("textbox", { name: /^confirm new password$/i }).fill("ValidPass123");
    await page.getByRole("button", { name: /^reset password$/i }).click();
    await expect(page.getByText(/^password reset\.$/i)).toBeVisible();
    expect(confirmRequests).toBe(1);
  });

  test("reset confirmation supports manual token entry when the URL has no token", async ({ page }) => {
    await page.route("http://localhost:8000/auth/password-reset/confirm", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ token: "manual-token", new_password: "ValidPass123" });
      return fulfillUnauthenticatedAuthJson(route, { message: "Password reset.", sessions_revoked: false });
    });

    await page.goto("/reset-password");
    await page.getByRole("textbox", { name: /reset token/i }).fill("manual-token");
    await page.getByRole("textbox", { name: /^new password$/i }).fill("ValidPass123");
    await page.getByRole("textbox", { name: /^confirm new password$/i }).fill("ValidPass123");
    await page.getByRole("button", { name: /^reset password$/i }).click();
    await expect(page.getByText(/couldn't sign out your other sessions/i)).toBeVisible();
  });
});
