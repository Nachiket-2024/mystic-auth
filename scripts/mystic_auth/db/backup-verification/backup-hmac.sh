#!/usr/bin/env bash
# Detached HMAC-SHA256 tamper-evidence for backup ciphertext.
#
# Backups use AES-256-CBC via `openssl enc` (see database-backup.sh), which has
# no authenticated mode (`openssl enc -aes-256-gcm` fails: the subcommand does
# not support AEAD ciphers). This adds encrypt-then-MAC: a detached HMAC-SHA256
# tag written beside the ciphertext as "<file>.hmac".
#
# The MAC key is not the AES passphrase: it is HMAC-SHA256 of a fixed label keyed
# by the passphrase, so the MAC key and the PBKDF2-stretched encryption key stay
# independent.
#
# Usage:
#   backup-hmac.sh tag    <file> <passphrase>   writes <file>.hmac
#   backup-hmac.sh verify <file> <passphrase>   exit 0 if <file>.hmac matches,
#                                                1 if it exists and does not,
#                                                2 if no .hmac file exists
#
# Used on the host (database-backup.sh, database-restore.sh) and inside the
# db_backup container (copied to /usr/local/bin/backup-hmac by
# db-backup.Dockerfile), so one implementation serves both.
set -euo pipefail

mac_key() {
  printf '%s' "mystic-auth-backup-mac-v1" | openssl dgst -sha256 -hmac "$1" | awk '{print $NF}'
}

tag_file() {
  local file="$1" passphrase="$2" key
  key="$(mac_key "$passphrase")"
  openssl dgst -sha256 -hmac "$key" "$file" | awk '{print $NF}' > "${file}.hmac"
}

verify_file() {
  local file="$1" passphrase="$2" key expected actual
  if [ ! -f "${file}.hmac" ]; then
    return 2
  fi
  key="$(mac_key "$passphrase")"
  expected="$(cat "${file}.hmac")"
  actual="$(openssl dgst -sha256 -hmac "$key" "$file" | awk '{print $NF}')"
  [ "$expected" = "$actual" ]
}

case "${1:-}" in
  tag)
    tag_file "${2:?file is required}" "${3:?passphrase is required}"
    ;;
  verify)
    verify_file "${2:?file is required}" "${3:?passphrase is required}"
    ;;
  *)
    echo "Usage: $0 tag|verify <file> <passphrase>" >&2
    exit 2
    ;;
esac
