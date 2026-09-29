import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { VisitorBookingsPanel } from "./VisitorBookingsPanel.js";
import { render, unmount } from "../testing/dom.js";
import type { PersonBooking } from "../api/calendarApi.js";

/**
 * `26-272` T3: the dialog -> client-record edge. What is under test here is this panel's own gating
 * (permission, calendar-module presence, unknown visitor) and its count/link rendering - not
 * `getPersonBookings`'s own contract, which `CalendarClientDetailPage.test.tsx` already covers, nor
 * `PermissionsProvider`'s path from `GET /api/v1/operators/me` to a permission set
 * (`ConversationOutcomePanel.test.tsx`'s own precedent for a hand-made `PermissionsContext` instead).
 */
const calendarApi = vi.hoisted(() => ({ getPersonBookings: vi.fn() }));

vi.mock("../api/calendarApi.js", () => calendarApi);

const configModule = vi.hoisted(() => ({ config: { calendarApiBaseUrl: "https://calendar-api.test.invalid" } }));

vi.mock("../config.js", () => configModule);

const PERSON_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function booking(overrides: Partial<PersonBooking> = {}): PersonBooking {
  return {
    bookingId: "b1",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna",
    serviceId: "s1",
    serviceName: "Haircut",
    personId: PERSON_ID,
    startsAt: "2026-09-30T09:00:00+00:00",
    endsAt: "2026-09-30T09:30:00+00:00",
    localDate: "2026-09-30",
    weekday: 3,
    phone: "+70000000000",
    masked: true,
    originConversationId: null,
    status: "Booked",
    ...overrides,
  };
}

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: "site1",
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
      hasPermission: (permission: string) => permissions.includes(permission),
      tenancies: [{ siteId: "site1", siteName: "Test Site" }],
      activeSiteId: "site1",
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

function panel(personId: string | null, permissions: string[]) {
  return (
    <MemoryRouter>
      <Permitted permissions={permissions}>
        <VisitorBookingsPanel personId={personId} accessToken="token" />
      </Permitted>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  configModule.config.calendarApiBaseUrl = "https://calendar-api.test.invalid";
  calendarApi.getPersonBookings.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("gating", () => {
  it("renders nothing for an operator with neither calendar:configure nor customer:read", async () => {
    const container = await render(panel(PERSON_ID, []));

    expect(container.textContent).toBe("");
    expect(calendarApi.getPersonBookings).not.toHaveBeenCalled();
  });

  it("renders nothing when the tenant has no calendar module configured", async () => {
    configModule.config.calendarApiBaseUrl = null;

    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(container.textContent).toBe("");
    expect(calendarApi.getPersonBookings).not.toHaveBeenCalled();
  });

  it("renders nothing while the queue row (and so the visitor id) has not loaded yet", async () => {
    const container = await render(panel(null, ["customer:read"]));

    expect(container.textContent).toBe("");
    expect(calendarApi.getPersonBookings).not.toHaveBeenCalled();
  });

  it("renders for an operator holding customer:read alone, the same gate CalendarContactsPage uses", async () => {
    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(calendarApi.getPersonBookings).toHaveBeenCalledWith("token", PERSON_ID, expect.any(AbortSignal));
    expect(container.querySelector("a")).not.toBeNull();
  });
});

describe("what it shows", () => {
  it("links to this visitor's client-detail hub", async () => {
    const container = await render(panel(PERSON_ID, ["calendar:configure"]));

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe(`/calendar/clients/${PERSON_ID}`);
    expect(link?.textContent).toBe("Open client card");
  });

  it("counts only the bookings in the future as upcoming, not past or no-show ones", async () => {
    calendarApi.getPersonBookings.mockResolvedValue([
      booking({ bookingId: "future1", startsAt: "2099-01-01T09:00:00+00:00" }),
      booking({ bookingId: "future2", startsAt: "2099-01-02T09:00:00+00:00" }),
      booking({ bookingId: "past1", startsAt: "2020-01-01T09:00:00+00:00" }),
      booking({ bookingId: "noshow1", startsAt: "2020-01-02T09:00:00+00:00", status: "NoShow" }),
    ]);

    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(container.textContent).toContain("2 upcoming bookings");
  });

  it("shows the singular word for exactly one upcoming booking", async () => {
    calendarApi.getPersonBookings.mockResolvedValue([booking({ startsAt: "2099-01-01T09:00:00+00:00" })]);

    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(container.textContent).toContain("1 upcoming booking");
    expect(container.textContent).not.toContain("1 upcoming bookings");
  });

  it("shows the no-upcoming-bookings copy when this visitor has bookings only in the past", async () => {
    calendarApi.getPersonBookings.mockResolvedValue([booking({ startsAt: "2020-01-01T09:00:00+00:00" })]);

    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(container.textContent).toContain("No upcoming bookings.");
  });

  it("still shows the link when the bookings read fails, degrading the count silently rather than an Alert", async () => {
    calendarApi.getPersonBookings.mockRejectedValue(new Error("network down"));

    const container = await render(panel(PERSON_ID, ["customer:read"]));

    expect(container.querySelector('[class*="alert"]')).toBeNull();
    expect(container.querySelector("a")).not.toBeNull();
  });
});
