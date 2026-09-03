import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CalendarApiError,
  createCalendar,
  getConfiguration,
  getPendingBookings,
  rejectBooking,
  setAllowedOrigins,
} from "./calendarApi.js";

/**
 * `22-06`: moved from `ago-calendar-console`'s own `src/api/calendarApi.test.ts`, unchanged in what
 * it proves - only the harness (`conversationsApi.search.test.ts`'s own `fetchMock`/`jsonResponse`
 * convention, this console's established shape for a `fetch`-level api test) and the mocked
 * `config.js` (`calendarApiBaseUrl` now, not `apiBaseUrl`) differ.
 *
 * <b>The first test is the one that matters.</b> Every other assertion here is about plumbing; that
 * one is about isolation. The tenant must never appear in a request this console builds - it comes
 * off the operator's own token, resolved server-side against `ago-calendar`'s own `operators` table -
 * and a console that could name a tenant would be a console that could name somebody else's.
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

beforeEach(() => {
  fetchMock.mockReset();
  // A fresh `Response` per call, not one shared instance - `.json()` consumes the body stream, and
  // several of these tests make more than one call in a row.
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {})));
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
});
