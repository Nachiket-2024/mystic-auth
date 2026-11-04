"""Read-side helpers for policy history entries."""


def definition_for_entry(entry) -> dict | None:
    """
    The full policy definition snapshot "at" a given history entry: its
    new_definition, or (for a "deleted" entry, which has none) its
    previous_definition instead, so every entry type resolves to a
    comparable/rollback-able snapshot without compare/rollback needing
    special-case handling per change_type.
    """
    return entry.new_definition if entry.new_definition is not None else entry.previous_definition
