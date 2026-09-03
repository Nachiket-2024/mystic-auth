import { translations } from "../../sdk";

import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";
import gu from "./gu.json";

// The 404/403 pages are app-owned, so their copy doesn't belong in the
// upstream NAMESPACES list. addResourceBundle registers this namespace here
// instead. Imported once for its side effect, same pattern as
// registerLandingTranslations.ts.
for (const [lang, resource] of [
    ["en", en],
    ["hi", hi],
    ["mr", mr],
    ["gu", gu],
] as const) {
    translations.addResourceBundle(lang, "status_pages", resource);
}
