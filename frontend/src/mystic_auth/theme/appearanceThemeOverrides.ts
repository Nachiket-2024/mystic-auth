import { colord, extend } from "colord";
import mixPlugin from "colord/plugins/mix";

import { generateBrandScale } from "./generateBrandScale";

extend([mixPlugin]);

// A stock neutral gray.900. Dark mode's canvasFrom is blended against this
// rather than a flat brand step.
const GRAY_900 = "#18181b";

// This app's own dark canvas value from tailwind-tokens.css, not GRAY_900 -
// deriveSidebar blends toward this instead (see its own comment for why):
// GRAY_900 (#18181b, L=10) floors every possible blend result at least
// that light, which can never reach the intended design's actual chrome darkness
// (L=6.9) no matter the blend weight.
const BG_CANVAS_DARK = "#0b0d12";

/** The bg.canvasFrom pair for an arbitrary brand scale, shared with
 * AppearanceCard.tsx's preview boxes so they show what applying the pick will
 * render. The page body background is a very faint radial brand tint, not a
 * colored wash. Light value: L=95 keeps `scale["600"]`'s hue and saturation
 * (trimmed to 45%) because very high lightness already reads as barely there.
 * Dark value: gray.900 blended with the 900 step at 25% weight, enough for a
 * hint of brand cast without a colored panel. */
export function deriveCanvasFrom(scale: ReturnType<typeof generateBrandScale>): { light: string; dark: string } {
    const { h, s } = colord(scale["600"]).toHsl();
    return {
        light: colord({ h, s: Math.min(100, s * 0.45), l: 95 }).toHex(),
        dark: colord(GRAY_900).mix(scale["900"], 0.25).toHex(),
    };
}

/** The bg.sidebar pair (Sidebar/Navbar surface) for an arbitrary brand scale.
 * The chrome color is meant to sit very close to bg.canvas (about #fbf4f2 light
 * / #160f0d dark): a whisper of brand hue, not a visibly tinted panel. Light
 * keeps `scale["600"]`'s hue at 85% saturation and lightness 96.5, one notch
 * below bg.canvas. Dark blends BG_CANVAS_DARK with a near-black brand step at
 * 60% weight (GRAY_900 would floor the blend at L=10, too light). Tuned so the
 * default brand color lands within a couple of RGB values of those targets
 * while staying brand-derived for any other color. */
export function deriveSidebar(scale: ReturnType<typeof generateBrandScale>): { light: string; dark: string } {
    const { h, s } = colord(scale["600"]).toHsl();
    const deepStep = colord({ h, s, l: 7 });
    return {
        light: colord({ h, s: Math.min(100, s * 0.85), l: 96.5 }).toHex(),
        dark: colord(BG_CANVAS_DARK).mix(deepStep, 0.6).toHex(),
    };
}
