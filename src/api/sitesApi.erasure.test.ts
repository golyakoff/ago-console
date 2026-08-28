import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eraseSite } from "./sitesApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `16-02`. `sitesApi.ts` had no test file before this item (`registerSite` is exercised through
 * `SignupPage.test.tsx` instead) - named `.erasure.test.ts` rather than `sitesApi.test.ts` so it reads
 * as this item's own addition rather than a first attempt at covering the whole module.
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

describe("eraseSite", () => {
  it("posts to the site-erase route with no path parameter, and resolves on 202 Accepted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202));

    await eraseSite("token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.invalid/api/v1/sites/erase",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not claim success and throws ApiProblemError for anything other than 202", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { type: "Site.Forbidden", detail: "no" }));

    await expect(eraseSite("token")).rejects.toBeInstanceOf(ApiProblemError);
  });
});
