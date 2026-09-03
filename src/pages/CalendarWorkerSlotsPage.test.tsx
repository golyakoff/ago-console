import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarWorkerSlotsPage } from "./CalendarWorkerSlotsPage.js";
import { render, unmount } from "../testing/dom.js";
import type { TenantConfiguration, WorkerSlot } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/workers/:workerId/slots` - moved from `ago-calendar-console`'s own
 * `WorkerSlotsPage.test.tsx`, adapted to this console's own harness. The source screen's own visual
 * "these rows are one multi-slot booking" grouping test is not ported - `CalendarWorkerSlotsPage.tsx`'s
 * own doc comment records that the grouping affordance itself was dropped in the rewrite (it depended
 * on the source console's own bespoke stylesheet), so there is nothing left for that test to assert.
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

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const calendarApi = vi.hoisted(() => ({ getConfiguration: vi.fn(), getWorkerSlots: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter initialEntries={["/calendar/workers/w1/slots"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/calendar/workers/:workerId/slots" element={<CalendarWorkerSlotsPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const configuration: TenantConfiguration = {
  tenantName: "Barbershop",
  publicKey: "demo-barbershop",
  allowedOrigins: [],
  calendars: [
    // UTC, deliberately - so a slot's rendered local time is a fixed, assertable string.
    { calendarId: "cal-1", name: "Main", timeZone: "UTC", isPublished: true, workerIds: ["w1"], workingHours: [] },
  ],
  workers: [{ workerId: "w1", displayName: "Alex Doe", isActive: true, serviceIds: [] }],
  services: [{ serviceId: "s1", name: "Haircut", durationMinutes: 45 }],
};

function slot(overrides: Partial<WorkerSlot> = {}): WorkerSlot {
  return {
    eventId: "e1",
    localDate: "2026-05-12",
    weekday: 2,
    startsAt: "2026-05-12T09:00:00Z",
    endsAt: "2026-05-12T09:30:00Z",
    status: "Available",
    serviceId: null,
    serviceName: null,
    customerId: null,
    customerDisplayName: null,
    phone: null,
    bookingId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfiguration.mockResolvedValue(configuration);
  calendarApi.getWorkerSlots.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("the materialised slot view", () => {
  it("shows the worker's name in the heading, from the tenant's own configuration", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Alex Doe’s slots");
  });

  it("shows date, weekday, local time and status for a slot", async () => {
    calendarApi.getWorkerSlots.mockResolvedValue([slot({ status: "Available" })]);

    const container = await render(page());

    expect(container.textContent).toContain("2026-05-12");
    expect(container.textContent).toContain("Tuesday");
    expect(container.textContent).toContain("Available");
    expect(container.textContent).toMatch(/09:00.*09:30/);
  });

  it("shows a plain dash, never 'hidden', for a slot nobody holds", async () => {
    calendarApi.getWorkerSlots.mockResolvedValue([slot({ status: "Available", customerId: null, customerDisplayName: null, phone: null })]);

    const container = await render(page());

    expect(container.textContent).toContain("Available");
    expect(container.textContent).not.toContain("hidden");
    expect(container.textContent).toContain("—");
  });

  it("shows the customer's name and phone when the server includes them", async () => {
    calendarApi.getWorkerSlots.mockResolvedValue([slot({ status: "Booked", customerId: "c1", customerDisplayName: "Dana", phone: "+79990000001" })]);

    const container = await render(page());

    expect(container.textContent).toContain("Dana");
    expect(container.textContent).toContain("+79990000001");
  });

  it("shows 'hidden', not a blank cell, for an occupied slot the operator may not see the contact of", async () => {
    calendarApi.getWorkerSlots.mockResolvedValue([slot({ status: "Booked", customerId: "c1", customerDisplayName: null, phone: null })]);

    const container = await render(page());

    const hiddenCount = (container.textContent?.match(/hidden/g) ?? []).length;
    expect(hiddenCount).toBe(2);
  });

  it("shows service name where one was chosen, and a dash on a blocked row", async () => {
    calendarApi.getWorkerSlots.mockResolvedValue([
      slot({ status: "Booked", serviceId: "s1", serviceName: "Haircut" }),
      slot({ eventId: "e2", status: "Blocked", serviceId: null, serviceName: null, customerId: null, customerDisplayName: null, phone: null }),
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("Blocked");
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getWorkerSlots.mockRejectedValue(
      new CalendarApiError("worker_slots.forbidden", "This operator does not hold 'calendar:configure' for this tenant.", 403),
    );

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });
});
