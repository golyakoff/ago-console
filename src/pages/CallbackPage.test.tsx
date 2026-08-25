import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { CallbackPage } from "./CallbackPage.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `10-03`: **the three states, as routing.** Before this item the callback had two - a token or a
 * failure - and every token it had ever seen belonged to an already-provisioned operator. Self
 * registration adds a third that looks identical from the browser's side: a real, signature-valid
 * Keycloak identity whose `sub` matches no `operators` row.
 *
 * Getting the split wrong is invisible in the way that matters. A freshly-registered visitor sent
 * to the queue sees an empty screen and a hub connection that will not open, with nothing naming
 * the reason; an existing operator sent to `/onboarding` is asked to create a second site the
 * server will refuse. Neither is an exception anything logs, and both are one `if` away from each
 * other.
 *
 * These assert the *destination*, through a real router, rather than that `navigate` was called
 * with a string - the route that renders is the behaviour, and `App.tsx` is free to move the
 * queue's path without this file lying about it.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const userManager = vi.hoisted(() => ({
  userManager: { signinRedirectCallback: vi.fn() },
  keycloakRegistrationRedirect: vi.fn(),
}));
const operatorsApi = vi.hoisted(() => ({ resolveOperatorState: vi.fn(), fetchMyPermissions: vi.fn() }));

vi.mock("../auth/userManager.js", () => userManager);
vi.mock("../api/operatorsApi.js", () => operatorsApi);

/** A token carrying nothing about operators - which is the honest shape: Keycloak signs identity,
 * and `adr/0022`'s resolve-at-request-time model means `OperatorId`/`SiteId` are never in it. */
function tokenBack(): User {
  return { access_token: "fresh-access-token", profile: { sub: "keycloak-sub" } } as unknown as User;
}

function app() {
  return (
    <MemoryRouter initialEntries={["/callback"]}>
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/" element={<p>the queue</p>} />
        <Route path="/onboarding" element={<p>set up your site</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  userManager.userManager.signinRedirectCallback.mockResolvedValue(tokenBack());
});

afterEach(async () => {
  await unmount();
});

describe("landing back from Keycloak", () => {
  it("takes an existing operator to the queue - state (a), unchanged", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("operator");

    const container = await render(app());

    expect(container.textContent).toContain("the queue");
  });

  it("takes a just-registered identity to the site setup form - state (b)", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("keycloak-identity-only");

    const container = await render(app());

    expect(container.textContent).toContain("set up your site");
  });

  it("routes on the server's answer, using the token it was handed and nothing in it", async () => {
    operatorsApi.resolveOperatorState.mockResolvedValue("operator");

    const container = await render(app());

    // The token above carries no operator claim of any kind, and this still lands in the queue:
    // the destination came from the server, which is the item's own rule (`10-03`: "the console
    // must not re-derive server-side authorization logic itself").
    expect(operatorsApi.resolveOperatorState).toHaveBeenCalledWith("fresh-access-token");
    expect(container.textContent).toContain("the queue");
  });

  it("says the sign-in failed when the code exchange is rejected - state (c), unchanged", async () => {
    userManager.userManager.signinRedirectCallback.mockRejectedValue(new Error("invalid_grant"));

    const container = await render(app());

    expect(container.textContent).toContain("Sign-in failed");
    expect(container.textContent).toContain("invalid_grant");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(container.textContent).not.toContain("set up your site");
    // Nothing to ask about: there is no token.
    expect(operatorsApi.resolveOperatorState).not.toHaveBeenCalled();
  });

  it("guesses no destination when the server cannot answer at all", async () => {
    // Fail closed. The API being down is not evidence of a fresh signup, and sending an established
    // operator to a registration form during an outage would have them create a second site as soon
    // as it came back.
    operatorsApi.resolveOperatorState.mockRejectedValue(new Error("Failed to resolve operator identity: 500"));

    const container = await render(app());

    expect(container.textContent).toContain("Sign-in failed");
    expect(container.textContent).not.toContain("set up your site");
    expect(container.textContent).not.toContain("the queue");
  });

  it("waits rather than showing either destination while the answer is in flight", async () => {
    operatorsApi.resolveOperatorState.mockReturnValue(new Promise(() => undefined));

    const container = await render(app());

    expect(container.querySelector("[role='status']")).not.toBeNull();
    expect(container.textContent).not.toContain("the queue");
    expect(container.textContent).not.toContain("set up your site");
  });
});
