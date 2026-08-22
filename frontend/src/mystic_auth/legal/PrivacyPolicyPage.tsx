import React from "react";
import { useTranslation } from "react-i18next";

import { APP_NAME, SUPPORT_EMAIL } from "../core/settings";
import LegalDocumentLayout, { type LegalSection } from "./LegalDocumentLayout";

// Content lives in translations/languages/*/legal.json (kept in sync with
// the actual data flows in the codebase - see
// docs/mystic_auth/security/decisions-infra.md for the audit this was
// written against - rather than generic boilerplate) so update that file
// whenever a data-collecting field, cookie, or third party actually
// changes, in every language.
const PrivacyPolicyPage: React.FC = () => {
    const { t } = useTranslation("legal");

    const contactPlaceholder = SUPPORT_EMAIL;
    const interpolation = { appName: APP_NAME, contactPlaceholder };

    return (
        <LegalDocumentLayout
            title={t("privacy.title", interpolation)}
            lastUpdatedLabel={t("lastUpdatedLabel")}
            lastUpdatedDate={t("lastUpdatedDate")}
            backLabel={t("back")}
            intro={t("privacy.intro", { ...interpolation, returnObjects: true }) as string[]}
            sections={t("privacy.sections", { ...interpolation, returnObjects: true }) as LegalSection[]}
        />
    );
};

export default PrivacyPolicyPage;
