import { expect, test } from "../../../../../frontend/e2e/playwright";
import {
  ageBrowserSessions,
  deleteBrowserSystemUser,
  seedBrowserPasskeyRows,
  SEEDED_PASSWORD,
  seedBrowserSystemUser,
  seededSystemEmail,
} from "../support/disposableSystemUser";

test.describe("passkey browser behavior", () => {
  test("registers, signs in with, and manages a real browser credential", async (
    { page, browserName },
    testInfo,
  ) => {
    test.skip(
      browserName !== "chromium" || testInfo.project.name !== "chromium-desktop",
      "The virtual WebAuthn authenticator uses Chromium CDP and runs once on desktop.",
    );

    const email = seededSystemEmail(`${testInfo.project.name}-passkey`);
    seedBrowserSystemUser(email);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    try {
      await page.goto("/login");
      await page.getByRole("textbox", { name: /email/i }).fill(email);
      await page.getByRole("textbox", { name: /^password$/i }).fill(SEEDED_PASSWORD);
      await page.getByRole("button", { name: /^log in$/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto("/account-settings?tab=passkeys");
      await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
      await page.getByLabel("Device label").first().fill("Playwright laptop");
      await page.getByRole("button", { name: "Add a passkey" }).click();
      await expect(page.getByText("1 passkey registered")).toBeVisible();

      await page.getByRole("button", { name: /^logout$/i }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.getByRole("button", { name: "Sign in with a passkey" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { name: "Playwright System" })).toBeVisible();

      await page.goto("/account-settings?tab=passkeys");
      const nameField = page.getByLabel("Rename Playwright laptop");
      await nameField.fill("Renamed laptop");
      await nameField.press("Enter");
      await expect(page.getByLabel("Rename Renamed laptop")).toHaveValue("Renamed laptop");

      await page.getByRole("button", { name: "Remove Renamed laptop" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByText("No passkeys have been added.")).toBeVisible();
    } finally {
      if (!page.isClosed()) await cdp.detach();
    }
  });
});

test.describe("passkey step-up confirmation", () => {
  test("asks for identity after the window lapses, then unlocks changes without logging out", async (
    { page, browserName },
    testInfo,
  ) => {
    test.skip(
      browserName !== "chromium" || testInfo.project.name !== "chromium-desktop",
      "The virtual WebAuthn authenticator uses Chromium CDP and runs once on desktop.",
    );

    const email = seededSystemEmail(`${testInfo.project.name}-passkey-stepup`);
    seedBrowserSystemUser(email);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    const login = async () => {
      await page.goto("/login");
      await page.getByRole("textbox", { name: /email/i }).fill(email);
      await page.getByRole("textbox", { name: /^password$/i }).fill(SEEDED_PASSWORD);
      await page.getByRole("button", { name: /^log in$/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    };

    try {
      const dialog = page.getByRole("dialog", { name: "Confirm it's you" });
      const logoutAndLogin = async () => {
        await page.getByRole("button", { name: /^logout$/i }).click();
        await expect(page).toHaveURL(/\/login$/);
        await login();
        await page.goto("/account-settings?tab=passkeys");
      };
      const add = async (label: string) => {
        await page.getByLabel("Device label").first().fill(label);
        await page.getByRole("button", { name: "Add a passkey" }).click();
      };
      const remove = async (label: string) => {
        await page.getByRole("button", { name: `Remove ${label}` }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
      };

      // A WebAuthn authenticator refuses to enrol the same account twice
      // (excludeCredentials), so each add below happens only while the server
      // holds no credential for this authenticator.
      await login();
      await page.goto("/account-settings?tab=passkeys");

      // 1. A fresh login is itself the confirmation: no dialog.
      await add("First key");
      await expect(page.getByText("1 passkey registered")).toBeVisible();
      await expect(dialog).toBeHidden();

      // 2. Window lapsed: removal asks. A wrong password is rejected in place,
      //    the right one runs the blocked removal by itself, still signed in.
      ageBrowserSessions(email, 20);
      await remove("First key");
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Account password").fill("definitely-wrong");
      await dialog.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog.getByText("Current password is incorrect")).toBeVisible();
      await expect(page.getByText("1 passkey registered")).toBeVisible();
      await dialog.getByLabel("Account password").fill(SEEDED_PASSWORD);
      await dialog.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("No passkeys have been added.")).toBeVisible();

      // 3. Inside the 15-minute window: no second prompt.
      await add("Second key");
      await expect(page.getByText("1 passkey registered")).toBeVisible();
      await expect(dialog).toBeHidden();

      // 4. New session, lapsed again: confirm with a passkey tap instead.
      await logoutAndLogin();
      ageBrowserSessions(email, 20);
      await remove("Second key");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Use a passkey instead" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("No passkeys have been added.")).toBeVisible();

      // 5. A blocked *add* is retried automatically after confirming.
      await logoutAndLogin();
      ageBrowserSessions(email, 20);
      await add("Third key");
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Account password").fill(SEEDED_PASSWORD);
      await dialog.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("1 passkey registered")).toBeVisible();
    } finally {
      if (!page.isClosed()) await cdp.detach();
    }
  });
});

test.describe("passkey bulk removal", () => {
  test("removes selected passkeys, then all, with step-up when the login is old", async ({ page, browserName }, testInfo) => {
    test.skip(
      browserName !== "chromium" || testInfo.project.name !== "chromium-desktop",
      "Runs once on desktop Chromium against the shared dev backend.",
    );
    const email = seededSystemEmail(`${testInfo.project.name}-passkey-bulk`);
    seedBrowserSystemUser(email);
    seedBrowserPasskeyRows(email, 4);

    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /^password$/i }).fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/account-settings?tab=passkeys");
    await expect(page.getByText("4 passkeys registered")).toBeVisible();

    // Remove selected: nothing is selected yet, so the action is disabled.
    const removeSelected = page.getByRole("button", { name: "Remove selected" });
    await expect(removeSelected).toBeDisabled();
    const boxes = page.getByRole("checkbox");
    await boxes.nth(1).check();
    await boxes.nth(2).check();
    await expect(page.getByText("2 selected")).toBeVisible();
    await removeSelected.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove selected" }).click();
    await expect(page.getByText("2 passkeys registered")).toBeVisible();

    // Old login: Remove all needs confirmation of identity, then completes by itself.
    ageBrowserSessions(email, 20);
    await page.getByRole("button", { name: "Remove all" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove all" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Account password").fill(SEEDED_PASSWORD);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("No passkeys have been added.")).toBeVisible();
  });
});

test.afterEach(({ page }, testInfo) => {
  void page;
  if (testInfo.project.name !== "chromium-desktop") return;
  deleteBrowserSystemUser(seededSystemEmail(`${testInfo.project.name}-passkey`));
  deleteBrowserSystemUser(seededSystemEmail(`${testInfo.project.name}-passkey-stepup`));
  deleteBrowserSystemUser(seededSystemEmail(`${testInfo.project.name}-passkey-bulk`));
});
