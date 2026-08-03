# Your Project's Docs

This folder is empty by default. Put product-specific documentation here, the
same way product-specific code belongs in `backend/app/` and
`frontend/src/app/`.

`docs/mystic_auth/` holds the template reference docs for architecture,
authentication, authorization, and infrastructure. Treat that folder as
upstream-owned so future `scripts/sync-upstream.sh` runs can merge cleanly.
Anything about your product, domains, or decisions belongs in this folder.

See [Using This Repository as a Template](../mystic_auth/template-usage/overview.md)
for the `app/` versus `mystic_auth/` split. See
[Worked Example: Adding a New Domain, End to End](../mystic_auth/template-usage/worked-example.md)
for a copy-and-rename starting point for your first feature.
