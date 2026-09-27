import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchContactDetails } from "./contactDetailsApi.js";
import { ApiProblemError } from "./problemDetails.js";

/**
 * `23-118`/`23-99`: `fetchContactDetails` feeds `ContactDetailsPanel`'s list, where an empty list is a
 * legitimate "no details given" - so a dropped row field would read as that empty rather than as a
 * reader that did not answer. Rejected as `ApiProblemError('shape.mismatch')`.
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

const detail = {
  id: "d1",
  kind: "Phone",
  value: "+1 555 0100",
  recordedByOperatorId: null,
  source: "Visitor",
  verified: false,
  recordedAt: "2026-08-01T00:00:00Z",
  masked: false,
  assessment: "Unset",
};

describe("fetchContactDetails - shape validation", () => {
  it("resolves the list when every row carries its required keys (nullable recordedByOperatorId present)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { contactDetails: [detail] }));

    await expect(fetchContactDetails("token", "c1")).resolves.toEqual([detail]);
  });

  it("resolves an empty list as an empty list - a visitor who gave no details is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { contactDetails: [] }));

    await expect(fetchContactDetails("token", "c1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a row is missing assessment", async () => {
    const truncated = {
      id: "d1",
      kind: "Phone",
      value: "+1 555 0100",
      recordedByOperatorId: null,
      source: "Visitor",
      verified: false,
      recordedAt: "2026-08-01T00:00:00Z",
      masked: false,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { contactDetails: [truncated] }));

    const failure = await fetchContactDetails("token", "c1").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("assessment");
  });

  it("throws when the contactDetails array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    expect(((await fetchContactDetails("token", "c1").catch((r: unknown) => r)) as ApiProblemError).code).toBe("shape.mismatch");
  });
});
