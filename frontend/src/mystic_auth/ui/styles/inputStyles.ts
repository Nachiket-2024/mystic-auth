// border.default is too close to bg.canvas for a search box sitting
// directly on the page (e.g. UsersPage/PoliciesPage), so this uses a fixed
// higher-contrast border plus bg.surface for a raised look, and a
// brand-color focus ring instead of the default gray one.
// Mirrors the backend's SEARCH_QUERY_MAX_LENGTH (core/search_query.py) so
// typing/pasting gets instant feedback instead of a 422 after submit. Not a
// security boundary on its own; the backend still enforces it independently.
export const SEARCH_QUERY_MAX_LENGTH = 100;

export const SEARCH_INPUT_PROPS = {
    bg: "bg.surface",
    borderColor: "gray.400",
    _hover: { borderColor: "gray.600" },
    _focus: { borderColor: "brand.solid", boxShadow: "0 0 0 1px var(--chakra-colors-brand-solid)" },
    _dark: { borderColor: "gray.600", _hover: { borderColor: "gray.400" } },
};
