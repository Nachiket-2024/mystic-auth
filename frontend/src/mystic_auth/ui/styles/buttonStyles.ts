// Tokenized in theme/system.ts (durations.hover / easings.hover), so it's
// overridable from app/theme.ts the same way brand colors are.
import { FAST_HOVER_TRANSITION } from "../../theme/system";

// Solid variant's default hover (90% opacity) is too subtle to read as a
// hover state. Shared by every colorPalette="brand" solid button. One step
// darker than brand.solid (brand.700, moved there for its own WCAG AA
// contrast fix, see themeSemanticTokens.ts), so hover still reads as darker
// than resting instead of colliding with it.
export const BRAND_SOLID_HOVER_PROPS = {
    _hover: { bg: "brand.800" },
    transition: FAST_HOVER_TRANSITION,
};

// Same issue as BRAND_SOLID_HOVER_PROPS, for outline/colorPalette="brand"
// secondary actions: the stock hover only lightens an already-transparent
// background, so it fills solid instead.
export const BRAND_OUTLINE_HOVER_PROPS = {
    // Set explicitly, not left to the outline recipe: Chakra resolves a
    // custom colorPalette's text/border off raw brand.500, not this app's
    // brand.fg/brand.border tokens, giving a noticeably paler orange
    // (2.15:1) than the rest of the page (brand.600, 3.19:1).
    color: "brand.fg",
    borderColor: "brand.border",
    // borderColor overridden on hover too, or the outline's pale brand.200
    // border stays visible as a light ring around the now-solid fill.
    _hover: { bg: "brand.500", borderColor: "brand.500", color: "white" },
    transition: FAST_HOVER_TRANSITION,
};

// Same fix as BRAND_SOLID_HOVER_PROPS, for solid colorPalette="red"
// destructive actions (e.g. ConfirmDialog's confirm button).
export const DESTRUCTIVE_SOLID_HOVER_PROPS = {
    _hover: { bg: "red.700" },
    transition: FAST_HOVER_TRANSITION,
};

// Dialog secondary actions (Cancel/Close). variant="ghost" reads as plain
// text with a too-faint hover, so this fills solid on hover instead, with a
// contrasting text color for each mode (white vs. gray.900).
export const SECONDARY_BUTTON_PROPS = {
    variant: "plain" as const,
    borderWidth: "1px",
    borderColor: "gray.500",
    bg: "gray.100",
    color: "fg.default",
    _hover: { bg: "gray.600", borderColor: "gray.700", color: "white" },
    _dark: {
        borderColor: "gray.500",
        bg: "gray.700",
        _hover: { bg: "gray.300", borderColor: "gray.300", color: "gray.900" },
    },
    transition: FAST_HOVER_TRANSITION,
};

// Navbar's icon-only controls, also reused by AuthLayout's font/language/
// theme cluster. variant="ghost" is invisible until hovered, so this adds a
// visible resting state. gray.200 (not gray.100): AuthLayout sits on
// bg.canvas, which is gray.100 itself, so gray.100 fill would blend into the
// page there; gray.200 stays distinct against both bg.canvas and bg.surface.
export const ICON_BUTTON_PROPS = {
    variant: "plain" as const,
    borderWidth: "1px",
    borderColor: "gray.500",
    bg: "gray.200",
    _hover: { bg: "gray.600", borderColor: "gray.700", color: "white" },
    _dark: {
        borderColor: "gray.500",
        bg: "gray.700",
        _hover: { bg: "gray.300", borderColor: "gray.300", color: "gray.900" },
    },
    transition: FAST_HOVER_TRANSITION,
};

// Font size / language / theme toggles in ControlCluster.tsx, each its own
// standalone brand-tinted button (a shared-border segmented control was
// tried and reverted). Brand-tinted so the cluster picks up the same accent
// color used elsewhere on these pages, not just the primary CTA.
export const BRAND_ICON_BUTTON_PROPS = {
    variant: "plain" as const,
    borderWidth: "1px",
    // brand.500, not brand.400: 400 read as barely more than a soft edge
    // against the brand.200 fill below.
    borderColor: "brand.500",
    borderRadius: "density.control",
    // brand.200, not brand.100: AuthLayout/LandingPage's top-of-viewport
    // gradient starts at brand.100 in light mode, so a brand.100 button
    // there had almost no contrast against the page behind it.
    bg: "brand.200",
    // brand.700 here measured 4.03:1 against brand.200, under WCAG AA's
    // 4.5:1. brand.800 clears it at 5.69:1.
    color: "brand.800",
    _hover: { bg: "brand.300", borderColor: "brand.600", color: "brand.800" },
    _dark: { borderColor: "brand.700", bg: "brand.900", color: "brand.200", _hover: { bg: "brand.800", borderColor: "brand.600", color: "brand.100" } },
    transition: FAST_HOVER_TRANSITION,
};

// Small brand-tinted inline actions (e.g. UserPoliciesDialog's "Expand
// all"/"Collapse all"). variant="plain" (not "subtle"): "subtle"'s recipe
// hover competes with a custom _hover at the same specificity, silently
// dropping a dark-mode override, so every state is set explicitly here.
export const BRAND_SUBTLE_BUTTON_PROPS = {
    variant: "plain" as const,
    borderWidth: "1px",
    borderColor: "brand.400",
    borderRadius: "density.control",
    bg: "brand.100",
    // brand.700 here measured exactly 4.5:1 against brand.100, WCAG AA's
    // minimum with no margin. brand.800 gives real headroom (6.36:1).
    color: "brand.800",
    _hover: { bg: "brand.200", borderColor: "brand.500" },
    _dark: { borderColor: "brand.600", bg: "brand.800", color: "brand.100", _hover: { bg: "brand.900", borderColor: "brand.700" } },
    transition: FAST_HOVER_TRANSITION,
};

// Dialog.CloseTrigger (the X in a dialog corner) ships with no visual state
// of its own, same issue ICON_BUTTON_PROPS fixes, just sized down for an
// icon-only control inline with the dialog title.
export const CLOSE_TRIGGER_PROPS = {
    borderWidth: "1px",
    borderColor: "gray.500",
    bg: "gray.200",
    borderRadius: "md",
    p: "1.5",
    _hover: { bg: "gray.600", borderColor: "gray.700", color: "white" },
    _dark: {
        borderColor: "gray.500",
        bg: "gray.700",
        _hover: { bg: "gray.300", borderColor: "gray.300", color: "gray.900" },
    },
    transition: FAST_HOVER_TRANSITION,
};
