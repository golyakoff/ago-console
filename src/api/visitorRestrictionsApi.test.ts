import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchVisitorRestrictions } from "./visitorRestrictionsApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `fetchVisitorRestrictions`. This is a list screen
 * ("how many, by whom"), so a dropped `items` renders as "no restrictions" and a truncated row renders
 * with blank columns - the false-empty case. Rethrown as `ApiProblemError('shape.mismatch')`. The two
 * optional emoji fields (`26-202`) are excluded from the required set, so a body from before they
 * existed still validates. `liftVisitorRestriction` (a write) is out of scope.
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
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason);
}

function without(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const restriction = {
  id: "r-1",
  visitorId: "v-1",
  kind: "Block",
  restrictedAt: "2026-09-01T00:00:00Z",
  restrictedBy: "op-1",
  expiresAt: null,
  sourceConversationId: "c-1",
  liftedAt: null,
  liftedBy: null,
};

const page = { items: [restriction], nextBeforeId: null };

describe("fetchVisitorRestrictions - shape validation", () => {
  it("resolves a well-formed page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, page));

    await expect(fetchVisitorRestrictions("token")).resolves.toEqual(page);
  });

  it("resolves an empty page - no restrictions is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], nextBeforeId: null }));

    await expect(fetchVisitorRestrictions("token")).resolves.toEqual({ items: [], nextBeforeId: null });
  });

  it("resolves a row without the optional emoji pair - a pre-26-202 body still validates", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, page));

    await expect(fetchVisitorRestrictions("token")).resolves.toEqual(page);
  });

  it("throws shape.mismatch when the items key is dropped - it would read as no restrictions", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { nextBeforeId: null }));

    const failure = await caught(fetchVisitorRestrictions("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("items");
  });

  it("throws shape.mismatch when a row is missing restrictedBy, naming the index", async () => {
    const withoutBy = without(restriction, "restrictedBy");
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [restriction, withoutBy], nextBeforeId: null }));

    const failure = await caught(fetchVisitorRestrictions("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("restrictedBy");
    expect((failure as ApiProblemError).message).toContain("[1]");
  });

  it("carries a localized shapeMismatchMessage for the thrown error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { nextBeforeId: null }));
    const failure = await caught(fetchVisitorRestrictions("token"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("visitor-restrictions");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
