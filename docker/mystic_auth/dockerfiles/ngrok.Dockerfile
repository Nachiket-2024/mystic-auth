# Minimal ngrok agent image. The vendor's ngrok/ngrok images carry a large OS
# package set the agent never uses (trivy: 340 vulnerabilities in the debian
# image, 91 in alpine). The static ngrok binary on a bare `scratch` base shows
# only the vulnerabilities in ngrok's own Go dependencies, at about a tenth of
# the size.
#
# The binary is statically linked, so it needs only a CA bundle for outbound TLS
# to ngrok's edge. No vendor entrypoint is needed: --authtoken is a CLI flag, so
# the compose service's `command:` passes the authtoken explicitly instead of
# relying on the vendor image's env-var-to-config-file rewrite.
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
