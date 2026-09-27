import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSiteExportHistory } from "./siteExportsApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `siteExportsApi.ts#getSiteExportHistory`. A list
 * reader the bound names in scope directly: a dropped element field (a missing `status`) makes a real
 * past export render as a blank/half-drawn row, indistinguishable from an empty history. It rejects a
 * mis-shaped response as `ApiProblemError('shape.mismatch')`, surfaced localized by `SiteExportPage`'s
 * load `catch` via `shapeMismatchMessage`. Harness mirrors `maxChannelApi.test.ts`.
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

const row = {
  exportId: "ex-1",
  status: "Ready",
  requestedAt: "2026-08-01T00:00:00Z",
  completedAt: "2026-08-01T01:00:00Z",
  downloadUrl: "https://download.test.invalid/ex-1",
  expiresAt: "2026-08-08T00:00:00Z",
  failureReason: null,
};

describe("getSiteExportHistory - shape validation", () => {
  it("resolves a list of well-formed rows", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [row]));

    await expect(getSiteExportHistory("token", "s1")).resolves.toEqual([row]);
  });

  it("resolves an empty history - no rows is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await expect(getSiteExportHistory("token", "s1")).resolves.toEqual([]);
  });

  it("throws ApiProblemError('shape.mismatch') when a row is missing status", async () => {
    const withoutStatus = without(row, "status");
    fetchMock.mockResolvedValue(jsonResponse(200, [row, withoutStatus]));

    const failure = await caught(getSiteExportHistory("token", "s1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("status");
    // The mis-shaped element is named by index, so a truncated row mid-page is not read as "loaded".
    expect((failure as ApiProblemError).message).toContain("[1]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutStatus = without(row, "status");
    fetchMock.mockResolvedValue(jsonResponse(200, [withoutStatus]));
    const failure = await caught(getSiteExportHistory("token", "s1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("exports");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
