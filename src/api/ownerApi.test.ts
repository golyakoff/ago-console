import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOwnerPricing,
  fetchOwnerSeatSummary,
  fetchOwnerSiteDetail,
  fetchOwnerSites,
  fetchOwnerSuspensions,
  fetchOwnerTenantIsolationSummary,
} from "./ownerApi.js";
import { ApiProblemError } from "./problemDetails.js";
import { shapeMismatchMessage } from "../pages/apiErrorMessage.js";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";

/**
 * `23-118`/`23-99`: API-boundary shape validation for the owner reads. Each returns an outcome union
 * and throws a plain `Error` only on an unexpected non-`ok`; a mis-shaped `"ok"` body is that same
 * "answered, but not as promised" case, rethrown as `ApiProblemError('shape.mismatch')` and caught by
 * each owner page's load `catch`, which surfaces it localized via `shapeMismatchMessage`. In scope: the
 * list readers (dropped list/element = false empty) plus the two stat readers (dropped count = blank).
 * `probeOwnerEligibility` is out of scope - it reads only the status code, no body. Harness mirrors
 * `maxChannelApi.test.ts`.
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

const siteSummary = {
  siteId: "s-1",
  name: "Shop One",
  tier: "free",
  createdAt: "2026-08-01T00:00:00Z",
  seatCount: 2,
  conversationCount: 10,
  recentMessageCount: 4,
  lastMessageAt: "2026-08-02T00:00:00Z",
  attachmentBytes: 2048,
};

const sitesPage = {
  sites: [siteSummary],
  nextBefore: null,
  recentWindowDays: 30,
  matchingSites: 1,
  totalSites: 1,
};

describe("fetchOwnerSites - shape validation", () => {
  it("resolves a well-formed page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, sitesPage));

    await expect(fetchOwnerSites("token")).resolves.toEqual({ status: "ok", page: sitesPage });
  });

  it("resolves an empty page - no sites is not a shape mismatch", async () => {
    const empty = { ...sitesPage, sites: [], matchingSites: 0, totalSites: 0 };
    fetchMock.mockResolvedValue(jsonResponse(200, empty));

    await expect(fetchOwnerSites("token")).resolves.toEqual({ status: "ok", page: empty });
  });

  it("returns not-authorized on 403 (no body read)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403));

    await expect(fetchOwnerSites("token")).resolves.toEqual({ status: "not-authorized" });
  });

  it("throws shape.mismatch when the envelope is missing totalSites - 'N of M' would read blank", async () => {
    const withoutTotal = without(sitesPage, "totalSites");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutTotal));

    const failure = await caught(fetchOwnerSites("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("totalSites");
  });

  it("throws shape.mismatch when a site row is missing seatCount", async () => {
    const withoutSeatCount = without(siteSummary, "seatCount");
    fetchMock.mockResolvedValue(jsonResponse(200, { ...sitesPage, sites: [siteSummary, withoutSeatCount] }));

    const failure = await caught(fetchOwnerSites("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("seatCount");
    expect((failure as ApiProblemError).message).toContain("[1]");
  });

  it("surfaces the rejection through shapeMismatchMessage, localized in both locales", async () => {
    const withoutTotal = without(sitesPage, "totalSites");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutTotal));
    const failure = await caught(fetchOwnerSites("token"));

    const enMessage = shapeMismatchMessage(failure, en);
    const ruMessage = shapeMismatchMessage(failure, ru);
    expect(enMessage).toContain(en.shapeMismatchError);
    expect(enMessage).toContain("owner/sites");
    expect(ruMessage).toContain(ru.shapeMismatchError);
    expect(ru.shapeMismatchError).not.toBe(en.shapeMismatchError);
  });
});

const siteDetail = {
  siteId: "s-1",
  name: "Shop One",
  tier: "free",
  createdAt: "2026-08-01T00:00:00Z",
  seatCount: 2,
  conversationCount: 10,
  recentMessageCount: 4,
  lastMessageAt: "2026-08-02T00:00:00Z",
  attachmentBytes: 2048,
  recentWindowDays: 30,
  modules: [],
  allowedOrigins: [],
  operators: [],
  suspendedUntil: null,
  roles: [],
  allKnownPermissions: [],
  channelEntitlements: [],
};

describe("fetchOwnerSiteDetail - shape validation", () => {
  it("resolves a well-formed detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, siteDetail));

    await expect(fetchOwnerSiteDetail("token", "s-1")).resolves.toEqual({ status: "ok", site: siteDetail });
  });

  it("throws shape.mismatch when the modules list is dropped - a tenant would read as having none", async () => {
    const withoutModules = without(siteDetail, "modules");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutModules));

    const failure = await caught(fetchOwnerSiteDetail("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).code).toBe("shape.mismatch");
    expect((failure as ApiProblemError).message).toContain("modules");
  });
});

const pricing = {
  seatPricing: {
    pricePerSeatRub: 500,
    baseSeats: 2,
    baseSeatPriceRub: 1000,
    pricePerExtraSeatRub: 500,
    billingPeriodDays: 30,
    freeSeatsIncluded: 1,
    tiers: [],
  },
  billingOptions: [],
  pricedResources: [],
};

describe("fetchOwnerPricing - shape validation", () => {
  it("resolves a well-formed price list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, pricing));

    await expect(fetchOwnerPricing("token")).resolves.toEqual({ status: "ok", pricing });
  });

  it("throws shape.mismatch when pricedResources is dropped - reads as an empty priced list", async () => {
    const withoutPriced = without(pricing, "pricedResources");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutPriced));

    const failure = await caught(fetchOwnerPricing("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("pricedResources");
  });
});

const suspension = {
  siteId: "s-1",
  siteName: "Shop One",
  suspendedUntil: "2026-09-01T00:00:00Z",
  lastActionBy: "owner-1",
  lastActionReason: "abuse",
  lastActionAt: "2026-08-01T00:00:00Z",
};

describe("fetchOwnerSuspensions - shape validation", () => {
  it("resolves a well-formed list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { suspensions: [suspension] }));

    await expect(fetchOwnerSuspensions("token")).resolves.toEqual({ status: "ok", suspensions: [suspension] });
  });

  it("resolves an empty list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { suspensions: [] }));

    await expect(fetchOwnerSuspensions("token")).resolves.toEqual({ status: "ok", suspensions: [] });
  });

  it("throws shape.mismatch when a suspension row is missing suspendedUntil", async () => {
    const withoutUntil = without(suspension, "suspendedUntil");
    fetchMock.mockResolvedValue(jsonResponse(200, { suspensions: [withoutUntil] }));

    const failure = await caught(fetchOwnerSuspensions("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("suspendedUntil");
  });
});

const isolationSummary = {
  entryPoints: 100,
  handlerClasses: 80,
  rbacGated: 90,
  exemptListed: 8,
  unaccountedKeys: [],
  exemptButAlsoLooksGated: [],
  routesAndHubMethods: 120,
  clientSuppliedSiteIdRoutes: 3,
  generatedAtUtc: "2026-08-01T00:00:00Z",
};

describe("fetchOwnerTenantIsolationSummary - shape validation", () => {
  it("resolves a well-formed summary", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, isolationSummary));

    await expect(fetchOwnerTenantIsolationSummary("token")).resolves.toEqual({ status: "ok", summary: isolationSummary });
  });

  it("throws shape.mismatch when unaccountedKeys is dropped - a real finding would be hidden", async () => {
    const withoutKeys = without(isolationSummary, "unaccountedKeys");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutKeys));

    const failure = await caught(fetchOwnerTenantIsolationSummary("token"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("unaccountedKeys");
  });
});

const seatSummary = { operatorsHeld: 2, operatorsLimit: 3, administratorsHeld: 1, administratorsLimit: 1 };

describe("fetchOwnerSeatSummary - shape validation", () => {
  it("resolves a well-formed summary", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, seatSummary));

    await expect(fetchOwnerSeatSummary("token", "s-1")).resolves.toEqual({ status: "ok", summary: seatSummary });
  });

  it("throws shape.mismatch when operatorsLimit is dropped - the 'held / limit' line would read blank", async () => {
    const withoutLimit = without(seatSummary, "operatorsLimit");
    fetchMock.mockResolvedValue(jsonResponse(200, withoutLimit));

    const failure = await caught(fetchOwnerSeatSummary("token", "s-1"));

    expect(failure).toBeInstanceOf(ApiProblemError);
    expect((failure as ApiProblemError).message).toContain("operatorsLimit");
  });
});
