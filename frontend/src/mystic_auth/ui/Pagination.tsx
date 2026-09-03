import React from "react";
import { Button, HStack, Text } from "@chakra-ui/react";
import type { StackProps } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { BRAND_SOLID_HOVER_PROPS } from "./styles/buttonStyles";
import { FAST_HOVER_TRANSITION } from "../theme/system";
import { useLanguageStore } from "../store/languageStore";
import { formatNumber } from "../translations/numerals";

interface PaginationProps extends Omit<StackProps, "children" | "page" | "onChange"> {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

const ELLIPSIS = "…";

// variant="outline"'s stock border/hover (see TableActionButton.tsx and
// SEARCH_INPUT_PROPS's identical fix) is too close in value to bg.canvas to
// read as a distinct, clickable button. Fixed, higher-contrast values plus
// an explicit background instead, so each button reads as raised. Hover
// fills solid with contrasting text, the same "fills up" treatment as
// TableActionButton.tsx's red palette and SECONDARY_BUTTON_PROPS.
const INACTIVE_PAGE_PROPS = {
    variant: "plain" as const,
    bg: "gray.100",
    borderWidth: "1px",
    borderColor: "gray.500",
    color: "fg.default",
    _hover: { bg: "gray.600", borderColor: "gray.700", color: "white" },
    _dark: {
        bg: "gray.700",
        borderColor: "gray.500",
        _hover: { bg: "gray.300", borderColor: "gray.300", color: "gray.900" },
    },
    transition: FAST_HOVER_TRANSITION,
};

// Active page: brand.solid already has plenty of contrast; this adds a
// matching border so it doesn't look like a different control next to its
// plain-styled siblings, plus the same hover fix every other
// colorPalette="brand" solid button uses (BRAND_SOLID_HOVER_PROPS).
const ACTIVE_PAGE_PROPS = {
    variant: "solid" as const,
    colorPalette: "brand" as const,
    borderWidth: "1px",
    borderColor: "brand.solid",
    ...BRAND_SOLID_HOVER_PROPS,
};

/**
 * Always includes page 1, the last page, and a window of `siblingCount`
 * pages around the current one, collapsing any gap into a single "…", so a
 * 40-page list doesn't render 40 buttons.
 */
function buildPageList(page: number, totalPages: number, siblingCount = 1): (number | typeof ELLIPSIS)[] {
    const pages: (number | typeof ELLIPSIS)[] = [];
    const start = Math.max(2, page - siblingCount);
    const end = Math.min(totalPages - 1, page + siblingCount);

    pages.push(1);
    if (start > 2) pages.push(ELLIPSIS);
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < totalPages - 1) pages.push(ELLIPSIS);
    if (totalPages > 1) pages.push(totalPages);

    return pages;
}

/**
 * Numbered page navigation (1 2 3 ... N), meant to render both above and
 * below a table so the user doesn't scroll back up to move between pages.
 * Always renders the same Prev/page/Next row, even for a single page (Prev/
 * Next simply disabled), rather than collapsing to a placeholder that could
 * drift a pixel or two from the real rendered row.
 */
const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange, ...rest }) => {
    const { t } = useTranslation("ui_text");
    // chromeLanguage, not pageLanguage: numerals stay ASCII even in a mixed
    // "en+hi" mode, same as dates (dateFormat.ts). Only translated text
    // switches with pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const pages = buildPageList(page, Math.max(1, totalPages));

    return (
        <HStack gap={2} justify="center" wrap="wrap" {...rest}>
            <Button
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label={t("pagination.previousPage")}
                {...INACTIVE_PAGE_PROPS}
            >
                {t("pagination.prev")}
            </Button>

            {pages.map((p, i) =>
                p === ELLIPSIS ? (
                    <Text key={`ellipsis-${i}`} px={1} color="fg.muted">
                        {ELLIPSIS}
                    </Text>
                ) : (
                    <Button
                        key={p}
                        size="sm"
                        minW="9"
                        onClick={() => onPageChange(p)}
                        aria-label={t("pagination.page", { page: formatNumber(p, language) })}
                        aria-current={p === page ? "page" : undefined}
                        {...(p === page ? ACTIVE_PAGE_PROPS : INACTIVE_PAGE_PROPS)}
                    >
                        {formatNumber(p, language)}
                    </Button>
                )
            )}

            <Button
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label={t("pagination.nextPage")}
                {...INACTIVE_PAGE_PROPS}
            >
                {t("pagination.next")}
            </Button>
        </HStack>
    );
};

export default Pagination;
