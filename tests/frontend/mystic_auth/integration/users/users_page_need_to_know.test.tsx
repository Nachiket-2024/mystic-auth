import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mock, seed, renderPage, SAMPLE_USERS } from "./userAccessDialogTestSupport";

// Need-to-know: a caller who cannot read policies or permissions must not see
// controls for them, and the page must not even ask the API for them (a refused
// request writes a denied row to the authorization audit log on every load).

const requestedUrls = () => mock.history.get.map((r) => r.url ?? "");

describe("UsersPage need-to-know gating", () => {
  beforeEach(() => {
    mock.reset();
    mock.onGet("/users/").reply(200, SAMPLE_USERS);
  });

  it("with only users:list_all: no policy/permission filters, no policy or catalog request", async () => {
    seed(["users:list_all"]);
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Regular User");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));

    expect(screen.queryByRole("button", { name: /filter by policy/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /filter by permission/i })).toBeNull();
    expect(requestedUrls().some((u) => u.startsWith("/authorization/"))).toBe(false);
  });

  it("with only users:list_all: no menu button on rows, and the View dialog has no Policies/Permissions tab", async () => {
    seed(["users:list_all"]);
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Regular User");
    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull();

    const view = screen.getAllByRole("button", { name: "View" });
    await user.click(view[view.length - 1]);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("tab", { name: /Details/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /Policies/ })).toBeNull();
    expect(within(dialog).queryByRole("tab", { name: /Permissions/ })).toBeNull();
    await waitFor(() => expect(requestedUrls().some((u) => u.startsWith("/authorization/"))).toBe(false));
  });

  it("with policies:read: the policy and permission filters appear and the policy list is requested", async () => {
    seed(["users:list_all", "policies:read"]);
    mock.onGet("/authorization/policies").reply(200, []);
    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Regular User");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));

    expect(await screen.findByRole("button", { name: /filter by policy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filter by permission/i })).toBeInTheDocument();
  });

  it("a menu appears only once the caller holds one of the actions inside it", async () => {
    seed(["users:list_all", "users:deactivate_any"]);
    renderPage();

    await screen.findByText("Regular User");

    expect(screen.getAllByRole("button", { name: /more actions/i }).length).toBeGreaterThan(0);
  });
});
