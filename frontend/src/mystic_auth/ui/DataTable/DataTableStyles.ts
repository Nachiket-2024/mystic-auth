import type React from "react";

/** Only a plain string/number render result can safely become a `title`
 * tooltip - anything else (badges, buttons, a name+badge Text node) is a
 * React element, not text, and can't be stringified without risk. */
export function plainTextOf(node: React.ReactNode): string | undefined {
    if (typeof node === "string" || typeof node === "number") return String(node);
    return undefined;
}

// A plain overflow:auto div gives no visual hint that a scrollable table has
// more content off to the side. The classic four-background "scroll shadow"
// trick fixes that: two opaque gradients (matching the table background)
// plus two shadow gradients underneath. `background-attachment: local`
// scrolls the opaque ones with the content (covering the shadow past that
// edge) while `scroll` pins the shadow gradients to the viewport (showing
// only while there's more content that way). Colors reference Chakra's CSS
// custom properties, so dark mode needs no separate override.
export const SCROLL_SHADOW_CSS = {
    background: `
        linear-gradient(to right, var(--chakra-colors-bg-surface) 30%, transparent),
        linear-gradient(to left, var(--chakra-colors-bg-surface) 30%, transparent) 100% 0,
        linear-gradient(to right, var(--chakra-colors-blackAlpha-400), transparent),
        linear-gradient(to left, var(--chakra-colors-blackAlpha-400), transparent) 100% 0
    `,
    backgroundRepeat: "no-repeat" as const,
    backgroundColor: "bg.surface",
    backgroundSize: "24px 100%, 24px 100%, 10px 100%, 10px 100%",
    backgroundPosition: "0 0, 100% 0, 0 0, 100% 0",
    backgroundAttachment: "local, local, scroll, scroll" as const,
};

// Applied to every header cell (not the <tr>: sticky positioning on a table
// row itself is unreliable across browsers, the cells are what actually need
// it) so column headers stay put while a long table's body scrolls past
// underneath. Only takes effect once Table.ScrollArea's own maxH actually
// constrains the table's height - a short table that never grows past that
// cap never scrolls internally in the first place, so this is a no-op for
// it. bg.surface (not transparent) so scrolled-past rows don't show through
// the sticky header as they pass beneath it.
export const STICKY_HEADER_CELL_PROPS = {
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    bg: "bg.surface",
};
