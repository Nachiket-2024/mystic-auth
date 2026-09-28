"""
App-specific extension surface (see docs/mystic_auth/template-usage/overview.md).

Counterpart to sdk.py: sdk.py re-exports the template's own building blocks
and isn't meant to be hand-edited. This file is where a project built on the
template adds its own re-exports and startup registrations for its own domain
code, so template updates never conflict with app-specific additions here.

Ships empty upstream on purpose, so it never conflicts on a
`scripts/mystic_auth/upstream-sync/sync-upstream.sh` sync. If a sync ever shows a change to this file
coming from upstream anyway, keep YOUR version: upstream's is only ever the
empty starting point.

Add your own imports/exports below as your app grows. Register application
condition handlers from `register_extensions` rather than editing the
upstream authorization package.
"""


def register_extensions() -> None:
    """Register downstream condition handlers before requests are served."""
    # Example shape:
    # from .authorization.conditions.project_scope import ProjectScopeCondition
    # from .authorization.conditions.project_scope import validate_project_scope
    # from .sdk import register_condition_type
    # register_condition_type("project_scope", ProjectScopeCondition(), validate_project_scope)
