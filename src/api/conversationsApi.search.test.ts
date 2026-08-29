import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchConversations } from "./conversationsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `18-01`. Follows `conversationsApi.erasure.test.ts`'s own split-by-feature shape and its own
 * `jsonResponse` helper convention.
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

function jsonResponse(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/problem+json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchConversations", () => {
  it("always sends phrase, and omits every optional parameter that was not given", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [],
        nextBeforeMessageId: null,
        searchedFrom: "2026-05-29T00:00:00Z",
        searchedTo: "2026-08-29T00:00:00Z",
      }),
    );

    await searchConversations("token", { phrase: "refund" });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe("https://api.test.invalid/api/v1/conversations/search?phrase=refund");
  });

  it("carries from/to/beforeMessageId/pageSize through as query parameters when given", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [],
        nextBeforeMessageId: null,
        searchedFrom: "2026-05-29T00:00:00Z",
        searchedTo: "2026-08-29T00:00:00Z",
      }),
    );

    await searchConversations("token", {
      phrase: "refund",
      from: "2026-05-01T00:00:00Z",
      to: "2026-08-01T00:00:00Z",
      beforeMessageId: "11111111-1111-1111-1111-111111111111",
      pageSize: 10,
    });

    const [url] = fetchMock.mock.calls[0] as [URL];
    const params = new URL(url).searchParams;
    expect(params.get("phrase")).toBe("refund");
    expect(params.get("from")).toBe("2026-05-01T00:00:00Z");
    expect(params.get("to")).toBe("2026-08-01T00:00:00Z");
    expect(params.get("beforeMessageId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(params.get("pageSize")).toBe("10");
  });

  it("resolves with the response body on 200, echoed range included", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [],
        nextBeforeMessageId: null,
        searchedFrom: "2026-05-29T00:00:00Z",
        searchedTo: "2026-08-29T00:00:00Z",
      }),
    );

    const response = await searchConversations("token", { phrase: "refund" });

    expect(response.searchedFrom).toBe("2026-05-29T00:00:00Z");
    expect(response.searchedTo).toBe("2026-08-29T00:00:00Z");
  });

  it("throws ApiProblemError carrying Conversation.Forbidden on a 403, not a bare Error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { type: "Conversation.Forbidden", detail: "no" }));

    await expect(searchConversations("token", { phrase: "refund" })).rejects.toMatchObject({
      code: "Conversation.Forbidden",
    });
  });

  it("throws ApiProblemError carrying Conversation.SearchInvalidQuery on a 400", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { type: "Conversation.SearchInvalidQuery", detail: "Search phrase must not be empty." }),
    );

    await expect(searchConversations("token", { phrase: " " })).rejects.toBeInstanceOf(ApiProblemError);
  });
});
