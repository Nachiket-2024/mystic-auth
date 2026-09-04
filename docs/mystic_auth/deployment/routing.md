# Frontend and Backend Routing
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

Production-shaped deployments use a single public origin by default. The frontend nginx container serves the SPA and proxies API prefixes to the backend service.

---

## 1. Same-origin API proxy
---

`docker/nginx.frontend.conf` forwards these prefixes to `backend:8000`:

1. `/auth`
2. `/audit`
3. `/users`
4. `/authorization`
5. `/health`
6. `/rate-limits`

This works when `VITE_API_BASE_URL` is empty. The browser calls the same origin that served the SPA, and nginx handles the backend hop inside Docker.

---

## 2. Trusted proxy IPs
---

Each production-shaped Compose file pins frontend and tunnel proxy containers to fixed addresses so the backend can safely trust `X-Forwarded-For` from those hops.

| Compose file | Frontend IP | Tunnel/proxy IP | Env value |
|---|---|---|---|
| `docker-compose.local-prod-cloudflare.yml` | `172.28.0.10` | `172.28.0.11` | `TRUSTED_PROXY_IPS=172.28.0.10,172.28.0.11` |
| `docker-compose.local-prod-ngrok.yml` | `172.30.0.10` | `172.30.0.11` | `TRUSTED_PROXY_IPS=172.30.0.10,172.30.0.11` |
| `docker-compose.local-prod-tailscale.yml` | `172.31.0.10` | `172.31.0.11` | `TRUSTED_PROXY_IPS=172.31.0.10,172.31.0.11` |
| `docker-compose.prod.yml` | `172.29.0.10` | `172.29.0.11` | `TRUSTED_PROXY_IPS=172.29.0.10,172.29.0.11` |

`proxy_add_x_forwarded_for` appends instead of overwriting, preserving the client IP chain.

---

## 3. Route collision handling
---

The SPA and API share one origin, so a top-level SPA route can collide with an API prefix. `/users` and `/rate-limits` are both SPA pages and backend prefixes.

Client-side navigation does not hit nginx, but hard refreshes and bookmarks do. Without exact-match overrides, nginx can return backend JSON instead of `index.html`.

`docker/nginx.frontend.conf` fixes those two collisions with exact-match locations:

```nginx
location = /users {
    try_files /index.html /index.html;
}
location = /rate-limits {
    try_files /index.html /index.html;
}
```

These exact paths are safe because frontend API calls use `/users/`, `/users/{email}`, `/rate-limits/`, or `/rate-limits/{key}`, not bare `/users` or `/rate-limits`.

---

## 4. Adding a new colliding route
---

If a new SPA route starts with an API prefix, add an exact-match nginx carve-out for the frontend route.

```nginx
location = /health-status {
    try_files /index.html /index.html;
}
```

Do this only for concrete SPA routes that collide. Do not remove the API proxy prefixes.

---

## 5. Split frontend deployment
---

If the frontend is hosted outside this nginx container:

1. Set `VITE_API_BASE_URL` to the backend public origin.
2. Set backend CORS values with `FRONTEND_BASE_URL` and `FRONTEND_ADDITIONAL_BASE_URLS`.
3. Set `TRUSTED_PROXY_IPS` to the proxy that actually sits in front of the backend.
4. Rebuild the frontend bundle after changing `VITE_API_BASE_URL`.

---
