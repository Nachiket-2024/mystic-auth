// Chakra's default boxShadow:"lg", no border, wasn't enough separation from
// a mostly white page, so this adds a border, stronger shadow, and a
// blurred/darker backdrop.
// pointerEvents:"auto" is required, not cosmetic: the dialog machine sets
// `document.body { pointer-events: none }` while open, which the backdrop
// would otherwise inherit, silently breaking "click background to close".
// animationDuration matches "fast"/"faster": the stock recipe timed the
// backdrop slower than the panel, so it visibly trailed behind it.
export const DIALOG_BACKDROP_PROPS = {
    bg: "blackAlpha.600",
    backdropFilter: "blur(2px)",
    pointerEvents: "auto",
    _open: { animationDuration: "fast" },
    _closed: { animationDuration: "faster" },
};

// Chakra's default `my` (4rem above and below) eats over a fifth of a 600px
// laptop viewport before a field even renders, forcing modestly tall forms
// to scroll; overridden down to reclaim that space.
// overflow:"hidden" clips content to its borderRadius, or Dialog.Body's
// native scrollbar corner renders as a stray square past the rounded corner.
export const DIALOG_CONTENT_PROPS = {
    borderWidth: "1px",
    borderColor: "border.default",
    boxShadow: "2xl",
    my: { base: "3", md: "4" },
    overflow: "hidden",
};
