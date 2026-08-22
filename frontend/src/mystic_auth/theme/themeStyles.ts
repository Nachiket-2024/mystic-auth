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
    // `height: 100%` on both html and body, plus overflowY split between
    // them (html: hidden, body: auto), is deliberate and load-bearing, not
    // decorative: without an explicit height, neither element is
    // height-constrained, so neither ever becomes a real overflow
    // container - the browser falls back to letting the *viewport itself*
    // scroll past documentElement's unconstrained box. That's invisible
    // normally, but Chakra's Dialog (built on Ark UI/zag-js's
    // @zag-js/remove-scroll) only ever locks scroll by setting
    // `overflow: hidden` on <body> - it never touches <html>. If body was
    // never the actual scrolling box to begin with, that lock is a no-op:
    // the background page keeps scrolling under an "open" dialog (the
    // "click the page instead of the button, then it works on the second
    // click" symptom), while remove-scroll *still* measures the (still
    // fully present) real scrollbar's width and adds it back as
    // `padding-right` on body to compensate for a removal that never
    // happened - squeezing body's content leftward next to a scrollbar
    // that's still sitting in its original place, which is exactly the
    // dialog-open page-shift + stray strip next to the scrollbar this was
    // fixing. Giving body its own bounded box (height:100%) and letting IT
    // own the vertical overflow makes body the real scrolling element, so
    // remove-scroll's body-only lock actually stops background scroll and
    // its padding-right compensation offsets a real, just-removed
    // scrollbar instead of a phantom one. html keeps overflowX:"clip" (see
    // below) but gets overflowY:"hidden" so it never independently scrolls
    // - body is the single source of truth for page scroll.
    html: {
        height: "100%",
        // "clip", not "hidden": pairing overflow-x:hidden with the default
        // overflow-y:visible makes the CSS spec silently compute overflow-y
        // as auto too, turning html/body into scroll containers that never
        // actually scroll - which broke Sidebar/Navbar's position:sticky,
        // since sticky resolves against the nearest scroll-container
        // ancestor. "clip" is exempt from that visible->auto swap. This is
        // still safe now that overflowY is explicitly "hidden" below
        // (rather than left at the default "visible" that provoked the
        // swap): both axes have explicit non-"visible" values, so there's
        // no ambiguity left for the spec's visible->auto substitution to
        // apply to.
        overflowX: "clip",
        overflowY: "hidden",
        bg: "bg.canvas",
    },
    body: {
        height: "100%",
        lineHeight: "1.55",
        overflowX: "clip",
        overflowY: "auto",
        // Deliberately NOT setting scrollbarGutter:"stable" here - tried
        // twice now (this codebase's own history, plus a repeat attempt in
        // this same session that added explicit scrollbar-color/
        // ::-webkit-scrollbar theming on top, thinking the earlier attempt
        // had simply skipped that step) and reverted both times. A
        // permanently reserved gutter is only guaranteed to be *sized*
        // correctly; whether a browser actually paints CSS scrollbar
        // theming into that space when there's no real scrollbar object
        // behind it (nothing to scroll) is not guaranteed by spec and
        // isn't consistent across browsers even with explicit
        // `scrollbar-color`/`::-webkit-scrollbar-*` rules in place -
        // confirmed by testing this a second time. Where it falls back to
        // unstyled, that's the browser's bare user-agent track color for
        // the current color-scheme (themeStore.ts sets color-scheme:dark)
        // - a permanent near-black strip on every page short enough not to
        // scroll, not just the tall ones. The height:100%/overflowY split
        // above fixes the dialog-open shift without needing a permanent
        // reservation at all: see that comment for why.
        //
        // scrollbarColor/::-webkit-scrollbar* below theme body's own
        // scrollbar now that body (not html) is the element that actually
        // owns it - same idea as DataTable's Table.ScrollArea theming (see
        // DataTableStyles.ts's SCROLL_AREA_SCROLLBAR_CSS). Left as the bare
        // user-agent scrollbar (dark, arrow-button classic Windows style in
        // a screenshot that surfaced this), it visibly clashes with this
        // app's own warm/branded dark theme instead of reading as part of
        // it.
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
    // Every dialog/menu/tooltip open-close animation, RouteFadeIn's page
    // transition, RouteProgressBar's slide loop, and every FAST_HOVER_
    // TRANSITION button/link all rely on CSS `animation`/`transition`, so
    // one universal-selector override here is enough to respect a user's
    // OS-level reduced-motion setting everywhere at once, instead of
    // threading a check through each of those independently. Durations
    // collapse to near-zero rather than `none`: some libraries (Ark UI's
    // dialog/menu machines included) gate their own open/closed state
    // transitions on an `animationend`/`transitionend` event actually
    // firing, so removing the animation outright can leave them stuck
    // mid-state instead of just snapping instantly.
    "@media (prefers-reduced-motion: reduce)": {
        "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
        },
    },
};
