#!/usr/bin/env bash
# Warns when the public TLS certificate is close to expiring. Caddy renews
# automatically, so an alert here means a renewal is failing (DNS change, rate
# limit, port 80 blocked) while there is still time to fix it.
#
# Usage: cert-expiry-check.sh <host> [warn-days] [port]
#   warn-days defaults to 14, port to 443.
# Exit 0 = fine, 1 = expiring or expired, 2 = could not read the certificate.
# If SECURITY_ALERT_WEBHOOK_URL is set (ntfy, see
# docs/mystic_auth/error-monitoring/ntfy-alerts.md) a message is posted there
# too, with SECURITY_ALERT_WEBHOOK_TOKEN as a bearer token when present.
#
# Run it from the host's cron or a systemd timer once a day, for example:
#   17 6 * * *  SECURITY_ALERT_WEBHOOK_URL=... /path/to/cert-expiry-check.sh example.com
set -euo pipefail

HOST="${1:?usage: cert-expiry-check.sh <host> [warn-days] [port]}"
WARN_DAYS="${2:-14}"
PORT="${3:-443}"

notify() {
  echo "$1"
  [ -n "${SECURITY_ALERT_WEBHOOK_URL:-}" ] || return 0
  local auth=()
  [ -n "${SECURITY_ALERT_WEBHOOK_TOKEN:-}" ] && auth=(-H "Authorization: Bearer ${SECURITY_ALERT_WEBHOOK_TOKEN}")
  curl --silent --max-time 10 "${auth[@]}" -H "Title: Certificate expiry" -H "Priority: high" \
    -d "$1" "$SECURITY_ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
}

NOT_AFTER="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:$PORT" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')" || true
if [ -z "$NOT_AFTER" ]; then
  notify "Could not read the TLS certificate for $HOST:$PORT"
  exit 2
fi

EXPIRES="$(date -d "$NOT_AFTER" +%s)"
DAYS_LEFT=$(( (EXPIRES - $(date +%s)) / 86400 ))
if [ "$DAYS_LEFT" -lt "$WARN_DAYS" ]; then
  notify "TLS certificate for $HOST expires in $DAYS_LEFT days ($NOT_AFTER). Check the renewal."
  exit 1
fi
echo "OK: $HOST certificate has $DAYS_LEFT days left (expires $NOT_AFTER)"
