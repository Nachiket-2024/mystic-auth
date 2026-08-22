// Chakra's Dialog.Content defaults to just boxShadow: "lg", no border, which
// wasn't enough separation from a mostly white page. A visible border, a
// stronger shadow, and a blurred/darker backdrop give the standard "elevated
// panel over a dimmed page" look.
// pointerEvents: "auto" is required, not cosmetic: the dialog machine sets
// `document.body { pointer-events: none }` while open, and the backdrop
// inherits that `none` since nothing here overrode it - without this,
// "click anywhere in the background to close" silently didn't work.
// Chakra's own dialog recipe times the backdrop's fade slower than the
// panel (300ms open / 200ms close vs. the content's 200ms / 100ms), so the
// blur/dim visibly trails behind the panel instead of landing with it.
// Matching it to "fast"/"faster" here syncs the two and reads noticeably
// snappier - halving the open time instead of leaving the backdrop as the
// long pole in the animation.
export const DIALOG_BACKDROP_PROPS = {
    bg: "blackAlpha.600",
    backdropFilter: "blur(2px)",
    pointerEvents: "auto",
    _open: { animationDuration: "fast" },
    _closed: { animationDuration: "faster" },
};

// Chakra's Dialog recipe defaults content margin (`my`) to spacing.16 (4rem)
// above AND below - over a fifth of a 600px laptop viewport gone before a
// field renders, forcing even a modestly tall form into the positioner's own
// scroll. Overriding `my` down reclaims that space directly.
// overflow: "hidden" clips Dialog.Content to its own borderRadius. Without
// it, when Dialog.Body scrolls (scrollBehavior: "inside"), its native
// scrollbar - including the opaque square scrollbar-corner box - renders
// outside the rounded corner as a stray rectangle in the bottom-right.
export const DIALOG_CONTENT_PROPS = {
    borderWidth: "1px",
    borderColor: "border.default",
    boxShadow: "2xl",
    my: { base: "3", md: "4" },
    overflow: "hidden",
};
