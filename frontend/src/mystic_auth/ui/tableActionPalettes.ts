// red/green/orange/blue/purple cover every colorPalette this app currently
// passes to a row-action button (Delete/Purge -> red; Reactivate -> green;
// Edit -> orange; View -> blue; Policies -> purple). Each carries its own
// filled background (not just an
// outline on transparent) so the button reads as a raised control against a
// striped table row in both modes, plus a border one step darker/lighter
// than that fill so the edge stays visible against it, and a hover state
// that darkens/lightens both the fill and the border together for a clear,
// two-part state change rather than a barely-different background alone.
// Shared by TableActionButton (text) and TableActionIconButton (icon-only) -
// a plain constants module, not a component, so both can import it without
// tripping the react-refresh only-export-components rule.
export const TABLE_ACTION_PALETTE_STYLES = {
    // Solid fill (not just a light tint) on hover, plus white text: a
    // stronger cue than the other palettes deliberately, since this is
    // used for destructive actions (Delete/Purge).
    red: {
        border: "red.400", hoverBorder: "red.500",
        bg: "red.50", hoverBg: "red.500",
        borderDark: "red.400", hoverBorderDark: "red.600",
        bgDark: "red.950", hoverBgDark: "red.600",
        color: "fg.error", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Reactivate. Same solid-fill-on-hover shape as red/orange/blue/purple
    // below (not the light-tint-only hover it used to have) so every row
    // action "fills up" identically on hover instead of Reactivate alone
    // reading as a weaker, half-finished version of the others.
    green: {
        border: "green.400", hoverBorder: "green.600",
        bg: "green.50", hoverBg: "green.500",
        borderDark: "green.400", hoverBorderDark: "green.500",
        bgDark: "green.950", hoverBgDark: "green.600",
        color: "fg.success", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Edit. Light tint at rest, but fills fully solid with white text on
    // hover, same as red/green above, matching how Delete/Purge read as
    // "activated" rather than just a shade darker. fg.warning is a semantic
    // token (system.ts) already tuned for this exact chip: orange.700 light /
    // orange.200 dark, same reasoning as fg.error/fg.success above.
    orange: {
        border: "orange.400", hoverBorder: "orange.600",
        bg: "orange.50", hoverBg: "orange.500",
        borderDark: "orange.400", hoverBorderDark: "orange.500",
        bgDark: "orange.950", hoverBgDark: "orange.600",
        color: "fg.warning", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // View. Same solid-fill-on-hover treatment as orange above; fg.info is
    // the blue.700/blue.200 counterpart to fg.warning.
    blue: {
        border: "blue.400", hoverBorder: "blue.600",
        bg: "blue.50", hoverBg: "blue.500",
        borderDark: "blue.400", hoverBorderDark: "blue.500",
        bgDark: "blue.950", hoverBgDark: "blue.600",
        color: "fg.info", colorDark: undefined, hoverColor: "white",
        hoverColorDark: "white",
    },
    // Policies. Purple rather than reusing green/orange/blue so it reads as
    // its own deliberate action next to Edit/View/Delete, and distinct from
    // the app's own brand teal. Same solid-fill-on-hover shape and same
    // explicit-colorDark reasoning as orange/blue above.
    purple: {
        border: "purple.400", hoverBorder: "purple.600",
        bg: "purple.50", hoverBg: "purple.500",
        borderDark: "purple.400", hoverBorderDark: "purple.500",
        bgDark: "purple.950", hoverBgDark: "purple.600",
        color: "purple.700", colorDark: "purple.200", hoverColor: "white",
        hoverColorDark: "white",
    },
} as const;
