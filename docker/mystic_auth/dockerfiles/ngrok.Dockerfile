# Minimal ngrok agent image: the vendor's own ngrok/ngrok images (debian and
# alpine variants) carry a large OS package set the agent itself never uses -
# confirmed via `trivy image`: the official debian-based image showed 340
# vulnerabilities (228 with no fix published anywhere yet), the alpine
# variant 91 (0 unfixable), while the ngrok binary copied onto a bare
# `scratch` base - with nothing else - showed only the vulnerabilities baked
# into ngrok's own compiled Go dependencies (unrelated OS-package noise
# eliminated entirely), at roughly a tenth the image size.
#
# The agent binary is statically linked (confirmed: `ldd` reports "Not a
# valid dynamic program"), so it needs nothing from the OS except a CA
# bundle for its own outbound TLS to ngrok's edge. No vendor entrypoint
# script is needed either: --authtoken is a first-class CLI flag (`ngrok
# http --authtoken=... frontend:80 --url=...`), so the compose service's
# `command:` carries the same authtoken explicitly instead of relying on
# the vendor image's env-var-to-config-file rewrite.
FROM ngrok/ngrok@sha256:2658b5ad05e1111e3ff07caa38d2eea742407b8de9a5978b88b87516debc0d2f AS source

FROM golang:1.26.10-alpine@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS healthcheck-build
WORKDIR /src
COPY docker/mystic_auth/ngrok-healthcheck.go ./healthcheck.go
COPY docker/mystic_auth/ngrok-healthcheck_test.go ./healthcheck_test.go
RUN GO111MODULE=off go test -v ./healthcheck.go ./healthcheck_test.go
RUN GO111MODULE=off CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /healthcheck ./healthcheck.go
COPY docker/mystic_auth/ngrok-supervisor.go ./supervisor.go
COPY docker/mystic_auth/ngrok-supervisor_test.go ./supervisor_test.go
RUN GO111MODULE=off go test -v ./supervisor.go ./supervisor_test.go
RUN GO111MODULE=off CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /supervisor ./supervisor.go

FROM scratch
COPY --from=source /bin/ngrok /ngrok
COPY --from=source /etc/ssl/certs/ca-bundle.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=healthcheck-build /healthcheck /healthcheck
COPY --from=healthcheck-build /supervisor /supervisor
USER 65532:65532
HEALTHCHECK --interval=15s --timeout=10s --start-period=20s --retries=3 CMD ["/healthcheck"]
ENTRYPOINT ["/supervisor"]
