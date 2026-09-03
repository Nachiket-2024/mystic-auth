import type React from "react";

/** Only a plain string/number render result can safely become a `title`
 * tooltip - anything else (badges, buttons, a name+badge Text node) is a
 * React element, not text, and can't be stringified without risk. */
export function plainTextOf(node: React.ReactNode): string | undefined {
    if (typeof node === "string" || typeof node === "number") return String(node);
    return undefined;
}

// The classic four-background "scroll shadow" trick, so a scrollable table
// hints there's more content off to the side: two opaque gradients
// (attachment: local, scroll with the content) plus two shadow gradients
// underneath (attachment: scroll, pinned to the viewport, only visible
// while there's more to scroll). Chakra CSS vars mean no dark-mode case.
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

// Table.ScrollArea is its own overflow:auto box, separate from the page's
// html-level scrollbar (themeStyles.ts's globalCss.html). Left unstyled it
// renders the bare user-agent scrollbar color, same "black strip" issue as
// the page. bg.surface (not bg.canvas) as track color, since this scrollbar
// sits on the table's surface, not the page canvas.
// `\.` in the var() names: scrollbarColor isn't resolved by the token
// pipeline like plain style props are, so it needs the literal generated
// CSS custom property name.
export const SCROLL_AREA_SCROLLBAR_CSS = {
    scrollbarColor: "var(--chakra-colors-border\\.default) var(--chakra-colors-bg\\.surface)",
    "&::-webkit-scrollbar": {
        width: "14px",
        height: "14px",
    },
    "&::-webkit-scrollbar-track": {
        bg: "bg.surface",
    },
    "&::-webkit-scrollbar-thumb": {
        bg: "border.default",
        borderRadius: "full",
        border: "3px solid",
        borderColor: "bg.surface",
    },
};

// Applied to every header cell, not the <tr> (sticky on a table row is
// unreliable cross-browser), so headers stay put as the body scrolls under
// them. Only matters once Table.ScrollArea's maxH constrains height. bg.surface
// (not transparent) hides scrolled rows passing beneath the sticky header.
export const STICKY_HEADER_CELL_PROPS = {
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    bg: "bg.surface",
};
