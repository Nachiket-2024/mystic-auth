// Lighthouse user flow: one navigation step plus one timespan step that taps
// through the app, so Lighthouse itself reports Interaction to Next Paint
// (navigation mode alone never does). Uses real DevTools throttling with the
// mobile profile (4x CPU, ~1.6 Mbps, 150 ms RTT).
//
// Lighthouse and puppeteer-core are deliberately NOT repo dependencies (a big
// tree for an occasional measurement). Install them next to a copy of this
// file, then run it from there:
//
//   mkdir /tmp/lh && cd /tmp/lh && npm init -y && npm install lighthouse puppeteer-core
//   cp <repo>/scripts/mystic_auth/performance/lighthouse-flow.mjs .
//   CHROME=/path/to/chrome E=you@example.com P='password' node lighthouse-flow.mjs
//
// CHROME is any Chrome/Chromium binary (for example Playwright's, under
// ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome). Serve the
// PRODUCTION build first (cd frontend && npm run build && npx vite preview
// --host localhost --port 5173) and use an account that can open the Users
// page; steps it cannot perform are reported in "taps" as "(not found)".
// BASE_URL and API_URL override the localhost defaults.
import puppeteer from "puppeteer-core";
import { startFlow } from "lighthouse";

const BASE = process.env.BASE_URL ?? "http://localhost:5173", API = process.env.API_URL ?? "http://localhost:8000";
const { E: email, P: password, CHROME: executablePath } = process.env;
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.evaluate(async (api, e, p) => {
  const r = await fetch(`${api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: e, password: p }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
}, API, email, password);

const config = {
  extends: "lighthouse:default",
  settings: {
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 915, deviceScaleFactor: 2.625, disabled: false },
    throttlingMethod: "devtools",
    throttling: { rttMs: 150, throughputKbps: 1638.4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675, cpuSlowdownMultiplier: 4 },
    onlyCategories: ["performance"],
  },
};
const flow = await startFlow(page, { name: "dashboard and users", config });
await flow.navigate(`${BASE}/dashboard`, { name: "Load dashboard" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clicked = [];
async function tap(name, finder, ...args) {
  try {
    const handle = (await page.evaluateHandle(finder, ...args)).asElement();
    if (!handle) { clicked.push(`${name} (not found)`); return; }
    await handle.click();
    await sleep(900);
    clicked.push(name);
  } catch (e) { clicked.push(`${name} (error: ${String(e).slice(0, 60)})`); }
}

await flow.startTimespan({ name: "Tap through app" });
await tap("open menu", () => [...document.querySelectorAll("button")].find((b) => /menu|navigation/i.test(b.getAttribute("aria-label") || "")));
await tap("go to users", () => [...document.querySelectorAll("a")].find((a) => /users/i.test(a.textContent || "") && a.getAttribute("href")?.includes("users")));
await sleep(3000);
await tap("row actions menu", () => [...document.querySelectorAll("button")].find((b) => /more actions/i.test(b.getAttribute("aria-label") || "")));
await page.keyboard.press("Escape"); await sleep(500);
await tap("open access dialog", () => [...document.querySelectorAll("button")].find((b) => /view|details/i.test(b.getAttribute("aria-label") || "")));
await sleep(1200); await page.keyboard.press("Escape"); await sleep(500);
await tap("theme toggle", () => [...document.querySelectorAll("button")].find((b) => /switch to (dark|light) mode/i.test(b.getAttribute("aria-label") || "")));
await tap("language menu", () => document.querySelector("button:has(svg.lucide-languages)"));
await page.keyboard.press("Escape"); await sleep(500);
await flow.endTimespan();

const result = await flow.createFlowResult();
const out = result.steps.map((s) => {
  const a = s.lhr.audits;
  const n = (k) => (a[k] && a[k].numericValue != null ? Math.round(a[k].numericValue) : null);
  return { step: s.name, mode: s.lhr.gatherMode, score: s.lhr.categories.performance?.score ?? null, lcp: n("largest-contentful-paint"), tbt: n("total-blocking-time"), cls: a["cumulative-layout-shift"]?.numericValue ?? null, inp: n("interaction-to-next-paint") };
});
console.log(JSON.stringify({ lighthouse: result.steps[0].lhr.lighthouseVersion, taps: clicked, steps: out }, null, 2));
await browser.close();
