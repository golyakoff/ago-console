import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDownloadUsageStatus } from "./downloadUsageApi.js";
import { ShapeMismatchError } from "./shapeGuard.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `downloadUsageApi.ts#fetchDownloadUsageStatus`.
 * A dropped `isHardCrossed`/`isAtAutoBillCap`/`isExempt` reads as `false` and the shell banner shows
 * "under the threshold" for a blocked account - the false-negative the bound names. This is a courtesy
 * read whose caller (`useDownloadUsageStatus`) swallows every rejection into a `console.warn` and never
 * renders `err.message`, so the guard rejects with the shared `ShapeMismatchError` directly rather than
 * a `shape.mismatch`-coded error - turning a mis-shaped body into no banner plus a logged breach, not a
 * false state. Harness mirrors `maxChannelApi.test.ts`.
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

const status = {
  bytesOut: 100,
  softThresholdBytes: 1000,
  hardThresholdBytes: 2000,
  isSoftCrossed: false,
  isHardCrossed: false,
  isExempt: false,
  billingMode: "Manual",
  outstandingOverageBytes: 0,
  outstandingOverageRub: null,
  overageSettledRub: 0,
  autoBillCapRub: null,
  isAtAutoBillCap: false,
};

describe("fetchDownloadUsageStatus - shape validation", () => {
  it("resolves when every field is present (nullable values allowed)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, status));

    await expect(fetchDownloadUsageStatus("token", "s1")).resolves.toEqual(status);
  });

  it("throws ShapeMismatchError when isHardCrossed is dropped - an absent flag reads as 'not blocked'", async () => {
    const withoutHardCrossed = without(status, "isHardCrossed");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutHardCrossed));

    const failure = await caught(fetchDownloadUsageStatus("token", "s1"));

    expect(failure).toBeInstanceOf(ShapeMismatchError);
    expect((failure as ShapeMismatchError).missingFields).toContain("isHardCrossed");
    expect((failure as ShapeMismatchError).diagnostic).toContain("download-usage");
  });
});
