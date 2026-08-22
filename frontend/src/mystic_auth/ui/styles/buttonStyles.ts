// Tokenized in theme/system.ts (durations.hover / easings.hover), so it's
// overridable from app/theme.ts the same way brand colors are.
import { FAST_HOVER_TRANSITION } from "../../theme/system";

// Solid variant's default hover is only colorPalette.solid at 90% opacity -
// too subtle a shift to read as a hover state (originally fixed one-off on
// LoginForm's/PasswordResetRequestForm's own Login/submit buttons; extracted
// here so every other colorPalette="brand" solid button - Create Policy,
// Save changes, Assign, Verify Account, Signup, etc. - gets the identical
// fix instead of each needing its own copy of this override).
export const BRAND_SOLID_HOVER_PROPS = {
    _hover: { bg: "brand.700" },
    transition: FAST_HOVER_TRANSITION,
};

// Same underlying problem as BRAND_SOLID_HOVER_PROPS, for an
// outline/colorPalette="brand" secondary action (e.g. "Send New
// Verification Link" below the primary "Verify Account" button): an
// outline button's stock hover only lightens its already-transparent
// background a shade, which reads as no change at all against the page's
// own bg.canvas. Fills solid brand on hover instead, the same "fills up"
// treatment SECONDARY_BUTTON_PROPS/ICON_BUTTON_PROPS use for their own
// too-faint hovers, just with the brand palette instead of gray since this
// keeps the button's own brand-colored border/text identity.
export const BRAND_OUTLINE_HOVER_PROPS = {
    // Resting color/borderColor set explicitly, not left to the outline
    // recipe's own default: Chakra's outline variant resolves a custom
    // colorPalette's text/border straight off the raw brand.500 scale step,
    // not through this app's brand.fg/brand.border semantic tokens (see
    // themeSemanticTokens.ts) - so without this override, "Send New
    // Verification Link"/LandingPage's "Log in" rendered a noticeably
    // paler, lower-contrast orange (brand.500, #f59e0b, 2.15:1 on white)
    // than every other brand-colored button/heading on the page (brand.600,
    // #d97706, 3.19:1 - the same value themeTokens.ts's own docstring
    // already calibrates this app's AA-adjacent brand pairings against).
    color: "brand.fg",
    borderColor: "brand.border",
    // borderColor here too, not just bg/color: the outline variant's own
    // border is a pale brand.200, and without overriding it on hover it
    // stays that pale shade around the now-solid brand.500 fill - a light
    // ring around a saturated button instead of one clean color.
    _hover: { bg: "brand.500", borderColor: "brand.500", color: "white" },
    transition: FAST_HOVER_TRANSITION,
};

// Same fix as BRAND_SOLID_HOVER_PROPS above, for solid colorPalette="red"
// destructive actions (e.g. ConfirmDialog's confirm button) - the stock
// hover was too subtle a shift off red.600 to read as a real hover state.
export const DESTRUCTIVE_SOLID_HOVER_PROPS = {
    _hover: { bg: "red.700" },
    transition: FAST_HOVER_TRANSITION,
};

// Dialog secondary actions (Cancel/Close). variant="ghost" (no border, no
// background) reads as plain text next to a solid primary action, and its
// hover is too faint to register as a real button - same class of issue
// TableActionButton.tsx and Pagination.tsx's identical fixes address for
// their own controls. Hover now fills solid (not just a lighter/darker
// shade) with a contrasting text color, the same "fills up" treatment
// TableActionButton.tsx's red palette (Delete/Purge) already had - light
// and dark solid fills sit at opposite ends of the gray scale, so each
// needs its own contrasting hover text (white vs. gray.900).
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

// Navbar's icon-only controls (theme toggle, mobile menu toggle), also
// reused by AuthLayout's font/language/theme cluster. variant="ghost" is
// invisible until hovered - no border, no background - so against either
// host background these read as bare icons, not controls, same issue
// SECONDARY_BUTTON_PROPS fixes for text buttons. Light-mode bg is gray.200,
// not gray.100: Navbar/Sidebar sit on bg.surface (white) where gray.100
// stands out fine, but AuthLayout sits directly on bg.canvas, which *is*
// gray.100 - the old value made the button fill and page background
// identical, leaving only a 1px border to signal "control" on every auth
// page. gray.200 reads as a distinct step against both white and gray.100.
// Same solid-fill hover as SECONDARY_BUTTON_PROPS above (still includes a
// hover text color: ThemeToggle's/Navbar's glyphs are plain characters, not
// colored emoji images, so they do pick up `color`).
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

// Font size / language / theme toggles in ControlCluster.tsx - each its own
// separately-boxed, brand-tinted button (not grouped into one shared-border
// segmented control; that was tried and reverted back to standalone
// buttons). Brand-tinted (light orange fill/border rather than neutral gray)
// so the cluster picks up the same accent color already used decoratively
// elsewhere on these pages (logo mark, feature-card icons, footer links) -
// not just on the primary CTA buttons, so it doesn't read as competing with
// them. borderWidth is explicit even though it matches Select.Trigger's own
// recipe default (variant="outline"'s 1px all sides) - unlike a grouped
// divider, a standalone button wants a full border, so there's no fight with
// the recipe to resolve here, just color/bg overrides on top of it. color
// has its own _dark override (not just _hover's) - brand.700 as the resting
// color in dark mode was dark-orange text on the brand.900 dark fill, too
// low contrast to read at rest.
export const BRAND_ICON_BUTTON_PROPS = {
    variant: "plain" as const,
    borderWidth: "1px",
    // One step darker than brand.400: against the brand.200 fill below (also
    // darkened a step from the original brand.100, see that comment), 400
    // read as barely more than a soft edge - 500 gives the chip an actual
    // outline instead of just a color shift at its own boundary.
    borderColor: "brand.500",
    borderRadius: "density.control",
    // One step darker than the originally-shipped brand.100: on AuthLayout/
    // LandingPage (this cluster's other host, alongside Navbar), the page's
    // own top-of-viewport gradient (bgGradient in AuthLayout.tsx, sourced
    // from bg.canvasFrom) starts at that exact same brand.100 in light mode
    // - so a brand.100 button rendered with almost no bg contrast against
    // the page behind it, just a pale border floating in a same-colored
    // patch. brand.200 clears that collision while staying the same
    // "brand-tinted, not neutral gray" treatment.
    bg: "brand.200",
    color: "brand.700",
    _hover: { bg: "brand.300", borderColor: "brand.600", color: "brand.800" },
    _dark: { borderColor: "brand.700", bg: "brand.900", color: "brand.200", _hover: { bg: "brand.800", borderColor: "brand.600", color: "brand.100" } },
    transition: FAST_HOVER_TRANSITION,
};

// Dialog.CloseTrigger (the X in the corner of every dialog) ships with no
// visual state of its own - no border, no background, and its hover is
// just a barely-there opacity shift, same class of "doesn't read as a
// control" issue ICON_BUTTON_PROPS/SECONDARY_BUTTON_PROPS fix for their own
// controls. Same solid-fill treatment, sized down (padding/borderRadius)
// since this button is icon-only and sits inline with the dialog title
// rather than in a footer.
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
