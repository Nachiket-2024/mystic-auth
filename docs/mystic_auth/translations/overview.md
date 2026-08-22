# Translations

The frontend renders in multiple languages via [`react-i18next`](https://react.i18next.com/). This
doc covers what's supported today, how the moving pieces fit together, and a step-by-step
tutorial for adding a new language. See [Frontend Architecture](../architecture/frontend.md) for
how this fits into the rest of `frontend/src/mystic_auth/`.

---

## What's supported today

| Language | Code | Native label |
|---|---|---|
| English | `en` | English |
| Hindi | `hi` | हिंदी |
| Marathi | `mr` | मराठी |
| Gujarati | `gu` | ગુજરાતી |

The language toggle (`LanguageToggle`, in the navbar next to the dark/light mode toggle) doesn't
just switch between these four - it offers **seven modes**:

| Mode | What renders in English | What renders in the other language |
|---|---|---|
| `en` | Everything | - |
| `hi` | - | Everything, including navbar/sidebar |
| `mr` | - | Everything, including navbar/sidebar |
| `gu` | - | Everything, including navbar/sidebar |
| `en+hi` | Navbar, sidebar, and all dates/month names | Page content (titles, forms, tables, messages) in Hindi |
| `en+mr` | Navbar, sidebar, and all dates/month names | Page content in Marathi |
| `en+gu` | Navbar, sidebar, and all dates/month names | Page content in Gujarati |

The three mixed modes exist because a caller who's more comfortable navigating in English (menus,
buttons, chrome) may still want the actual content - forms, table data, messages - in their own
language. The plain `hi`/`mr`/`gu` modes are unchanged from a normal single-language app: everything,
chrome included, switches.

---

## Architecture

### 1. Translation setup: `frontend/src/mystic_auth/translations/translations.ts`

Built on [`react-i18next`](https://react.i18next.com/), an established translation library for React;
its internal terminology (`i18next`, `namespace`, `getFixedT`) shows up below wherever it names
something directly, but this repo's own files, folders, and variables use "translation(s)" throughout.

One [i18next namespace](https://www.i18next.com/principles/namespaces) per feature folder under
`frontend/src/mystic_auth/`, so translation files stay small and map 1:1 to code ownership instead
of one giant JSON. The one exception is `ui_text`, which holds vocabulary genuinely shared across
every feature (button labels like Save/Cancel/Delete, loading/saving states, pagination text,
error-boundary text) rather than belonging to any single folder:

```ts
export const NAMESPACES = [
    "ui_text", "layout", "auth", "users", "policies", "authorization",
    "audit_log", "account_settings", "dashboard", "rate_limits", "status_pages",
    "errors", "legal",
] as const;

export const SUPPORTED_LANGUAGES = ["en", "hi", "mr", "gu"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
    en: "English",
    hi: "हिंदी",
    mr: "मराठी",
    gu: "ગુજરાતી",
};
```

Each language's translations live in `frontend/src/mystic_auth/translations/languages/<lang>/<namespace>.json`
- e.g. `languages/hi/layout.json`. All thirteen namespace files are statically imported and registered
for all four languages in `translations.ts`'s `resources` object.

Components read strings the normal `react-i18next` way:

```tsx
const { t } = useTranslation("layout");
return <Text>{t("signedInAs")}</Text>;
```

### 2. Date/month/numeral formatting: not the translation library's job

react-i18next handles translated *strings*. Dates, month names, and digit glyphs are handled separately
by three small modules, all keyed the same way (`Record<SupportedLanguage, ...>`) so adding a
language touches all of them the same shape:

- `translations/monthNames.ts` - short month names ("Jan" / "जन" / "जाने" / "જાન").
- `translations/numerals.ts` - ASCII digit -> native digit glyph. Hindi and Marathi both use
  Devanagari digits (०-९); Gujarati has its own distinct glyph set (૦-૯).
- `translations/timeOfDay.ts` - hour:minute formatting; Hindi/Marathi/Gujarati use native
  day-period words (सुबह/सकाळ/સવારે, दोपहर/दुपार/બપોરે, ...) instead of a literal "AM"/"PM"
  transliteration.

`frontend/src/mystic_auth/ui/dateFormat.ts` composes these into the actual formatters
(`formatMemberSince`, `formatDateTime`, `formatTimeOnly`) used by pages that show timestamps.

### 3. The language store: `frontend/src/mystic_auth/store/languageStore.ts`

A small Zustand store (the same pattern as `store/themeStore.ts` for dark/light mode), persisted to
`localStorage` under the `"language"` key. It's built around a `LanguageMode` (what the user picks)
which resolves to **two separate languages**:

```ts
export const LANGUAGE_MODES = ["en", "hi", "mr", "gu", "en+hi", "en+mr", "en+gu"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

interface ResolvedLanguages {
    chromeLanguage: SupportedLanguage; // Navbar + Sidebar + dates/month names
    pageLanguage: SupportedLanguage;   // Everything else (drives the global translation language)
}
```

| Mode | `chromeLanguage` | `pageLanguage` |
|---|---|---|
| `en` | `en` | `en` |
| `hi` | `hi` | `hi` |
| `mr` | `mr` | `mr` |
| `gu` | `gu` | `gu` |
| `en+hi` | `en` | `hi` |
| `en+mr` | `en` | `mr` |
| `en+gu` | `en` | `gu` |

`pageLanguage` drives the translation library's global active language (`translations.changeLanguage(pageLanguage)`),
so every ordinary `useTranslation()` call across the app follows it automatically - no per-component
change needed. `chromeLanguage` is consumed explicitly by three call sites:

- **`layout/app_layout/Navbar.tsx`** and **`layout/app_layout/Sidebar.tsx`** - instead of `useTranslation("layout")`
  (which would follow `pageLanguage`), they call
  `translations.getFixedT(chromeLanguage, "layout")` to get a translator pinned to
  `chromeLanguage` regardless of what the page is doing.
- **Every page that formats a date or month name** (`DashboardPage`, `ManageSessionsCard`,
  `UserDetailsDialog`, the audit-log sections, `LoginTrendChart`'s day/axis labels) reads
  `chromeLanguage` from the store and passes it into `formatMemberSince`/`formatDateTime`/
  `formatTimeOnly`/`monthNameShort`, so a date reads "15 Jan 2026" in the `en+hi` mode even though
  the surrounding page text is in Hindi. Plain numeral formatting that isn't a date (pagination
  page numbers, table row indices, stat-tile counts, cooldown-timer seconds) is **not** treated
  this way - it stays on `pageLanguage`, so those numerals do translate in the mixed modes.

`document.documentElement.lang` is set to `pageLanguage` (the majority-content language), not
`chromeLanguage` - there's no single correct value for a mixed-language document, and most
assistive tech cares most about the page's actual content.

### 4. The toggle itself: `frontend/src/mystic_auth/layout/controls/LanguageToggle.tsx`

A plain click-to-open dropdown (Chakra's `Select`, the same component `StyledSelect.tsx` wraps
elsewhere in the app), styled to match `ThemeToggle`'s icon-button look (same border/background/
hover colors, see `ui/styles/buttonStyles.ts`'s `ICON_BUTTON_PROPS`) via its own `Select.Trigger`
overrides rather than a typeable search box. With only seven options, a search box isn't earning
its keep the way it would past a few dozen languages - this matches how most real-world language
switchers (GitHub, Wikipedia, Google) work at this scale. Click to open, click an option, closes;
the current selection stays visible on the trigger at rest either way.

### 5. Backend error codes: `frontend/src/mystic_auth/api/apiError.ts`

Most text in the app is translated at the point it's rendered, via `useTranslation()` in the
component itself. Backend error messages are the one exception: they're translated in a single
shared place instead, because a mutation's catch block doesn't know in advance which of several
possible backend errors it's handling.

`backend/mystic_auth/core/errors.py`'s `AppError` (see [Backend Architecture](../architecture/backend.md))
carries a stable, machine-readable `code` (e.g. `"INVALID_CREDENTIALS"`) and optional `params`
alongside the English `detail` FastAPI/Sentry/logs see. The actual `code` -> `errors:<code>` lookup
lives in `apiError.ts`'s `translateErrorCode(code, params)`, a standalone function (not axios-shaped)
so any caller with a bare code, not just an API response, can reuse the exact same lookup and
DEV-mode missing-translation warning. `extractApiErrorMessage()` is its main caller, for ordinary
axios mutation errors:

1. If the response has a `code`, `translateErrorCode` looks it up as `errors:<code>` in the `errors`
   namespace (`translations/languages/*/errors.json`) and renders it in the caller's current
   language, interpolating `params` (e.g. a policy name into `"Policy \"{{name}}\" not found"`).
2. If there's no `code` (a route not yet migrated to `AppError`) or the code has no matching
   `errors.json` entry, fall back to the raw English `error`/`detail` string from the response
   body, so a caller never sees a blank or broken message.
3. If neither exists at all (a network failure, or a non-axios error), fall back to the
   caller-supplied `fallback` argument.

The other caller is `OAuth2LoginButton.tsx`: the OAuth2 flow is a full-page redirect back to
`/login?error=<CODE>` rather than an API response (see [Google OAuth2 / PKCE](../authentication/oauth2-pkce.md#edge-cases--error-handling)),
so it calls `translateErrorCode` directly on that query param instead of going through
`extractApiErrorMessage`.

Case 2's "code exists but no translation" branch is the one to watch: it degrades gracefully for
the *user* (still a real English sentence, not a blank toast), but that same graceful degradation
means a missing `errors.json` entry looks identical to "working as intended" at a glance - nothing
crashes, nothing looks obviously wrong. So in addition to the fallback, that branch also logs a
`console.error` naming the missing code, but only when `import.meta.env.DEV` is true: loud enough
to catch the gap the first time you exercise that code path in development, without affecting real
users or shipping a console.error into production. If you add a new machine-readable code - a new
`AppError(code="...")` call site, or a new OAuth2 redirect code - add the matching `errors:<code>` key to all four `errors.json` files
in the same change, or expect to see that warning the first time your route returns it locally.

---

## Adding a new language

For the step-by-step walkthrough of adding a new language (Tamil, as a worked example) across every
data file this touches, see [Tutorial: Adding a New Language](adding-a-language.md).

---

## Where to go next

- [Tutorial: Adding a New Language](adding-a-language.md): step-by-step walkthrough of adding a new
  language.
- [Frontend Architecture](../architecture/frontend.md): how `translations/`, `store/`, and `layout/`
  fit into the rest of the frontend module layout.
- [Testing Overview](../testing/overview.md): how to run the frontend Vitest suite the tutorial's
  verification step uses.
