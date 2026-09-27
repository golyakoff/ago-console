import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSiteBranding } from "./emailChannelApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `emailChannelApi.ts#fetchSiteBranding`. This is a
 * single object, not a list, but its absent field silently renders blank/negative: a dropped
 * `logoStatus` reads as an absent (falsy) status and the screen shows the "no logo" state for a shop
 * that has one - the exact `23-99` bound for a single object. It rejects a mis-shaped response as
 * `ApiProblemError('shape.mismatch')`, which `EmailChannelPage`'s load `catch` now surfaces localized
 * via `shapeMismatchMessage`. Harness follows `conversationsApi.shape.test.ts`.
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

const branding = {
  brandCompanyName: "Shop One",
  logoUrl: "https://cdn.test.invalid/logo.png",
  logoStatus: "Ready",
  logoRejectionReason: null,
};

describe("fetchSiteBranding - shape validation", () => {
  it("resolves when every field is present (nullable values allowed)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, branding));

    await expect(fetchSiteBranding("token", "s1")).resolves.toEqual(branding);
  });

  it("resolves a never-set brand (all nullable fields null) - a blank brand is not a shape mismatch", async () => {
    const blank = { brandCompanyName: null, logoUrl: null, logoStatus: "None", logoRejectionReason: null };
    fetchMock.mockResolvedValue(jsonResponse(200, blank));

    await expect(fetchSiteBranding("token", "s1")).resolves.toEqual(blank);
  });

  it("throws ApiProblemError('shape.mismatch') when logoStatus is dropped - an absent status reads as 'no logo'", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { brandCompanyName: "Shop One", logoUrl: null, logoRejectionReason: null }));

    const failure = await caught(fetchSiteBranding("token", "s1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("logoStatus");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { brandCompanyName: "Shop One", logoUrl: null, logoRejectionReason: null }));
    const failure = await caught(fetchSiteBranding("token", "s1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("branding");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
