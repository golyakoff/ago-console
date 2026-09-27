import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CannedResponsesError, fetchCannedResponses } from "./cannedResponsesApi.js";

/**
 * `23-118`/`23-99`: `fetchCannedResponses` feeds `CannedResponsesPage`'s list, where an empty list is a
 * legitimate "none configured" - so a dropped `title`/`body` would read as that empty. Rejected as
 * `CannedResponsesError('shape.mismatch')`, the same `code`-carrying type every other rejection here
 * produces, which `shapeMismatchMessage` localizes.
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCannedResponses - shape validation", () => {
  it("resolves the list when every response carries title and body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [{ title: "Greeting", body: "Hi!" }] }));

    await expect(fetchCannedResponses("token", "s1")).resolves.toEqual([{ title: "Greeting", body: "Hi!" }]);
  });

  it("resolves an empty list as an empty list - a site with none is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [] }));

    await expect(fetchCannedResponses("token", "s1")).resolves.toEqual([]);
  });

  it("throws CannedResponsesError('shape.mismatch') when a response is missing body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [{ title: "Greeting" }] }));

    const failure = await fetchCannedResponses("token", "s1").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(CannedResponsesError);
    expect((failure as CannedResponsesError).code).toBe("shape.mismatch");
    expect((failure as CannedResponsesError).message).toContain("body");
  });

  it("throws when the responses array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    expect(((await fetchCannedResponses("token", "s1").catch((r: unknown) => r)) as CannedResponsesError).code).toBe("shape.mismatch");
  });
});
