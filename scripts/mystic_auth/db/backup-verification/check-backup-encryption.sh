#!/usr/bin/env bash
# Check that no plaintext dump remains and every encrypted dump has a valid
# HMAC sidecar. Set BACKUP_ENCRYPTION_KEY to verify tags cryptographically.
#
# database-backup.sh (and its scheduled sidecar) have produced encrypted
# .dump.enc + .dump.enc.hmac pairs since the backup-encryption and
# backup-HMAC features landed; nothing enforced that older plaintext
# .dump files, or .enc files from the window before HMAC support existed,
# get cleaned up or backfilled. This check closes that gap: it fails if it
# finds any bare .dump/.sql file, or a .dump.enc with a missing or malformed
# .dump.enc.hmac sidecar. When BACKUP_ENCRYPTION_KEY is set, it also verifies
# each tag against the ciphertext.
#
# Usage: check-backup-encryption.sh [backup-directory]
# Default backup directory: ./backups

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
DEFAULT_BACKUP_DIR="$REPO_ROOT/backups"
BACKUP_DIR="${1:-${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "FAIL: backup directory does not exist: $BACKUP_DIR" >&2
  exit 1
fi

FAILURES=0

while IFS= read -r -d '' plaintext_file; do
  echo "FAIL: unencrypted backup artifact with no .enc counterpart: $plaintext_file" >&2
  FAILURES=$((FAILURES + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql' \) -print0)

while IFS= read -r -d '' enc_file; do
  hmac_file="${enc_file}.hmac"
  if [ ! -s "$hmac_file" ]; then
    echo "FAIL: encrypted backup missing or has an empty .hmac sidecar: $enc_file" >&2
    FAILURES=$((FAILURES + 1))
    continue
  fi

  hmac_value="$(<"$hmac_file")"
  if [[ ! "$hmac_value" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "FAIL: encrypted backup has a malformed .hmac sidecar: $enc_file" >&2
    FAILURES=$((FAILURES + 1))
    continue
  fi

  if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] && \
    ! "$REPO_ROOT/scripts/mystic_auth/db/backup-verification/backup-hmac.sh" \
      verify "$enc_file" "$BACKUP_ENCRYPTION_KEY"; then
    echo "FAIL: encrypted backup HMAC does not match its contents: $enc_file" >&2
    FAILURES=$((FAILURES + 1))
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump.enc' -print0)

if [ "$FAILURES" -ne 0 ]; then
  echo "FAIL: backup encryption check found $FAILURES problem(s) in $BACKUP_DIR." >&2
  exit 1
fi

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "OK: no plaintext dumps found; every encrypted dump has a valid HMAC sidecar in $BACKUP_DIR."
else
  echo "OK: no plaintext dumps found; every encrypted dump has a well-formed HMAC sidecar in $BACKUP_DIR. Set BACKUP_ENCRYPTION_KEY to verify tags."
fi
