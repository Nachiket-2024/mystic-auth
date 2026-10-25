# Build Cloudflare Tunnel from its published source release so its Go
# dependencies can receive security fixes before Cloudflare republishes the
# vendor binary. Keep the source archive digest-pinned and retain dependency
# notices in the resulting runtime image.
FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS builder

ARG CLOUDFLARED_VERSION=2026.10.2
ARG CLOUDFLARED_SOURCE_SHA256=8dde1e9e4b0ad5ae09abd7b5790dabc9195ba48a5c7f0af7e54e787eef54a3cb
ARG KLAUSPOST_COMPRESS_VERSION=v1.18.7

RUN apk add --no-cache ca-certificates curl tar \
    && mkdir -p /src /out \
    && curl -fsSL "https://github.com/cloudflare/cloudflared/archive/refs/tags/${CLOUDFLARED_VERSION}.tar.gz" -o /tmp/cloudflared.tar.gz \
    && echo "${CLOUDFLARED_SOURCE_SHA256}  /tmp/cloudflared.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/cloudflared.tar.gz --strip-components=1 -C /src \
    && rm -f /tmp/cloudflared.tar.gz

COPY docker/mystic_auth/cloudflared-healthcheck.go /tmp/healthcheck.go
COPY docker/mystic_auth/cloudflared-healthcheck_test.go /tmp/healthcheck_test.go
COPY docker/mystic_auth/cloudflared-entrypoint.go /tmp/entrypoint.go
COPY docker/mystic_auth/cloudflared-entrypoint_test.go /tmp/entrypoint_test.go

WORKDIR /src

RUN go install github.com/google/go-licenses@v1.6.0

RUN go mod edit -require="github.com/klauspost/compress@${KLAUSPOST_COMPRESS_VERSION}" \
    && go mod tidy \
    && go test ./cmd/cloudflared/... \
    && /go/bin/go-licenses save ./cmd/cloudflared --save_path=/out/licenses \
    && CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w -X main.Version=${CLOUDFLARED_VERSION}" -o /out/cloudflared ./cmd/cloudflared \
    && GO111MODULE=off go test /tmp/healthcheck.go /tmp/healthcheck_test.go \
    && GO111MODULE=off CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/healthcheck /tmp/healthcheck.go \
    && GO111MODULE=off go test /tmp/entrypoint.go /tmp/entrypoint_test.go \
    && GO111MODULE=off CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/entrypoint /tmp/entrypoint.go

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/cloudflared /cloudflared
COPY --from=builder /out/entrypoint /entrypoint
COPY --from=builder /out/licenses/ /usr/share/licenses/cloudflared/
COPY --from=builder /out/healthcheck /healthcheck
USER 0:0
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD ["/healthcheck"]
ENTRYPOINT ["/entrypoint"]
