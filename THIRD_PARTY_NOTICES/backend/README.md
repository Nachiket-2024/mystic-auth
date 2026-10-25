# Backend third-party notices and source access

The backend runtime includes Psycopg 3.3.6 (`psycopg`, `psycopg-binary`, and
`psycopg-pool`), licensed under LGPL-3.0-only. The complete license text is
included with each package notice in this directory. `GPL-3.0.txt` is included
as the companion license text required by LGPLv3 when conveying a Combined
Work. The runtime image copies this entire directory to
`/usr/share/licenses/mystic-auth/backend/`.

The corresponding application code is copied into `/app` in the backend image
from this repository's `backend/` directory. The container also retains the
Python package source under `/opt/venv/lib/python3.14/site-packages/psycopg/`
and `/opt/venv/lib/python3.14/site-packages/psycopg_pool/`. The binary extra
provides a compiled extension and bundled libpq; upstream source for the exact
Psycopg release is published by the maintainers at
<https://github.com/psycopg/psycopg/tree/a67654d1e7afbf9b3a619557838f62de1c790e7c> and
<https://github.com/psycopg/psycopg/tree/a67654d1e7afbf9b3a619557838f62de1c790e7c/psycopg_c>.

For an image release, retain the matching repository revision and image SBOM
with the image. Recipients can inspect the bundled application and package
sources in the image and replace the Python library files when building a
modified image. Do not add terms that prohibit reverse engineering for
debugging such modifications. This notice documents the project packaging;
it is not a legal opinion about a particular distribution model.
