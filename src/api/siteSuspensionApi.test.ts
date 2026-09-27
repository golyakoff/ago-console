import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSiteSuspensionStatus } from "./siteSuspensionApi.js";
import { ShapeMismatchError } from "./shapeGuard.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `siteSuspensionApi.ts#fetchSiteSuspensionStatus`.
 * A dropped `isSuspended` reads as `false` and the shell banner treats a suspended account as
 * not-suspended - the false-negative the bound names. Like `downloadUsageApi.ts`, this is a courtesy
 * read whose caller (`useSiteSuspensionStatus`) swallows every rejection into a `console.warn` and
 * never renders `err.message`, so the guard rejects with the shared `ShapeMismatchError` directly.
 * Harness mirrors `maxChannelApi.test.ts`.
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

describe("fetchSiteSuspensionStatus - shape validation", () => {
  it("resolves a suspended status when every field is present", async () => {
    const suspended = { isSuspended: true, since: "2026-08-01T00:00:00Z", until: "2026-09-01T00:00:00Z" };
    fetchMock.mockResolvedValue(jsonResponse(200, suspended));

    await expect(fetchSiteSuspensionStatus("token", "s1")).resolves.toEqual(suspended);
  });

  it("resolves a not-suspended status (nullable fields null) - not suspended is not a shape mismatch", async () => {
    const notSuspended = { isSuspended: false, since: null, until: null };
    fetchMock.mockResolvedValue(jsonResponse(200, notSuspended));

    await expect(fetchSiteSuspensionStatus("token", "s1")).resolves.toEqual(notSuspended);
  });

  it("throws ShapeMismatchError when isSuspended is dropped - an absent flag reads as 'not suspended'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { since: "2026-08-01T00:00:00Z", until: null }));

    const failure = await caught(fetchSiteSuspensionStatus("token", "s1"));

    expect(failure).toBeInstanceOf(ShapeMismatchError);
    expect((failure as ShapeMismatchError).missingFields).toContain("isSuspended");
    expect((failure as ShapeMismatchError).diagnostic).toContain("suspension");
  });
});
