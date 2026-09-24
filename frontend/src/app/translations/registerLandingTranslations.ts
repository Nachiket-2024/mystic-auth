import { translations } from "../sdk";

import en from "../../mystic_auth/translations/languages/en/landing.json";
import hi from "../../mystic_auth/translations/languages/hi/landing.json";
import mr from "../../mystic_auth/translations/languages/mr/landing.json";
import gu from "../../mystic_auth/translations/languages/gu/landing.json";

// LandingPage is app-owned, so its copy doesn't belong in the upstream
// NAMESPACES list in mystic_auth/translations/translations.ts. addResourceBundle
// registers this "landing" namespace here instead. Imported once for its
// side effect (LandingPage.tsx imports this module before it renders).
for (const [lang, resource] of [
    ["en", en],
    ["hi", hi],
    ["mr", mr],
    ["gu", gu],
] as const) {
    translations.addResourceBundle(lang, "landing", resource);
}
