// Opt-in smoke test against a real, already-running deployment (any
// local-prod-* mode or prod) - not the stubbed-API suite the rest of
// tests/frontend/mystic_auth/e2e/ uses. Every request here is real: real
// signup, real login, real navigation, no page.route() interception. See
// docs/mystic_auth/testing/browser-e2e.md#live-deployment-smoke-test.
//
// Skipped entirely unless both LIVE_BASE_URL and LIVE_POSTGRES_CONTAINER
// are set, so it never runs as part of `npm run test:browser` or CI.
//
// Usage:
//   LIVE_BASE_URL=https://your-tunnel-domain \
//   LIVE_POSTGRES_CONTAINER=mystic-auth-local-prod-ngrok-postgres-1 \
//     npx playwright test tests/frontend/mystic_auth/e2e/live/live_deployment_smoke.spec.ts --project=chromium-desktop
//
// LIVE_POSTGRES_CONTAINER must be reachable via `docker exec` from wherever
// this runs (the same host the target stack's containers are on) - this
// test verifies its own throwaway accounts directly in the database rather
// than depending on real email delivery.
import { test, expect } from "../../../../../frontend/e2e/playwright";
import type { BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.LIVE_BASE_URL;
const POSTGRES_CONTAINER = process.env.LIVE_POSTGRES_CONTAINER;
const PASSWORD = "LiveSmokeTest9!";
const XSS_PAYLOAD = "<script>window.__liveSmokeXss = true;</script><img src=x onerror=\"window.__liveSmokeXss = true\">";

test.skip(!BASE_URL || !POSTGRES_CONTAINER, "LIVE_BASE_URL and LIVE_POSTGRES_CONTAINER not set - live smoke test skipped");

function verifyAndFetch(email: string): void {
  execFileSync("docker", [
    "exec", POSTGRES_CONTAINER as string,
    "psql", "-U", "postgres", "-d", "mystic_auth",
    "-c", `UPDATE users SET is_verified=true WHERE email='${email}';`,
  ], { stdio: "pipe" });
}

function deleteUser(email: string): void {
  execFileSync("docker", [
    "exec", POSTGRES_CONTAINER as string,
    "psql", "-U", "postgres", "-d", "mystic_auth",
    "-c", `DELETE FROM users WHERE email='${email}';`,
  ], { stdio: "pipe" });
}

async function signupAndLogin(context: BrowserContext, email: string, name: string) {
  const page = await context.newPage();
  await page.request.post(`${BASE_URL}/auth/signup`, {
    data: { email, name, password: PASSWORD, password_confirm: PASSWORD },
  });
  verifyAndFetch(email);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 });
  return page;
}

test.describe("live deployment smoke test - real requests, no stubs", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const email = `live-smoke-${stamp}@example.com`;

  test.afterAll(() => {
    deleteUser(email);
  });

  test("real signup -> DB verify -> login reaches an authenticated page", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" } });
    const page = await signupAndLogin(context, email, "Live Smoke Test");
    expect(page.url()).not.toContain("/login");
    await context.close();
  });

  test("stored XSS payload in display name renders inert, not executed", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" } });
    const page = await signupAndLogin(context, email, "Live Smoke Test");

    await page.request.put(`${BASE_URL}/users/me`, {
      data: { name: XSS_PAYLOAD },
      headers: { "Content-Type": "application/json" },
    });

    for (const path of ["/dashboard", "/account-settings"]) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForTimeout(1000);
      const fired = await page.evaluate(() => (window as unknown as { __liveSmokeXss?: boolean }).__liveSmokeXss ?? false);
      expect(fired, `XSS payload executed on ${path}`).toBe(false);
    }
    await context.close();
  });

  test("every admin-only route redirects a non-admin visitor away", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" } });
    const page = await signupAndLogin(context, email, "Live Smoke Test");

    for (const route of ["/users", "/policies", "/permissions", "/rate-limits"]) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForTimeout(1000);
      expect(page.url(), `${route} did not redirect a non-admin away`).toContain("not-authorized");
    }
    await context.close();
  });

  test("dashboard has no horizontal overflow at mobile width", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" },
      viewport: { width: 390, height: 844 },
    });
    const page = await signupAndLogin(context, email, "Live Smoke Test");
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(500);
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    expect(overflowing).toBe(false);
    await context.close();
  });
});
