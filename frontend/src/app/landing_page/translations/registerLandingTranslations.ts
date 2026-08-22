import { translations } from "../../sdk";

import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";
import gu from "./gu.json";

// LandingPage is app-owned (frontend/src/app/, not frontend/src/mystic_auth/),
// so its own copy doesn't belong in the upstream NAMESPACES list in
// mystic_auth/translations/translations.ts. i18next's own addResourceBundle
// registers this "landing" namespace from here instead - same runtime, same
// useTranslation() call sites, just app-owned rather than upstream-owned.
// Imported once for its side effect (LandingPage.tsx imports this module
// before it renders).
for (const [lang, resource] of [
    ["en", en],
    ["hi", hi],
    ["mr", mr],
    ["gu", gu],
] as const) {
    translations.addResourceBundle(lang, "landing", resource);
}
