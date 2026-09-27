import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarApiError } from "./calendarApi.js";
import { fetchMyCalendarTenancies } from "./calendarTenanciesApi.js";

/**
 * `23-41`: this reader is the exact site the whole item was carved from. Two backends answer
 * `/api/v1/me/tenancies` with different shapes; a fixture/proxy/gateway that routed the *chat*
 * backend's `{siteId, siteName}` body to this *calendar* reader left `tenantName` `undefined`, and
 * `CalendarElsewhereNotice`'s `tenantName.trim()` threw during render - blanking the entire console.
 * The chosen reading (validate at every API boundary) is why a mis-shaped body is now rejected here,
 * before it can reach render, as an ordinary `CalendarApiError` the existing `catch` already handles.
 *
 * Harness follows `tenanciesApi.test.ts`/`calendarApi.test.ts`'s own `fetchMock`/`jsonResponse`
 * convention; `config.calendarApiBaseUrl` is non-null so the "not configured" early return does not
 * short-circuit the calls under test.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
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

describe("fetchMyCalendarTenancies", () => {
  it("resolves the tenancy list when every entry carries tenantId and tenantName", async () => {
    const tenancies = [
      { tenantId: "t1", tenantName: "Shop One" },
      { tenantId: "t2", tenantName: "" },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { tenancies }));

    await expect(fetchMyCalendarTenancies("token")).resolves.toEqual(tenancies);
  });

  it("resolves an empty list as an empty list - a person with no other calendar is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tenancies: [] }));

    await expect(fetchMyCalendarTenancies("token")).resolves.toEqual([]);
  });

  it("throws CalendarApiError('shape.mismatch') rather than returning bad data, when one entry is missing tenantName", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { tenancies: [{ tenantId: "t1", tenantName: "Shop One" }, { tenantId: "t2" }] }),
    );

    const failure = await fetchMyCalendarTenancies("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(CalendarApiError);
    expect((failure as CalendarApiError).code).toBe("shape.mismatch");
    expect((failure as CalendarApiError).message).toContain("tenantName");
  });

  it("throws CalendarApiError('shape.mismatch') when the tenancies array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await fetchMyCalendarTenancies("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(CalendarApiError);
    expect((failure as CalendarApiError).code).toBe("shape.mismatch");
  });

  /**
   * The regression for the exact incident: this calendar reader is handed the *chat* backend's body
   * shape (`{siteId, siteName}`), which carries neither `tenantId` nor `tenantName`. Before `23-41`
   * this reader cast it through `as TenanciesBody` and returned entries whose `tenantName` was
   * `undefined`, and the first `.trim()` downstream threw and blanked the console. It must now be
   * rejected at the boundary, naming both missing fields, so the failure is an ordinary caught error
   * and never a render crash.
   */
  it("rejects the chat backend's cross-shape body at the boundary, naming both calendar fields it lacks", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { tenancies: [{ siteId: "s1", siteName: "Shop One" }] }),
    );

    const failure = await fetchMyCalendarTenancies("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(CalendarApiError);
    expect((failure as CalendarApiError).code).toBe("shape.mismatch");
    expect((failure as CalendarApiError).message).toContain("tenantId");
    expect((failure as CalendarApiError).message).toContain("tenantName");
  });
});
