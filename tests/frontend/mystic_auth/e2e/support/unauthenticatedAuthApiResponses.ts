import type { Route } from "@playwright/test";

export function fulfillUnauthenticatedAuthJson(route: Route, json: unknown, status = 200) {
  return route.fulfill({
    status,
    json,
    headers: {
      "access-control-allow-origin": "http://localhost:5173",
      "access-control-allow-credentials": "true",
    },
  });
}
