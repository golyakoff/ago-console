import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAddOnError, fetchAiAddOnStatus } from "./aiAddOnApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `aiAddOnApi.ts#fetchAiAddOnStatus`. A dropped
 * `purchased`/`enabled` reads as `false` and `AiAddOnPage` renders "not purchased"/"not enabled" for a
 * shop whose add-on is live - the false-negative the `23-99` bound names for a status object. It
 * rejects a mis-shaped response as `AiAddOnError('shape.mismatch')`, surfaced localized by that page's
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

const status = {
  purchased: true,
  enabled: true,
  effectiveFrom: "2026-08-01T00:00:00Z",
  documentKey: "ai-terms",
  currentVersion: "3",
  currentTitle: "AI add-on terms",
  currentBody: "…",
  acceptedVersion: "3",
  acceptedAt: "2026-08-02T00:00:00Z",
  declaredBy: "op-1",
  declaredAt: "2026-08-02T00:00:00Z",
};

describe("fetchAiAddOnStatus - shape validation", () => {
  it("resolves when every field is present (nullable values allowed)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, status));

    await expect(fetchAiAddOnStatus("token", "s1")).resolves.toEqual(status);
  });

  it("resolves an un-purchased status (nullable fields null) - not purchased is not a shape mismatch", async () => {
    const notPurchased = {
      purchased: false,
      enabled: false,
      effectiveFrom: null,
      documentKey: "ai-terms",
      currentVersion: null,
      currentTitle: null,
      currentBody: null,
      acceptedVersion: null,
      acceptedAt: null,
      declaredBy: null,
      declaredAt: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, notPurchased));

    await expect(fetchAiAddOnStatus("token", "s1")).resolves.toEqual(notPurchased);
  });

  it("throws AiAddOnError('shape.mismatch') when purchased is dropped - an absent flag reads as 'not purchased'", async () => {
    const withoutPurchased = without(status, "purchased");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutPurchased));

    const failure = await caught(fetchAiAddOnStatus("token", "s1"));

    expect(failure).toBeInstanceOf(AiAddOnError);
    expect((failure as AiAddOnError).code).toBe("shape.mismatch");
    expect((failure as AiAddOnError).message).toContain("purchased");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutPurchased = without(status, "purchased");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutPurchased));
    const failure = await caught(fetchAiAddOnStatus("token", "s1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("ai-add-on");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
