/**
 * Text-style roles, recipe overrides, and global page-level CSS. Split out
 * of system.ts, see that file's own docstring for how the pieces are merged.
 */

// Named type-scale roles (not just Chakra's default sizes) for the two
// recurring headings, page titles and card section headers, so a fork can
// restyle both app-wide from app/theme.ts via `textStyle="pageTitle"`/
// `"sectionHeader"` instead of editing every call site.
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
    // Base-level only: tightens tracking without touching any size/variant,
    // so every existing Heading keeps its rendered size.
    heading: {
        base: {
            letterSpacing: "-0.01em",
        },
    },
    // Routes corner rounding through the density.control token
    // (themeTokens.ts) instead of Chakra's stock "l2", so a fork can retune
    // roundedness app-wide from app/theme.ts. Deep-merged into Chakra's own
    // recipes, so only borderRadius is overridden.
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
    // DataTable's content leaks past its own ScrollArea and scrolls the
    // whole page sideways. body (not html) owns vertical overflow, since
    // Chakra's Dialog (via @zag-js/remove-scroll) only locks scroll on
    // <body>: if body weren't a real scroll container, that lock would be a
    // no-op (background scrolls under an "open" dialog) while remove-scroll
    // still adds scrollbar-width padding-right to compensate for a removal
    // that never happened, causing a visible content shift. Giving body its
    // own bounded box makes it the real, single scrolling element.
    html: {
        height: "100%",
        // "clip" not "hidden": overflow-x:hidden paired with the default
        // overflow-y:visible makes the spec silently promote overflow-y to
        // auto, which breaks Sidebar/Navbar's position:sticky. "clip" is
        // exempt from that swap, and is safe here since overflowY below is
        // already explicit (not "visible").
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
        // reverted both times, since browsers don't reliably paint
        // scrollbar-color/::-webkit-scrollbar theming into a reserved
        // gutter when there's no real scrollbar behind it, leaving a bare
        // near-black strip on short pages that clashes with the dark theme.
        // The height:100%/overflowY split above already fixes the
        // dialog-open shift without needing a permanent reservation.
        //
        // Themes body's own scrollbar now that body (not html) owns it,
        // same idea as DataTableStyles.ts's SCROLL_AREA_SCROLLBAR_CSS, so it
        // matches the app's dark theme instead of the bare OS default.
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
    // every CSS animation/transition in the app at once. Durations collapse
    // to near-zero rather than `none`: some libraries (Ark UI's dialog/menu
    // machines) wait for an animationend/transitionend event, so removing
    // the animation outright can leave them stuck mid-state.
    "@media (prefers-reduced-motion: reduce)": {
        "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
        },
    },
};
