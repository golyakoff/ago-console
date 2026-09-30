import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CalendarApiError,
  confirmOperatorVerifiedPhone,
  createCalendar,
  deleteClient,
  getConfiguration,
  getConfirmedBookings,
  getPendingBookings,
  getPersonBookings,
  rejectBooking,
  setAllowedOrigins,
} from "./calendarApi.js";
import { setActiveSiteId } from "./activeSite.js";

/**
 * `22-06`: moved from `ago-calendar-console`'s own `src/api/calendarApi.test.ts`, unchanged in what
 * it proves - only the harness (`conversationsApi.search.test.ts`'s own `fetchMock`/`jsonResponse`
 * convention, this console's established shape for a `fetch`-level api test) and the mocked
 * `config.js` (`calendarApiBaseUrl` now, not `apiBaseUrl`) differ.
 *
 * <b>The first two tests are the ones that matter.</b> Every other assertion here is about plumbing;
 * those are about isolation. The tenant never appears in a URL or a body this console builds, and
 * since `22-14`/`adr/0100` it is named exactly once - in the `X-Ago-Active-Site` header - which the
 * server treats as a choice among tenancies it has already proved this operator holds
 * (`RoleAssignmentProjectionStore.ResolveTenantAsync`), never as a fact. Both halves are asserted,
 * because "no tenant anywhere" was the old invariant and reading only the first test would suggest it
 * still is.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
  },
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

function problemResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

/**
 * `26-329`: a body shaped enough to satisfy `getConfiguration`'s own `assertHasKeys` check - every
 * required `TenantConfiguration` key present, with harmless empty/zero values. Every test in this
 * file that does not care what `getConfiguration` resolves to (most of them - they assert on the
 * *request*, not the response) shares this one default rather than each growing its own copy; a test
 * that does care about the parsed shape (the `getConfirmedBookings`/`getPersonBookings` ones further
 * down) already overrides the mock with its own fixture.
 */
function minimalConfigurationBody(): unknown {
  return { tenantName: "", publicKey: "", allowedOrigins: [], calendars: [], workers: [], services: [], workerQuota: 0 };
}

beforeEach(() => {
  // `22-14`: `activeSite.ts` is a module-level singleton, so a test that sets it would otherwise
  // leak into every test after it in this file.
  setActiveSiteId(null);
  fetchMock.mockReset();
  // A fresh `Response` per call, not one shared instance - `.json()` consumes the body stream, and
  // several of these tests make more than one call in a row.
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, minimalConfigurationBody())));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the calendar API client", () => {
  it("never names a tenant in a URL or a body", async () => {
    await getConfiguration("operator-token");
    await createCalendar("operator-token", { name: "Main", timeZone: "Europe/Moscow", publish: true });
    await setAllowedOrigins("operator-token", ["https://shop.example"]);
    await rejectBooking("operator-token", "11111111-1111-1111-1111-111111111111");

    for (const [url, init] of fetchMock.mock.calls as [URL, RequestInit][]) {
      expect(url.toString().toLowerCase()).not.toContain("tenant");
      const body = typeof init.body === "string" ? init.body : "";
      expect(body.toLowerCase()).not.toContain("tenant");
    }
  });

  it("names the active tenant in the header, and only there, once one is known", async () => {
    // `22-14`/`adr/0100`. The value goes in one place - not a path, not a body, not a query string -
    // and it is the same singleton every `ago-chat` call already reads, because a calendar `TenantId`
    // *is* a chat `SiteId` (`RoleAssignmentsChangedConsumer`).
    setActiveSiteId("22222222-2222-2222-2222-222222222222");

    await getConfiguration("operator-token");
    await rejectBooking("operator-token", "11111111-1111-1111-1111-111111111111");

    for (const [url, init] of fetchMock.mock.calls as [URL, RequestInit][]) {
      expect((init.headers as Record<string, string>)["X-Ago-Active-Site"]).toBe(
        "22222222-2222-2222-2222-222222222222",
      );
      expect(url.toString()).not.toContain("2222");
      expect(typeof init.body === "string" ? init.body : "").not.toContain("2222");
    }
  });

  it("sends no active-site header at all while no tenancy has been resolved", async () => {
    // The unchanged shape for every request built before `PermissionsProvider` has resolved a
    // tenancy - and the reason a one-tenancy operator is unaffected by `22-14`: with no header, the
    // server takes exactly the single-tenancy branch it always took.
    setActiveSiteId(null);

    await getConfiguration("operator-token");

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty("X-Ago-Active-Site");
  });

  it("sends the token it was handed, on every call", async () => {
    // A parameter, never a module-level capture: silent renewal replaces the token on its own
    // schedule, and `ago-console` shipped the captured-token defect once (`5-16`).
    await getConfiguration("operator-token");
    await getPendingBookings("a-newer-token");

    const [, firstInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [, secondInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect((firstInit.headers as Record<string, string>)["Authorization"]).toBe("Bearer operator-token");
    expect((secondInit.headers as Record<string, string>)["Authorization"]).toBe("Bearer a-newer-token");
  });

  it("addresses the console's own route group under the configured calendar origin", async () => {
    await getPendingBookings("operator-token");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe("https://calendar-api.test.invalid/api/v1/console/pending-bookings");
  });

  it("carries the server's stable problem-details type through, not just its message", async () => {
    // api-design.md: "clients branch on `type`, never on the message".
    fetchMock.mockResolvedValue(problemResponse(403, { type: "configuration.forbidden", detail: "Nope." }));

    const failure = await rejectBooking("operator-token", "x").catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(CalendarApiError);
    expect((failure as CalendarApiError).code).toBe("configuration.forbidden");
    expect((failure as CalendarApiError).message).toBe("Nope.");
    expect((failure as CalendarApiError).status).toBe(403);
  });

  it("turns a 401 into a sentence about the session rather than an empty problem body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const failure = (await getConfiguration("operator-token").catch((reason: unknown) => reason)) as CalendarApiError;

    expect(failure.code).toBe("auth.unauthenticated");
    expect(failure.message).toContain("Sign in again");
  });

  it("survives an error response with no JSON body at all", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const failure = (await getConfiguration("operator-token").catch((reason: unknown) => reason)) as CalendarApiError;

    expect(failure.code).toBe("http.502");
  });

  it("throws CalendarApiError.NotConfigured, and never calls fetch, when calendarApiBaseUrl is unset", async () => {
    const { config } = await import("../config.js");
    const original = config.calendarApiBaseUrl;
    config.calendarApiBaseUrl = null;

    try {
      const failure = (await getConfiguration("operator-token").catch((reason: unknown) => reason)) as CalendarApiError;
      expect(failure).toBeInstanceOf(CalendarApiError);
      expect(failure.code).toBe("Calendar.NotConfigured");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      config.calendarApiBaseUrl = original;
    }
  });

  /**
   * `23-99`: `docs/backlog/23-99-*.md`'s own chosen reading, applied to the exact screen its own
   * text quotes - `CalendarBookingsPage`'s `groups.length === 0` branch. Before this item,
   * `getConfirmedBookings` returned whatever `response.json()` produced with no check at all - a row
   * silently missing `workerDisplayName` (a fixture rewritten by hand, a rolled-back calendar
   * deployment answering an older contract, `adr/0012`'s own "independently versioned" risk) would
   * resolve normally and group in among real rows, or - if every row in the range were affected -
   * resolve to something that grouped into nothing, indistinguishable from a day with nothing booked.
   */
  describe("getConfirmedBookings - 23-99 shape validation", () => {
    it("resolves normally when every row carries every field ConfirmedBooking promises", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              bookingId: "b1",
              calendarId: "cal1",
              workerId: "w1",
              workerDisplayName: "Anna",
              serviceId: "s1",
              serviceName: "Haircut",
              personId: "c1",
              startsAt: "2026-09-08T09:00:00+00:00",
              endsAt: "2026-09-08T09:45:00+00:00",
              localDate: "2026-09-08",
              weekday: 2,
              phone: "+79990000001",
              masked: false,
              originConversationId: null,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(getConfirmedBookings("operator-token", "2026-09-08", "2026-09-14")).resolves.toHaveLength(1);
    });

    it("resolves an empty array as an empty array - a genuinely empty range is not a shape mismatch", async () => {
      fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));

      await expect(getConfirmedBookings("operator-token", "2026-09-08", "2026-09-14")).resolves.toEqual([]);
    });

    it("throws CalendarApiError('shape.mismatch') rather than silently resolving, when a row is missing a required field", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              bookingId: "b1",
              calendarId: "cal1",
              workerId: "w1",
              // `workerDisplayName` dropped - the exact shape of the incident 23-41/23-99 were both
              // carved from, one field absent from an otherwise well-formed response.
              serviceId: "s1",
              serviceName: "Haircut",
              personId: "c1",
              startsAt: "2026-09-08T09:00:00+00:00",
              endsAt: "2026-09-08T09:45:00+00:00",
              localDate: "2026-09-08",
              weekday: 2,
              phone: "+79990000001",
              masked: false,
              originConversationId: null,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const failure = (await getConfirmedBookings("operator-token", "2026-09-08", "2026-09-14").catch(
        (reason: unknown) => reason,
      )) as CalendarApiError;

      expect(failure).toBeInstanceOf(CalendarApiError);
      expect(failure.code).toBe("shape.mismatch");
      expect(failure.message).toContain("workerDisplayName");
    });

    /** `26-165`/`adr/0184` (C1w): `originConversationId` joined this file's required-key list the
     * same way `masked` and every other always-sent, sometimes-null field already has - it is present
     * on every row (nullable, never optional), so a row that drops it entirely is exactly as much a
     * shape mismatch as one dropping `workerDisplayName` above. */
    it("throws CalendarApiError('shape.mismatch') when a row drops originConversationId entirely", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              bookingId: "b1",
              calendarId: "cal1",
              workerId: "w1",
              workerDisplayName: "Anna",
              serviceId: "s1",
              serviceName: "Haircut",
              personId: "c1",
              startsAt: "2026-09-08T09:00:00+00:00",
              endsAt: "2026-09-08T09:45:00+00:00",
              localDate: "2026-09-08",
              weekday: 2,
              phone: "+79990000001",
              masked: false,
              // `originConversationId` dropped.
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const failure = (await getConfirmedBookings("operator-token", "2026-09-08", "2026-09-14").catch(
        (reason: unknown) => reason,
      )) as CalendarApiError;

      expect(failure).toBeInstanceOf(CalendarApiError);
      expect(failure.code).toBe("shape.mismatch");
      expect(failure.message).toContain("originConversationId");
    });

    it("resolves normally when a row's originConversationId is a real id, not just null (a chat-origin booking)", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              bookingId: "b1",
              calendarId: "cal1",
              workerId: "w1",
              workerDisplayName: "Anna",
              serviceId: "s1",
              serviceName: "Haircut",
              personId: "c1",
              startsAt: "2026-09-08T09:00:00+00:00",
              endsAt: "2026-09-08T09:45:00+00:00",
              localDate: "2026-09-08",
              weekday: 2,
              phone: "+79990000001",
              masked: false,
              originConversationId: "11111111-1111-1111-1111-111111111111",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(getConfirmedBookings("operator-token", "2026-09-08", "2026-09-14")).resolves.toEqual([
        expect.objectContaining({ originConversationId: "11111111-1111-1111-1111-111111111111" }),
      ]);
    });
  });

  /** `26-269`: `getPersonBookings` is `PersonBooking`'s own `assertArrayHasKeys` reader - the identical
   * validate-at-the-boundary discipline `getConfirmedBookings` above already exercises for its own
   * sibling shape, kept deliberately shorter here: those tests already prove the mechanism
   * (`assertArrayHasKeys`/`CalendarApiError('shape.mismatch')`) works; this only proves this endpoint's
   * own reader is actually wired to it, plus the one field `PersonBooking` carries that
   * `ConfirmedBooking` does not - `status`. */
  describe("getPersonBookings - 26-269 shape validation", () => {
    function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        bookingId: "b1",
        calendarId: "cal1",
        workerId: "w1",
        workerDisplayName: "Anna",
        serviceId: "s1",
        serviceName: "Haircut",
        personId: "c1",
        startsAt: "2026-09-08T09:00:00+00:00",
        endsAt: "2026-09-08T09:45:00+00:00",
        localDate: "2026-09-08",
        weekday: 2,
        phone: "+79990000001",
        masked: false,
        originConversationId: null,
        status: "Booked",
        ...overrides,
      };
    }

    it("resolves normally, addressing this person's own bookings route, when every row is well-formed", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, [row()]));

      const result = await getPersonBookings("operator-token", "c1");

      expect(result).toHaveLength(1);
      expect(fetchMock.mock.calls[0]?.[0]).toContain("/contacts/c1/bookings");
    });

    it("throws CalendarApiError('shape.mismatch') when a row drops status entirely", async () => {
      const withoutStatus = Object.fromEntries(Object.entries(row()).filter(([key]) => key !== "status"));
      fetchMock.mockResolvedValue(jsonResponse(200, [withoutStatus]));

      const failure = (await getPersonBookings("operator-token", "c1").catch((reason: unknown) => reason)) as CalendarApiError;

      expect(failure).toBeInstanceOf(CalendarApiError);
      expect(failure.code).toBe("shape.mismatch");
      expect(failure.message).toContain("status");
    });
  });

  /** `23-12`/`26-269`: the client-detail hub's «Подтвердить телефон» action - a plain `POST` with no
   * body, addressing the same person-scoped `/contacts/{personId}` prefix `revealCustomerPhone` above
   * already addresses. */
  describe("confirmOperatorVerifiedPhone - 23-12/26-269", () => {
    it("posts to this person's own confirm-phone route and resolves the server's own confirmedAt", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { confirmedAt: "2026-09-08T09:00:00+00:00" }));

      const result = await confirmOperatorVerifiedPhone("operator-token", "c1");

      expect(result).toEqual({ confirmedAt: "2026-09-08T09:00:00+00:00" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/contacts/c1/confirm-phone");
      expect(init.method).toBe("POST");
    });
  });

  /** `26-275`/`adr/0189`: `DELETE /contacts/{personId}` - the calendar-initiated person erasure the
   * client-detail hub's own delete action calls. */
  describe("deleteClient - 26-275/adr-0189", () => {
    it("sends a DELETE to this person's own contacts route and resolves on 204", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(deleteClient("operator-token", "c1")).resolves.toBeUndefined();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/contacts/c1");
      expect(init.method).toBe("DELETE");
    });

    it("rejects with CalendarApiError('person_erase.future_bookings', 409) when the guard refuses", async () => {
      fetchMock.mockResolvedValue(
        problemResponse(409, { type: "person_erase.future_bookings", detail: "Person has one or more upcoming bookings." }),
      );

      const failure = (await deleteClient("operator-token", "c1").catch((reason: unknown) => reason)) as CalendarApiError;

      expect(failure).toBeInstanceOf(CalendarApiError);
      expect(failure.code).toBe("person_erase.future_bookings");
      expect(failure.status).toBe(409);
    });
  });
});
