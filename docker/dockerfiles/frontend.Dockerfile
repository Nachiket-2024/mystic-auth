# Vite dev server with HMR for docker-compose.yml. Default target. Stays
# root (unlike `production` below): it npm installs into a bind-mounted
# frontend/, and a non-root UID would fight host/container UID mismatches
# on that mount.
FROM node:22.23.2-bookworm AS dev

WORKDIR /app

# Required to compile native optional dependencies for Rollup / esbuild
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Produces the static production bundle (frontend/dist). Only reached with
# --target production; dev never builds this far.
FROM node:22.23.2-bookworm AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ .

# VITE_* vars are inlined into the bundle at build time, so they arrive as
# build args here (no .env bind mount like dev has). Re-exporting ARG as ENV
# is required for `vite build`'s child process to see them. None of these
# are secrets, they all end up readable in the shipped JS.
ARG VITE_API_BASE_URL
ARG VITE_APP_NAME
ARG VITE_APP_LOGO_URL
ARG VITE_APP_FAVICON_URL
ARG VITE_SUPPORT_EMAIL
ARG VITE_BRAND_COLOR
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_APP_LOGO_URL=${VITE_APP_LOGO_URL} \
    VITE_APP_FAVICON_URL=${VITE_APP_FAVICON_URL} \
    VITE_SUPPORT_EMAIL=${VITE_SUPPORT_EMAIL} \
    VITE_BRAND_COLOR=${VITE_BRAND_COLOR} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}

RUN npm run build

# Serves the static build via nginx: no Node.js, dev dependencies, or
# source maps, just the compiled assets. Used via `build.target: production`.
FROM nginx:stable-alpine AS production

COPY docker/nginx.frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# `apk upgrade` pulls in any Alpine security patches released since this base
# image tag was built, rather than waiting for the next `nginx:stable-alpine`
# republish - re-run on every rebuild since it isn't pinned to a snapshot.
# The stock image already ships an unprivileged "nginx" user and writable
# runtime dirs for it.
RUN apk upgrade --no-cache \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid
USER nginx

EXPOSE 80

# 127.0.0.1, not localhost: default.conf is root-owned, so the base image's
# entrypoint can't patch in an IPv6 listen directive, leaving nginx
# IPv4-only. "localhost" resolves to ::1 first here, which would look like
# connection-refused even though nginx is up.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
