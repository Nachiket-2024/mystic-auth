FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS rclone-builder

ARG RCLONE_VERSION=1.75.1
ARG RCLONE_SOURCE_SHA256=fcc9351ab3976c73b4824cf7919f98f911f2442a606e2910fc2bd562111da220
ARG GRPC_VERSION=v1.85.0-dev.0.20260825072537-93e31b48545e
ARG X_NET_VERSION=v0.60.0

RUN apk add --no-cache ca-certificates curl tar \
    && mkdir -p /src /out \
    && curl -fsSL "https://github.com/rclone/rclone/archive/refs/tags/v${RCLONE_VERSION}.tar.gz" -o /tmp/rclone.tar.gz \
    && echo "${RCLONE_SOURCE_SHA256}  /tmp/rclone.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/rclone.tar.gz --strip-components=1 -C /src \
    && rm -f /tmp/rclone.tar.gz

WORKDIR /src

RUN go install github.com/google/go-licenses@v1.6.0

RUN go mod edit -require="google.golang.org/grpc@${GRPC_VERSION}" \
    -require="golang.org/x/net@${X_NET_VERSION}" \
    && go mod tidy \
    && GOFLAGS="-tags=noselfupdate" /go/bin/go-licenses save . --save_path=/out/rclone-licenses \
    && CGO_ENABLED=0 go build -tags=noselfupdate -trimpath -ldflags="-s -w" -o /out/rclone .

FROM cgr.dev/chainguard/wolfi-base:latest@sha256:81211e15a86ea1d5357f284482af45730c51de45eaf10ad9ce205d6bfc2df323

ARG POSTGRES_CLIENT_VERSION=18.6-r5

# The scheduled backup service needs both the B2 client and
# curl for the Sentry-compatible Bugsink failure notification. Keep the
# database client package so pg_dump/pg_restore stay exactly version-matched
# with the pinned PostgreSQL server image. Install only the client and the
# shell tools needed for the scheduled job; package licenses are retained in
# the image notice bundle below. The wolfi `setpriv` package (not BusyBox's
# reduced applet, which lacks --reuid) drops privileges after bind-mount
# ownership is normalized.
RUN apk update \
    && apk upgrade --no-cache \
    && apk add --upgrade --no-cache bash ca-certificates curl libbrotlicommon1 libbrotlidec1 libbrotlienc1 openssl shadow util-linux setpriv "postgresql-18-client=${POSTGRES_CLIENT_VERSION}" \
    && groupadd --system --gid 10001 mysticbackup \
    && useradd --system --uid 10001 --gid mysticbackup --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin mysticbackup \
    && mkdir -p /usr/share/licenses/mystic-auth/db-backup/wolfi \
    && awk -F: 'function flush(){if(!pkg)return;if(ver==""||lic=="")bad=1;print pkg "\t" ver "\t" lic;pkg=ver=lic=""} /^P:/{if(pkg)flush();pkg=substr($0,3)} /^V:/{ver=substr($0,3)} /^L:/{lic=substr($0,3)} /^$/{flush()} END{if(pkg)flush();if(bad)exit 1}' /lib/apk/db/installed > /tmp/wolfi-packages.tsv \
    && sort -k1,1 /tmp/wolfi-packages.tsv > /usr/share/licenses/mystic-auth/db-backup/wolfi/packages.tsv \
    && test -s /usr/share/licenses/mystic-auth/db-backup/wolfi/packages.tsv \
    && rm -f /tmp/wolfi-packages.tsv \
    && rm -rf /var/cache/apk/*

COPY --from=rclone-builder /out/rclone /usr/local/bin/rclone
COPY --from=rclone-builder /out/rclone-licenses/ /usr/share/licenses/mystic-auth/db-backup/rclone/
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
