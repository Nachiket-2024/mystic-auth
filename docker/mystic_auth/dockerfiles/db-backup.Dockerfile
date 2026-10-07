FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS rclone-builder

ARG RCLONE_VERSION=1.75.1
ARG RCLONE_SOURCE_SHA256=fcc9351ab3976c73b4824cf7919f98f911f2442a606e2910fc2bd562111da220
ARG GRPC_VERSION=v1.85.0-dev.0.20260825072537-93e31b48545e

RUN apk add --no-cache ca-certificates curl tar \
    && mkdir -p /src /out \
    && curl -fsSL "https://github.com/rclone/rclone/archive/refs/tags/v${RCLONE_VERSION}.tar.gz" -o /tmp/rclone.tar.gz \
    && echo "${RCLONE_SOURCE_SHA256}  /tmp/rclone.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/rclone.tar.gz --strip-components=1 -C /src \
    && rm -f /tmp/rclone.tar.gz \
    && cd /src \
    && go mod edit -require="google.golang.org/grpc@${GRPC_VERSION}" \
    && go mod tidy \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/rclone .

FROM postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81

# The scheduled backup service needs both the B2 client and
# curl for the Sentry-compatible Bugsink failure notification. Keep the
# database client image as the base so pg_dump/pg_restore stay version-matched
# with the server image. Alpine avoids shipping the Postgres image's stale
# gosu Go binary; su-exec is the smaller native Alpine equivalent used by the
# entrypoint.
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates curl openssl su-exec \
    && addgroup -S -g 10001 mysticbackup \
    && adduser -S -D -H -u 10001 -G mysticbackup -s /sbin/nologin mysticbackup \
    && rm -f /usr/local/bin/gosu

COPY --from=rclone-builder /out/rclone /usr/local/bin/rclone
RUN chmod 0755 /usr/local/bin/rclone

COPY scripts/mystic_auth/db/database-backup/database-backup-failure-alert.sh /usr/local/bin/backup-failure-alert
COPY scripts/mystic_auth/db/backup-upload/backup-upload.sh /usr/local/bin/run-backup-upload
COPY scripts/mystic_auth/db/backup-verification/backup-hmac.sh /usr/local/bin/backup-hmac
RUN chmod 0755 /usr/local/bin/backup-failure-alert /usr/local/bin/run-backup-upload /usr/local/bin/backup-hmac

COPY docker/mystic_auth/dockerfiles/db-backup-entrypoint.sh /usr/local/bin/db-backup-entrypoint
RUN chmod 0755 /usr/local/bin/db-backup-entrypoint

# The production image is non-root by default. Compose services with a
# bind-mounted backup directory explicitly start the entrypoint as root so it
# can normalize that mount's ownership, then it drops to UID/GID 10001.
USER mysticbackup

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pg_isready -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1
