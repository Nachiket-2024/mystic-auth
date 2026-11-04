import React from "react";
import { useTranslation } from "react-i18next";

/** Id the skip link jumps to; both layouts put it on their <main>. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * First focusable element on every page: lets a keyboard or screen reader
 * user jump past the sidebar and top bar straight to the page content.
 * Hidden until it receives focus (the landing page uses the same pattern).
 */
const SkipLink: React.FC = () => {
    const { t } = useTranslation("layout");
    return (
        <a
            href={`#${MAIN_CONTENT_ID}`}
            className="sr-only z-50 rounded-md bg-bg-surface px-3 py-2 text-sm font-semibold text-fg-default shadow-card focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
            {t("skipToContent")}
        </a>
    );
};

export default SkipLink;
