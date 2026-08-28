# Shared by every repository that turns a free-text `search`/`ip_address`
# query param into a SQL ILIKE substring match (user/user_crud_modules/user_base_crud.py,
# authorization/repositories/policy_repository.py, both audit log
# repositories): kept in one place so the escaping and length cap can't
# drift out of sync between them.

# Matches the CSV-export name field's own cap (user_management_query_routes.py's
# _csv_safe comment) - generous for a real search term, but bounds how much
# text an ILIKE scan has to compare per row.
SEARCH_QUERY_MAX_LENGTH = 100

ILIKE_ESCAPE_CHAR = "\\"


def ilike_pattern(value: str) -> str:
    """Builds a `%value%` ILIKE pattern with the caller's own literal
    `%`/`_` (and the escape char itself) escaped first, so e.g. searching
    "50%_off" matches that literal text instead of being reinterpreted as
    SQL LIKE wildcards. Left unescaped, a search of just "%" or "_"
    degenerates into an unindexed full-table substring scan matching every
    row, and repeating those characters (or pathological alternations) can
    make that scan arbitrarily more expensive - a cheap DoS lever against a
    query param no caller should be able to turn into raw LIKE syntax.
    Pass the result to `.ilike(pattern, escape=ILIKE_ESCAPE_CHAR)`.
    """
    escaped = (
        value.replace(ILIKE_ESCAPE_CHAR, ILIKE_ESCAPE_CHAR * 2)
        .replace("%", f"{ILIKE_ESCAPE_CHAR}%")
        .replace("_", f"{ILIKE_ESCAPE_CHAR}_")
    )
    return f"%{escaped}%"
