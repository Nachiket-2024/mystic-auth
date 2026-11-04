# Frontend performance measurements
---

Lab numbers for page load (LCP) and interaction latency (INP), how they were measured, and how to repeat them. They come from one shared development machine, not a quiet dedicated one or a real device, so treat them as data points and not certified values. A downstream deployment should repeat them against its real domain and device profile before setting a performance budget.

Thresholds: LCP good is 2.5 s or less; INP good is 200 ms or less, poor is over 500 ms.

## Page load (LCP)

An earlier production build measured with Lighthouse 12.8.2 on mobile gave login LCP 4.943 s, dashboard 5.017 s and audit log 4.735 s, with 89 to 91% of LCP spent in render delay and no API, image or font load delay. The initial bundle also loaded all four language packs before the first render.

The fix keeps English on the initial path, loads other language packs only when selected, and preloads the production stylesheet without blocking render. The HTML boot shell stays visible until the first application frame, so the browser paints a small accessible loading surface while the app shell and route code start.

A later single Lighthouse 13.5.0 run reported 4.2 to 4.3 s on all three pages. Three different pages converging on one number is not what a page-specific regression looks like, and the machine was busy with Docker rebuilds, so it was repeated with a direct `PerformanceObserver` reading (Chrome DevTools Protocol, 4x CPU slowdown, Fast-3G-like network, value read after a 6-second settle). Two runs per page were low-variance: login about 2.71 to 2.75 s, dashboard 2.88 to 2.90 s, audit log 2.99 to 3.06 s. Login improved from its original 4.021 s. The slow Lighthouse run is treated as noise. The mobile LCP therefore sits below 4 s but above the 2.5 s good threshold.

Desktop Lighthouse results were login LCP 0.947 s, dashboard 1.006 s and audit log 0.956 s, all with CLS 0.000 and scores of 0.98 to 0.99.

## Interaction latency (INP)

Lighthouse navigation-mode runs never report INP because they contain no interaction. Two ways to get one:

- `scripts/mystic_auth/performance/measure-inp.mjs` signs in and taps through the app (navigation menu, Users, search, row menu, access dialog, theme toggle, language menu) and reads INP from the `web-vitals` library. Default is a phone profile (412 px, 4x CPU slowdown, Fast-3G-like network); `INP_PROFILE=desktop` uses 1440 px with no throttling. Needs `INP_EMAIL` and `INP_PASSWORD` for an account that can open the Users page, and a production build served with `vite preview`.
- `scripts/mystic_auth/performance/lighthouse-flow.mjs` runs Lighthouse itself as a user flow (a navigation step plus a timespan step that taps through the app). Lighthouse and `puppeteer-core` are not repo dependencies; the header of the script has the install and run commands.

Results on the phone profile: `web-vitals` median 416 ms (runs 352, 416, 504) before optimisation and 368 ms after. Lighthouse's flow, whose DevTools throttling adds about 560 ms of request latency, gave INP 595 ms, 3.1 s total blocking time while tapping, and for the dashboard navigation a score of 0.73, LCP 4.5 s and TBT 380 ms.

Per-interaction hotspots on the phone profile: the theme toggle spends about 300 to 400 ms in presentation delay because the whole page is restyled; opening the user access dialog spent about 430 ms in its click handler; the first menu opened after the Users table renders waits about 250 to 300 ms on a busy main thread.

Optimisation done: the access dialog renders only the active tab's list (the hidden Policies and Permissions lists used to be built on every open), cutting the dialog open from about 496 to 352 ms. Tried and reverted: zeroing colour transitions for two frames around the theme flip made the toggle worse (about 1.4 s), most likely from extra full-page style recalculations.

Desktop profile: INP 72 to 80 ms over five runs, well inside the good threshold. The phone figures matter for the pages phones use (login, signup, dashboard, account settings) and much less for the Users page and its dialogs. Real-phone use through the ngrok local-prod stack felt fine, so the phone-emulation numbers are accepted unless a real-device measurement says otherwise.
