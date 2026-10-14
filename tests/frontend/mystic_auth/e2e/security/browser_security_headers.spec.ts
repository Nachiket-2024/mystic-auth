import { expect, test } from "../../../../../frontend/e2e/playwright";

test("browser security headers are present and framing is blocked", async ({ page }) => {
  const frameViolations: string[] = [];
  page.on("console", (message) => {
    if (/frame-ancestors|Refused to frame/i.test(message.text())) {
      frameViolations.push(message.text());
    }
  });

  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  const headers = await response!.allHeaders();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["permissions-policy"]).toBeTruthy();
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = `${window.location.origin}/login`;
    document.body.append(frame);
  });
  await expect.poll(() => frameViolations.length).toBeGreaterThan(0);
  expect(frameViolations.join("\n")).toContain("frame-ancestors");
});

test("opening a Radix dropdown (combobox) does not fire a CSP style-src violation", async ({ page }) => {
  // Regression for F-003 (2026-10-14 audit): Radix UI primitives inject a
  // computed, per-render <style> element and/or inline style="" attribute
  // for runtime positioning when a dropdown/popover opens. The strict
  // hash-only style-src CSP has no fixed value to allowlist for either, so
  // every dropdown interaction on every page used to fire a
  // securitypolicyviolation the instant it mounted. Confirmed live that the
  // actual violated directive is style-src-elem (an injected <style> tag),
  // not style-src-attr as console text alone suggests - this listens for
  // the real SecurityPolicyViolationEvent, not just console text, to catch
  // either directive regressing.
  const violations: Array<{ violatedDirective: string; blockedURI: string }> = [];
  await page.exposeBinding("__reportCspViolation", (_source, detail) => {
    violations.push(detail);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      // @ts-expect-error - exposed by exposeBinding above, not a DOM type
      window.__reportCspViolation({
        violatedDirective: e.violatedDirective,
        blockedURI: e.blockedURI,
      });
    });
  });

  await page.goto("/login");
  await page.getByRole("combobox", { name: "Language" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Font size" }).click();
  await page.keyboard.press("Escape");

  expect(violations).toEqual([]);
});
