#!/usr/bin/env node
// Measures Interaction to Next Paint (INP) for a signed-in session.
//
// Lighthouse's navigation mode never reports INP because it makes no real
// interactions. This script signs in, then taps through the app under mobile
// emulation (4x CPU slowdown, Fast-3G-like network) and reads the metric from
// the same `web-vitals` library Chrome's own tooling is based on.
//
// For a number that means something, serve the PRODUCTION build and make sure
// the backend allows that origin, for example:
//   cd frontend && npm run build && npx vite preview --host localhost --port 5173
// Against `npm run dev` the script still runs, but dev bundles are slower, so
// treat that as a smoke test only.
//
// Usage (from the repo root; the account needs the permissions of the pages it
// visits, otherwise those steps are reported as "(skipped)"):
//   INP_EMAIL=you@example.com INP_PASSWORD='...' \
//     node scripts/mystic_auth/performance/measure-inp.mjs
//
// Optional: INP_PROFILE=desktop (see below), INP_BASE_URL (default http://localhost:5173), INP_API_URL (default
// http://localhost:8000), INP_RUNS (default 3).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const requireFromFrontend = createRequire(path.join(repoRoot, "frontend", "package.json"));
const { chromium } = requireFromFrontend("playwright-core");
// The package's "exports" map hides dist/, so read the browser build by path.
const webVitalsSource = fs.readFileSync(path.join(repoRoot, "frontend", "node_modules", "web-vitals", "dist", "web-vitals.iife.js"), "utf8");

const BASE = process.env.INP_BASE_URL ?? "http://localhost:5173";
const API = process.env.INP_API_URL ?? "http://localhost:8000";
const RUNS = Number(process.env.INP_RUNS ?? 3);
// "mobile" (default): phone viewport, 4x CPU slowdown, Fast-3G-like network.
// "desktop": 1440x900, no throttling, for admin-style pages used on laptops.
const DESKTOP = process.env.INP_PROFILE === "desktop";
const { INP_EMAIL: email, INP_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("Set INP_EMAIL and INP_PASSWORD.");
  process.exit(2);
}

// Runs inside the page: records every slow interaction with a phase breakdown.
function observeInteractions() {
  window.__inp = null;
  window.__step = "load";
  window.__events = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.interactionId && e.name === "click") {
        window.__events.push({
          step: window.__step,
          duration: Math.round(e.duration),
          inputDelay: Math.round(e.processingStart - e.startTime),
          processing: Math.round(e.processingEnd - e.processingStart),
          presentation: Math.round(e.startTime + e.duration - e.processingEnd),
        });
      }
    }
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
  window.addEventListener("DOMContentLoaded", () => {
    webVitals.onINP((metric) => { window.__inp = metric.value; }, { reportAllChanges: true });
  });
}

async function measureOnce() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: DESKTOP ? { width: 1440, height: 900 } : { width: 412, height: 915 },
      isMobile: !DESKTOP,
      hasTouch: !DESKTOP,
    });
    const login = await context.request.post(`${API}/auth/login`, { data: { email, password }, headers: { Origin: BASE } });
    if (!login.ok()) throw new Error(`Sign-in failed with HTTP ${login.status()}`);

    const page = await context.newPage();
    // One script, so the observer can see the `webVitals` global defined above it.
    await page.addInitScript({ content: `${webVitalsSource};(${observeInteractions.toString()})();` });
    const cdp = await context.newCDPSession(page);
    if (!DESKTOP) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }

    const skipped = [];
    const step = async (name, action) => {
      await page.evaluate((n) => { window.__step = n; }, name);
      try {
        await action();
        await page.waitForTimeout(700);
      } catch {
        skipped.push(name);
      }
    };

    // "load" plus a fixed settle time, not "networkidle": under the emulated
    // network a long-polling or slow page may never go idle.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(5000);
    await step("open navigation menu", () => page.getByRole("button", { name: /menu|navigation/i }).first().click({ timeout: 3000 }));
    await step("go to users", async () => {
      await page.getByRole("link", { name: /users/i }).first().click({ timeout: 3000 });
      await page.waitForURL(/users/, { timeout: 8000 });
      await page.waitForTimeout(2500);
    });
    await step("type in search", async () => {
      const box = page.getByRole("searchbox").or(page.getByRole("textbox")).first();
      await box.click({ timeout: 3000 });
      await box.pressSequentially("a", { delay: 80 });
    });
    await step("row actions menu", async () => {
      await page.getByRole("button", { name: /more actions/i }).first().click({ timeout: 4000 });
      await page.keyboard.press("Escape");
    });
    await step("open access dialog", async () => {
      await page.getByRole("button", { name: /view|details/i }).first().click({ timeout: 4000 });
      await page.waitForTimeout(1200);
      await page.keyboard.press("Escape");
    });
    await step("theme toggle", () => page.getByRole("button", { name: /switch to (dark|light) mode/i }).first().click({ timeout: 3000 }));
    await step("language menu", async () => {
      await page.locator("button:has(svg.lucide-languages)").first().click({ timeout: 3000 });
      await page.keyboard.press("Escape");
    });

    // INP is finalised when the page is hidden.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);
    return { inp: Math.round(await page.evaluate(() => window.__inp)), skipped, events: await page.evaluate(() => window.__events) };
  } finally {
    await browser.close();
  }
}

const results = [];
for (let run = 1; run <= RUNS; run += 1) results.push(await measureOnce());
const values = results.map((r) => r.inp).filter(Number.isFinite).sort((a, b) => a - b);
console.log(JSON.stringify({ base: BASE, runs: RUNS, inpMs: values, medianMs: values[Math.floor(values.length / 2)], results }, null, 2));
const skipped = [...new Set(results.flatMap((r) => r.skipped))];
if (skipped.length) console.error(`Skipped steps (page or control not available to this account): ${skipped.join(", ")}`);
