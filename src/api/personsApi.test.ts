import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonConversations, getPersons } from "./personsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `23-118`/`23-99`: `getPersons` feeds `usePersonNames`'s display-merge (`adr/0184`), where a truncated
 * person row would read as "no name recorded yet" rather than as a reader that did not answer. It
 * rejects a mis-shaped response as `ApiProblemError('shape.mismatch')`, the shared chat-reader type.
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

const person = {
  personId: "p1",
  displayName: null,
  channels: [],
  firstSeenAt: "2026-08-01T00:00:00Z",
  lastSeenAt: "2026-08-02T00:00:00Z",
};

describe("getPersons - shape validation", () => {
  it("short-circuits an empty id list without a request", async () => {
    await expect(getPersons("token", [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the persons list when every entry carries its required keys (displayName may be null)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { persons: [person] }));

    await expect(getPersons("token", ["p1"])).resolves.toEqual([person]);
  });

  it("resolves a genuinely empty answer as [] - ids that resolve to nobody are simply absent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { persons: [] }));

    await expect(getPersons("token", ["missing"])).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a person is missing displayName - a dropped key is not a nameless person", async () => {
    const truncated = { personId: "p1", channels: [], firstSeenAt: "2026-08-01T00:00:00Z", lastSeenAt: "2026-08-02T00:00:00Z" };
    fetchMock.mockResolvedValue(jsonResponse(200, { persons: [truncated] }));

    const failure = await getPersons("token", ["p1"]).catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("displayName");
  });

  it("throws when the persons array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    expect(((await getPersons("token", ["p1"]).catch((r: unknown) => r)) as ApiProblemError).code).toBe("shape.mismatch");
  });
});

/** `26-269`: the client-detail hub's own new chat read - "which conversation do I open for this
 * person". Same shape-at-the-boundary discipline `getPersons` above already exercises for its own
 * response, over the new `/persons/{personId}/conversations` route. */
describe("getPersonConversations - 26-269 shape validation", () => {
  const conversation = {
    conversationId: "conv-1",
    state: "Assigned",
    isActive: true,
    startedAt: "2026-08-01T00:00:00Z",
    closedAt: null,
    lastActivityAt: "2026-08-01T00:05:00Z",
  };

  it("addresses this person's own conversations route and resolves the array", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [conversation] }));

    await expect(getPersonConversations("token", "p1")).resolves.toEqual([conversation]);
    expect((fetchMock.mock.calls[0]?.[0] as string)).toContain("/persons/p1/conversations");
  });

  it("resolves an empty list for a person with no conversation yet - never an error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [] }));

    await expect(getPersonConversations("token", "p1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a row drops isActive - the one fact the hub branches on", async () => {
    const withoutIsActive = Object.fromEntries(Object.entries(conversation).filter(([key]) => key !== "isActive"));
    fetchMock.mockResolvedValue(jsonResponse(200, { conversations: [withoutIsActive] }));

    const failure = await getPersonConversations("token", "p1").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("isActive");
  });

  it("throws when the conversations array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    expect(((await getPersonConversations("token", "p1").catch((r: unknown) => r)) as ApiProblemError).code).toBe("shape.mismatch");
  });
});
