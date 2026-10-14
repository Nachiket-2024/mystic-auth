#!/usr/bin/env bash
# Deterministic regression tests for check-backup-encryption.sh.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/mystic_auth/db/backup-verification/check-backup-encryption.sh"
HMAC_SCRIPT="$REPO_ROOT/scripts/mystic_auth/db/backup-verification/backup-hmac.sh"
TEST_KEY="disposable-backup-check-key"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

echo "=== fully encrypted backup with HMAC sidecar passes ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
"$HMAC_SCRIPT" tag "$TEST_DIR/mystic_auth-20260101-000000.dump.enc" "$TEST_KEY"
if BACKUP_ENCRYPTION_KEY="$TEST_KEY" bash "$SCRIPT" "$TEST_DIR" >/dev/null; then
  pass "encrypted backup with valid hmac sidecar is accepted"
else
  fail "encrypted backup with valid hmac sidecar was rejected"
fi

echo "=== plaintext .dump fails even if another artifact exists ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump"
printf 'ciphertext\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
"$HMAC_SCRIPT" tag "$TEST_DIR/mystic_auth-20260101-000000.dump.enc" "$TEST_KEY"
if bash "$SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
  fail "plaintext .dump was accepted"
else
  pass "plaintext .dump is rejected"
fi

echo "=== plaintext .sql with no .enc counterpart fails ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.sql"
if bash "$SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
  fail "plaintext .sql was accepted"
else
  pass "plaintext .sql is rejected"
fi

echo "=== .dump.enc with no .hmac sidecar fails ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
if bash "$SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
  fail ".dump.enc with no .hmac sidecar was accepted"
else
  pass ".dump.enc with no .hmac sidecar is rejected"
fi

echo "=== malformed HMAC sidecar fails ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
printf 'not-a-valid-hmac\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc.hmac"
if bash "$SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
  fail "malformed HMAC sidecar was accepted"
else
  pass "malformed HMAC sidecar is rejected"
fi

echo "=== HMAC mismatch fails when a key is configured ==="
rm -f "$TEST_DIR"/*
printf 'fixture\n' > "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
"$HMAC_SCRIPT" tag "$TEST_DIR/mystic_auth-20260101-000000.dump.enc" "$TEST_KEY"
printf 'tampered\n' >> "$TEST_DIR/mystic_auth-20260101-000000.dump.enc"
if BACKUP_ENCRYPTION_KEY="$TEST_KEY" bash "$SCRIPT" "$TEST_DIR" >/dev/null 2>&1; then
  fail "backup with a mismatched HMAC was accepted"
else
  pass "backup with a mismatched HMAC is rejected"
fi

echo "=== missing backup directory fails ==="
if bash "$SCRIPT" "$TEST_DIR/missing" >/dev/null 2>&1; then
  fail "missing backup directory was accepted"
else
  pass "missing backup directory is rejected"
fi

echo "=== empty backup directory passes (nothing to flag) ==="
rm -f "$TEST_DIR"/*
if bash "$SCRIPT" "$TEST_DIR" >/dev/null; then
  pass "empty backup directory is accepted"
else
  fail "empty backup directory was rejected"
fi

echo "All backup-encryption checks passed."
