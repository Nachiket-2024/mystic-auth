# Build MaxMind's geoipupdate from its published source release so the Go
# standard library and Alpine packages get security fixes before MaxMind
# republishes its image. Keep the source archive digest-pinned and retain
# dependency notices in the resulting runtime image. The entry script is
# upstream's own, so GEOIPUPDATE_* variables and the update loop behave the same.
FROM golang:1.27.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS builder

ARG GEOIPUPDATE_VERSION=8.0.0
ARG GEOIPUPDATE_SOURCE_SHA256=5c08b39d2ac49ad492138b3d618dddac130065852b6237ec450bac856ace7e0a

RUN apk add --no-cache ca-certificates curl tar \
    && mkdir /src /out \
    && curl -fsSL "https://github.com/maxmind/geoipupdate/archive/refs/tags/v${GEOIPUPDATE_VERSION}.tar.gz" -o /tmp/geoipupdate.tar.gz \
    && echo "${GEOIPUPDATE_SOURCE_SHA256}  /tmp/geoipupdate.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/geoipupdate.tar.gz --strip-components=1 -C /src \
    && rm -f /tmp/geoipupdate.tar.gz

WORKDIR /src

RUN go install github.com/google/go-licenses@v1.6.0

RUN go test ./... \
    && /go/bin/go-licenses save ./cmd/geoipupdate --save_path=/out/licenses \
    && cp LICENSE-APACHE LICENSE-MIT /out/licenses/ \
    && CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w -X main.version=${GEOIPUPDATE_VERSION}" -o /out/geoipupdate ./cmd/geoipupdate

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
# Pull in Alpine security patches released since the base image was built.
RUN apk upgrade --no-cache
COPY --from=builder /src/docker/entry.sh /usr/bin/entry.sh
COPY --from=builder /out/geoipupdate /usr/bin/geoipupdate
COPY --from=builder /out/licenses/ /usr/share/licenses/geoipupdate/
RUN chmod 0755 /usr/bin/entry.sh /usr/bin/geoipupdate
WORKDIR /var/lib/geoipupdate
VOLUME ["/usr/share/GeoIP"]
ENTRYPOINT ["/usr/bin/entry.sh"]
