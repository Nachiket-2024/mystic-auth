import { translations } from "../../sdk";

import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";
import gu from "./gu.json";

// The legal pages are app-owned (frontend/src/app/, not frontend/src/mystic_auth/) -
// their content is deployment-specific and meant to be rewritten per project,
// so it doesn't belong in the upstream NAMESPACES list in
// mystic_auth/translations/translations.ts. i18next's own addResourceBundle
// registers this "legal" namespace from here instead - same runtime, same
// useTranslation("legal") call sites, just app-owned rather than
// upstream-owned. Imported once for its side effect (PrivacyPolicyPage.tsx/
// TermsOfServicePage.tsx import this module before they render), same
// pattern as landing_page/translations/registerLandingTranslations.ts.
for (const [lang, resource] of [
    ["en", en],
    ["hi", hi],
    ["mr", mr],
    ["gu", gu],
] as const) {
    translations.addResourceBundle(lang, "legal", resource);
}
