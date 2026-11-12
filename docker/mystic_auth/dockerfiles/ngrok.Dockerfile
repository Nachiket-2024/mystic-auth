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
FROM ngrok/ngrok@sha256:ff3b5c3674432d14a786349908b7bdf28ee56c25662637afcbe7180d471993ef AS source

FROM golang:1.26.11-alpine@sha256:ae52b5bc6ed045a9ed26ab03dc19327a802a9cc9aa8b27ed57f5c6b60579b0bb AS healthcheck-build
WORKDIR /src
COPY docker/mystic_auth/ngrok/ngrok-healthcheck.go ./healthcheck.go
COPY docker/mystic_auth/ngrok/ngrok-healthcheck_test.go ./healthcheck_test.go
RUN GO111MODULE=off go test -v ./healthcheck.go ./healthcheck_test.go
RUN GO111MODULE=off CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /healthcheck ./healthcheck.go
COPY docker/mystic_auth/ngrok/ngrok-supervisor.go ./supervisor.go
COPY docker/mystic_auth/ngrok/ngrok-supervisor_test.go ./supervisor_test.go
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
