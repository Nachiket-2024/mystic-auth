/**
 * Text-style roles, recipe overrides, and global page-level CSS. Split out
 * of system.ts, see that file's own docstring for how the pieces are merged.
 */

// A designed type scale, not just Chakra's default sizes at a
// couple of spots: `pageTitle` (PageContainer's title, shared by
// every admin page) and `sectionHeader` (a Card's own heading, e.g.
// ManageSessionsCard/AccountStatusCard/ChangePasswordCard) so those
// two recurring roles read as deliberately different weights/
// tracking, not just different `size` props on the same look.
// Referenced via `textStyle="pageTitle"`/`"sectionHeader"`, so a
// fork can still override the look for both roles app-wide from
// app/theme.ts without editing every call site.
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
    // Base-level only (no size/variant overrides), so this doesn't
    // change any existing Heading's rendered size - just tightens
    // tracking a touch tighter than the browser default, which reads
    // as more "designed" at every size already in use, from the
    // dialog titles up through PageContainer's page titles.
    heading: {
        base: {
            letterSpacing: "-0.01em",
        },
    },
    // Routes every Button's/Input's corner rounding through the
    // density.control token (themeTokens.ts) instead of Chakra's stock
    // "l2", so a fork can retune roundedness app-wide from app/theme.ts.
    // Deep-merged into Chakra's own button/input recipes (same
    // pattern as `heading` above), so every other base/variant/size
    // style stays exactly as shipped by Chakra - only borderRadius
    // is overridden.
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

// Slightly looser than the browser default (~1.2) for body copy - the
// app's tables/cards are dense with small-print text (timestamps, IPs,
// descriptions), and the tighter default line-height made multi-line
// cells and card paragraphs feel cramped next to the more spacious
// headings above.
export const globalCss = {
    // A wide DataTable's intrinsic content width was leaking past its own
    // overflow:auto ScrollArea into the page's scrollable area, letting a
    // narrow viewport scroll the whole page sideways instead of just the
    // table. Both html and body need overflow-x clipped (Chrome's viewport
    // scroller is the union of the two), so the page never gains its own
    // horizontal scrollbar while DataTable keeps scrolling internally.
    html: {
        // "clip", not "hidden": pairing overflow-x:hidden with the default
        // overflow-y:visible makes the CSS spec silently compute overflow-y
        // as auto too, turning html/body into scroll containers that never
        // actually scroll - which broke Sidebar/Navbar's position:sticky,
        // since sticky resolves against the nearest scroll-container
        // ancestor. "clip" is exempt from that visible->auto swap.
        overflowX: "clip",
        // Deliberately NOT setting scrollbarGutter:"stable" here: it
        // reserves a permanent column that sits outside html/body's own
        // box (elementFromPoint() over it returns null), so no background
        // - solid or gradient - set on html/body can ever paint it, and it
        // renders with the browser's bare UA track color for the current
        // color-scheme (themeStore.ts sets color-scheme:dark) - a
        // permanent near-black strip on every page. It's also unnecessary:
        // Chakra's Dialog scroll-lock (@zag-js/remove-scroll) already
        // detects the absence of a stable gutter and adds an equivalent
        // paddingRight to body itself while a dialog is open, so width
        // never shifts - and that padding paints correctly since it's
        // inside body's own box, unlike this reserved gutter.
        //
        // Explicit background so this covers the same ground the old
        // (now-removed) gutter background hack tried to: if a page's own
        // layout box doesn't reach some corner of html/body, it still
        // resolves to the app's canvas color instead of the UA default.
        bg: "bg.canvas",
    },
    body: {
        lineHeight: "1.55",
        overflowX: "clip",
        bg: "bg.canvas",
    },
};
