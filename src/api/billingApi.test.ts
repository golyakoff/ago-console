import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProblemError, fetchBillingStatus } from "./billingApi.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for `billingApi.ts#fetchBillingStatus`. A dropped
 * `seatsUsed`/`seatLimit` or `tier`/`tierDisplayName` renders as a blank/`NaN` seat count or a blank
 * tier on `BillingPage` - the "absent renders blank" case the `23-99` bound names. It rejects a
 * mis-shaped response as `ApiProblemError('shape.mismatch')`, surfaced localized by that page's load
 * `catch` via `shapeMismatchMessage`. Harness mirrors `maxChannelApi.test.ts`.
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
  tier: "solo",
  seatLimit: 3,
  seatsUsed: 1,
  latestSubscription: null,
  tierDisplayName: "Solo",
  adminLimit: 1,
  adminsUsed: 1,
  extraAdministratorsPurchased: 0,
  seatPricing: {
    minSeats: 2,
    maxSeats: 5,
    baseSeats: 2,
    freeSeatsIncluded: 1,
    baseSeatPriceRub: 1000,
    pricePerExtraSeatRub: 500,
    billingPeriodDays: 30,
  },
  adminExtraPriceRub: null,
};

describe("fetchBillingStatus - shape validation", () => {
  it("resolves when every field is present (nullable values allowed)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, status));

    await expect(fetchBillingStatus("token", "s1")).resolves.toEqual(status);
  });

  it("throws ApiProblemError('shape.mismatch') when seatsUsed is dropped - an absent count reads as blank", async () => {
    const withoutSeatsUsed = without(status, "seatsUsed");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutSeatsUsed));

    const failure = await caught(fetchBillingStatus("token", "s1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("seatsUsed");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutTier = without(status, "tier");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutTier));
    const failure = await caught(fetchBillingStatus("token", "s1"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("billing/status");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});
