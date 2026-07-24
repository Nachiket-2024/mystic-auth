# Your project's docs

Empty by default — this is where your own project's documentation goes, the same way `backend/app/` and `frontend/src/app/` are where your own code goes.

`docs/mystic_auth/` holds the template's own reference docs (architecture, authentication, authorization, etc.) and stays upstream's — don't edit it, and expect to merge future updates into it cleanly, the same way you would with `backend/mystic_auth/` or `frontend/src/mystic_auth/`. Anything you write about your own product, your own domains, or your own decisions goes here in `docs/app/` instead, so a future `git merge upstream/main` never touches it.

See [Using This Repository as a Template](../mystic_auth/template-usage.md) for the full explanation of the `app/` vs `mystic_auth/` split.
