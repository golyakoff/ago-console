import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOperatorState } from "./operatorsApi.js";

/**
 * `10-03`: **how state (b) is actually detected.** The backlog item is explicit that the console
 * must not re-derive the server's own authorization decision - no decoding the JWT and guessing
 * whether an `operators` row exists behind its `sub`. This function is the whole of the client-side
 * signal, and it is a *read* of the server's answer: `GET /api/v1/operators/me` is gated by
 * `RequireOperatorIdentity`, whose `RequireClaim(OperatorId)` is exactly
 * `OperatorIdentityClaimsTransformation`'s resolution result, computed server-side, per request.
 *
 * Which makes the status-code mapping load-bearing, and it is tested here rather than through
 * `CallbackPage` because the two failure directions are invisible on screen:
 * - reading a `401` as "not an operator yet" would take an operator whose token expired to the
 *   *signup* form, where `10-02`'s endpoint would then reject them with a `409`;
 * - reading a `500` as "not an operator yet" would do the same to every operator during an API
 *   outage.
 * Both fail closed here: anything that is not the server's own two answers is an error, and
 * `CallbackPage` renders it as "sign-in failed" rather than guessing a destination.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const fetchMock = vi.fn();

function answers(status: number): void {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ operatorId: "op", siteId: "site", permissions: [] }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolving whether a freshly-authenticated token is an operator", () => {
  it("asks the server, presenting the token, instead of inspecting the token itself", async () => {
    answers(200);

    await resolveOperatorState("the-access-token");

    expect(fetchMock).toHaveBeenCalledWith("https://api.test.invalid/api/v1/operators/me", {
      headers: { Authorization: "Bearer the-access-token" },
    });
  });

  it("reads a token the server accepts as an operator - state (a)", async () => {
    answers(200);

    await expect(resolveOperatorState("token")).resolves.toBe("operator");
  });

  it("reads the server's 403 as a real Keycloak identity that is not an operator yet - state (b)", async () => {
    // `RequireOperatorIdentity` on an authenticated principal whose `OperatorId` claim is absent:
    // ASP.NET Core's own answer for "authenticated, policy requirement failed".
    answers(403);

    await expect(resolveOperatorState("token")).resolves.toBe("keycloak-identity-only");
  });

  it("does not read a 401 as a fresh signup", async () => {
    // A rejected token is state (c). Treating it as (b) would route an operator whose session went
    // bad into the signup form.
    answers(401);

    await expect(resolveOperatorState("token")).rejects.toThrow(/401/);
  });

  it("does not read a server error as a fresh signup", async () => {
    answers(500);

    await expect(resolveOperatorState("token")).rejects.toThrow(/500/);
  });

  it("does not swallow a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(resolveOperatorState("token")).rejects.toThrow(/Failed to fetch/);
  });
});
