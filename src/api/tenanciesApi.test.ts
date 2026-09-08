import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenanciesError, fetchMyTenancies } from "./tenanciesApi.js";
import { setActiveSiteId } from "./activeSite.js";

/**
 * `23-99`: `fetchMyTenancies` is `PermissionsProvider`'s own first call - it decides how many shops
 * this identity is offered at all, and `TenancySwitcher` mounts only once `tenancies.length > 1`.
 * No test file existed for this client before this item; `calendarApi.test.ts`'s own `fetchMock`/
 * `jsonResponse` shape is followed here for the identical reason it already covers the calendar
 * side.
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
  setActiveSiteId(null);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMyTenancies", () => {
  it("resolves the tenancy list when every entry carries siteId and siteName", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tenancies: [{ siteId: "s1", siteName: "Shop One" }] }));

    await expect(fetchMyTenancies("token")).resolves.toEqual({ tenancies: [{ siteId: "s1", siteName: "Shop One" }] });
  });

  it("resolves an empty list as an empty list - a new identity with no shop yet is not a shape mismatch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { tenancies: [] }));

    await expect(fetchMyTenancies("token")).resolves.toEqual({ tenancies: [] });
  });

  it("throws TenanciesError('shape.mismatch') rather than resolving, when the tenancies array is dropped entirely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    const failure = await fetchMyTenancies("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TenanciesError);
    expect((failure as TenanciesError).code).toBe("shape.mismatch");
  });

  /**
   * `23-99`'s own carried-out incident: `CalendarTenancy.tenantName` was typed `string`, actually
   * `undefined`. This is the sibling route (`13-07`/`adr/0068`) the same class of defect can strike
   * - one entry in an otherwise well-formed list missing its name.
   */
  it("throws when one entry in the list is missing siteName, not only when the whole list is malformed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { tenancies: [{ siteId: "s1", siteName: "Shop One" }, { siteId: "s2" }] }),
    );

    const failure = await fetchMyTenancies("token").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(TenanciesError);
    expect((failure as TenanciesError).message).toContain("siteName");
  });
});
