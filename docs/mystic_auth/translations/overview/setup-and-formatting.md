# Translations: Setup and Formatting

---

## 1. Translation setup: `frontend/src/mystic_auth/translations/translations.ts`

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
---

## 2. Date/month/numeral formatting: not the translation library's job

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

---

See [Translations](README.md) for the feature overview, or [UI and Error Codes](ui-and-errors.md) for the language store, toggle, and backend error translation.

---
