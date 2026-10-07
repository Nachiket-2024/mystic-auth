#!/bin/sh
# Docker bind mounts keep the host directory's ownership. Normalize the
# backup directory while still privileged, then run the long-lived backup
# loop as the dedicated unprivileged user.
set -eu

if [ "$(id -u)" -ne 0 ]; then
    exec "$@"
fi

mkdir -p /backups
chown 10001:10001 /backups
exec su-exec 10001:10001 "$@"
