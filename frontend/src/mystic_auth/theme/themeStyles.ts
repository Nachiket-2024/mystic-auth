/**
 * Text-style roles, recipe overrides, and global page-level CSS. See
 * system.ts for how the pieces are merged.
 */

// Named type-scale roles for the two recurring headings, page titles and
// card section headers, so a fork can restyle both app-wide from
// app/theme.ts via `textStyle="pageTitle"`/`"sectionHeader"`.
export const textStyles = {
    pageTitle: {
        value: {
            fontWeight: "bold",
            letterSpacing: "-0.02em",
        },
    },
    sectionHeader: {
        value: {
            fontWeight: "semibold",
            letterSpacing: "-0.01em",
        },
    },
};

export const recipes = {
    // Base-level only: tightens tracking without touching size/variant, so
    // every existing Heading keeps its rendered size.
    heading: {
        base: {
            letterSpacing: "-0.01em",
        },
    },
    // Routes corner rounding through the density.control token instead of
    // Chakra's stock "l2", so a fork can retune roundedness app-wide.
    // Deep-merged into Chakra's own recipes, so only borderRadius changes.
    button: {
        base: {
            borderRadius: "density.control",
        },
    },
    input: {
        base: {
            borderRadius: "density.control",
        },
    },
};

// Looser than the browser default (~1.2): the app's tables/cards are dense
// with small-print text, and the tighter default felt cramped.
export const globalCss = {
    // html and body both need height:100% and overflow-x clipped, or a wide
    // DataTable leaks past its ScrollArea and scrolls the whole page
    // sideways. body (not html) owns vertical overflow, since Chakra's
    // Dialog only locks scroll on <body>: if body weren't a real scroll
    // container, that lock would be a no-op while remove-scroll still adds
    // scrollbar-width padding to compensate, causing a visible content
    // shift. Giving body its own bounded box makes it the real scrolling
    // element.
    html: {
        height: "100%",
        // "clip" not "hidden": overflow-x:hidden with the default
        // overflow-y:visible silently promotes overflow-y to auto, which
        // breaks Sidebar/Navbar's position:sticky. "clip" is exempt.
        overflowX: "clip",
        overflowY: "hidden",
        bg: "bg.canvas",
    },
    body: {
        height: "100%",
        lineHeight: "1.55",
        overflowX: "clip",
        overflowY: "auto",
        // Deliberately not scrollbarGutter:"stable": tried twice and
        // reverted, since browsers don't reliably paint scrollbar theming
        // into a reserved gutter with no real scrollbar behind it, leaving a
        // bare near-black strip on short pages. The height:100%/overflowY
        // split above already fixes the dialog-open shift on its own.
        //
        // Themes body's own scrollbar now that body owns it, same idea as
        // DataTableStyles.ts's SCROLL_AREA_SCROLLBAR_CSS.
        scrollbarColor: "var(--chakra-colors-border\\.default) var(--chakra-colors-bg\\.canvas)",
        "&::-webkit-scrollbar": {
            width: "14px",
        },
        "&::-webkit-scrollbar-track": {
            bg: "bg.canvas",
        },
        "&::-webkit-scrollbar-thumb": {
            bg: "border.default",
            borderRadius: "full",
            border: "3px solid",
            borderColor: "bg.canvas",
        },
        bg: "bg.canvas",
    },
    // One universal-selector override respects OS-level reduced-motion for
    // every animation/transition at once. Durations collapse to near-zero
    // rather than `none`: some libraries (Ark UI's dialog/menu machines)
    // wait for an animationend/transitionend event, and removing the
    // animation outright would leave them stuck mid-state.
    "@media (prefers-reduced-motion: reduce)": {
        "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
        },
    },
};
