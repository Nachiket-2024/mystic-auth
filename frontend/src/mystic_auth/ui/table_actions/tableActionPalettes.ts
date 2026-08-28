// Covers every colorPalette this app passes to a row-action button
// (Delete/Purge -> red; Reactivate -> green; Edit -> orange; View -> blue;
// Policies -> purple). Each has a filled background, not just an outline, so
// it reads as a raised control against a striped row, plus a hover that
// darkens both fill and border together. A plain constants module (not a
// component) shared by TableActionButton/TableActionIconButton, so both can
// import it without tripping react-refresh's only-export-components rule.
export const TABLE_ACTION_PALETTE_STYLES = {
    // Stronger cue than the other palettes since this is destructive
    // (Delete/Purge).
    red: {
        border: "red.400", hoverBorder: "red.500",
        bg: "red.50", hoverBg: "red.500",
        borderDark: "red.400", hoverBorderDark: "red.600",
        bgDark: "red.950", hoverBgDark: "red.600",
        color: "fg.error", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Reactivate. Same solid-fill-on-hover shape as the others.
    green: {
        border: "green.400", hoverBorder: "green.600",
        bg: "green.50", hoverBg: "green.500",
        borderDark: "green.400", hoverBorderDark: "green.500",
        bgDark: "green.950", hoverBgDark: "green.600",
        color: "fg.success", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Edit. fg.warning is a semantic token (system.ts) already tuned for
    // this chip: orange.700 light / orange.200 dark.
    orange: {
        border: "orange.400", hoverBorder: "orange.600",
        bg: "orange.50", hoverBg: "orange.500",
        borderDark: "orange.400", hoverBorderDark: "orange.500",
        bgDark: "orange.950", hoverBgDark: "orange.600",
        color: "fg.warning", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // View. fg.info is the blue.700/blue.200 counterpart to fg.warning.
    blue: {
        border: "blue.400", hoverBorder: "blue.600",
        bg: "blue.50", hoverBg: "blue.500",
        borderDark: "blue.400", hoverBorderDark: "blue.500",
        bgDark: "blue.950", hoverBgDark: "blue.600",
        color: "fg.info", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Policies. Purple, not a reused color, so it reads as its own action
    // distinct from the app's brand teal.
    purple: {
        border: "purple.400", hoverBorder: "purple.600",
        bg: "purple.50", hoverBg: "purple.500",
        borderDark: "purple.400", hoverBorderDark: "purple.500",
        bgDark: "purple.950", hoverBgDark: "purple.600",
        color: "purple.700", colorDark: "purple.200", hoverColor: "white",
        hoverColorDark: "white",
    },
} as const;
