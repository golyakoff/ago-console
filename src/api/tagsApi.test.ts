import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversationTags, fetchTags } from "./tagsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `23-118`/`23-99`: `fetchTags` (the site vocabulary) and `fetchConversationTags` (applied tags) both
 * feed lists where an empty list is a legitimate "no tags" - so a dropped field would read as that
 * empty rather than as a reader that did not answer. `fetchConversationTags` additionally requires
 * `source` (`19-02`). Both reject as `ApiProblemError('shape.mismatch')`.
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

const tag = { id: "t1", name: "refund", createdAt: "2026-08-01T00:00:00Z" };

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason);
}

describe("fetchTags - shape validation", () => {
  it("resolves the vocabulary when every tag carries its required keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tags: [tag] }));

    await expect(fetchTags("token", "s1")).resolves.toEqual([tag]);
  });

  it("resolves an empty vocabulary as an empty list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tags: [] }));

    await expect(fetchTags("token", "s1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a tag is missing createdAt", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tags: [{ id: "t1", name: "refund" }] }));

    const failure = await caught(fetchTags("token", "s1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("createdAt");
  });
});

describe("fetchConversationTags - shape validation", () => {
  it("resolves when every applied tag carries source alongside the vocabulary keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tags: [{ ...tag, source: "Operator" }] }));

    await expect(fetchConversationTags("token", "c1")).resolves.toEqual([{ ...tag, source: "Operator" }]);
  });

  it("throws when an applied tag is missing source - the vocabulary shape alone is not enough here", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tags: [tag] }));

    const failure = await caught(fetchConversationTags("token", "c1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("source");
  });
});
