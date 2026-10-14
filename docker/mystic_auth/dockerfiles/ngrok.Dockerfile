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
FROM ngrok/ngrok@sha256:cafcc30231c5704e87e3dd7274844cf4760381642d7737c1e58730863e7e1d85 AS source

FROM scratch
COPY --from=source /bin/ngrok /ngrok
COPY --from=source /etc/ssl/certs/ca-bundle.crt /etc/ssl/certs/ca-certificates.crt
ENTRYPOINT ["/ngrok"]
