#!/usr/bin/env bash
# Compose env files use $${...} to preserve a dollar sign through Compose
# interpolation. Normalize that representation before executing the operator's
# upload hook with the verified dump path.
set -euo pipefail

DUMP_FILE="${1:?dump file is required}"
UPLOAD_COMMAND="$(printf '%s' "${BACKUP_UPLOAD_COMMAND:-}" | sed 's/\$\$/\$/g')"

[ -n "$UPLOAD_COMMAND" ] || exit 0
DUMP_FILE="$DUMP_FILE" sh -c "$UPLOAD_COMMAND"
