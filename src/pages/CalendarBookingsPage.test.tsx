import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarBookingsPage } from "./CalendarBookingsPage.js";
import { render, unmount } from "../testing/dom.js";
import type { ConfirmedBooking } from "../api/calendarApi.js";

/**
 * `23-34`: `/calendar/bookings` - confirmed bookings, grouped by day and by master. Permission
 * gating (`customer:read` rather than `calendar:configure`) is exercised in
 * `permissionGating.test.tsx`, alongside every other calendar screen's own gate; this file is the
 * one `CalendarContactsPage.test.tsx`/`CalendarQueuePage.test.tsx` already establish for their own
 * screens - the rendering and grouping behaviour specific to this page.
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
const calendarApi = vi.hoisted(() => ({ getConfirmedBookings: vi.fn() }));

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
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <CalendarBookingsPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

// `customer:read` alone - the seeded Operator role's own shape, deliberately not `calendar:configure`
// (this screen's own gate; `CalendarBookingsPage`'s doc comment has the full reasoning).
const OPERATOR_PERMISSIONS = ["customer:read"];

/** Two workers, two days - Tuesday carries both, Wednesday carries one - so a test can tell "grouped
 * by day, then by master" apart from "one flat list that happens to render in order". */
const bookings: ConfirmedBooking[] = [
  {
    bookingId: "b1",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna Petrova",
    serviceId: "s1",
    serviceName: "Haircut",
    customerId: "c1",
    customerDisplayName: "Ivan",
    startsAt: "2026-09-08T09:00:00+00:00",
    endsAt: "2026-09-08T09:45:00+00:00",
    localDate: "2026-09-08",
    weekday: 2,
    phone: "+79990000001",
    masked: false,
  },
  {
    bookingId: "b2",
    calendarId: "cal1",
    workerId: "w2",
    workerDisplayName: "Boris Orlov",
    serviceId: "s2",
    serviceName: "Manicure",
    customerId: "c2",
    customerDisplayName: null,
    startsAt: "2026-09-08T10:00:00+00:00",
    endsAt: "2026-09-08T10:30:00+00:00",
    localDate: "2026-09-08",
    weekday: 2,
    phone: "+7 999 000-00-** 02",
    masked: true,
  },
  {
    bookingId: "b3",
    calendarId: "cal1",
    workerId: "w1",
    workerDisplayName: "Anna Petrova",
    serviceId: "s1",
    serviceName: "Haircut",
    customerId: "c3",
    customerDisplayName: "Olga",
    startsAt: "2026-09-09T09:00:00+00:00",
    endsAt: "2026-09-09T09:45:00+00:00",
    localDate: "2026-09-09",
    weekday: 3,
    phone: "+79990000003",
    masked: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: OPERATOR_PERMISSIONS, siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfirmedBookings.mockResolvedValue(bookings);
});

afterEach(async () => {
  await unmount();
});

describe("confirmed bookings", () => {
  it("groups into one panel per day, each carrying its own booking count", async () => {
    const container = await render(page());

    // Tuesday (2026-09-08, two bookings) and Wednesday (2026-09-09, one) - both dates appear, once
    // each, as day-level panel headings.
    expect(container.textContent).toContain("2026-09-08");
    expect(container.textContent).toContain("2026-09-09");
  });

  it("groups a day's own rows by master, each master carrying their own count", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Anna Petrova");
    expect(container.textContent).toContain("Boris Orlov");
    // Tuesday's own day-level count is two; each of its two masters carries one each - both numbers
    // must appear somewhere in the rendered badges.
    expect(container.textContent).toMatch(/Bookings:\s*2/);
    expect(container.textContent).toMatch(/Bookings:\s*1/);
  });

  it("keeps a two-slot booking's own table small - one row per booking, not per group's total", async () => {
    const container = await render(page());

    // Anna Petrova appears in two separate day-groups (Tuesday and Wednesday) - two distinct
    // tables, one row each, never merged into a single seven-day table.
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(3);
  });

  it("renders the customer name and the service for each row", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Ivan");
    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("Manicure");
  });

  it("shows an honest placeholder for a customer with no name recorded, not a blank cell", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("not recorded");
  });

  it("renders the phone exactly as the server sent it - masked or real, with no client-side masking logic", async () => {
    const container = await render(page());

    // b1: real number, arrives unmasked from the server.
    expect(container.textContent).toContain("+79990000001");
    // b2: the server already masked it - the page must render that string verbatim, never the real
    // number and never a second, client-computed mask.
    expect(container.textContent).toContain("+7 999 000-00-** 02");
  });

  it("explains a permission failure in words an operator can act on", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.getConfirmedBookings.mockRejectedValue(
      new CalendarApiError("confirmed_bookings.forbidden", "This operator does not hold 'customer:read' for this tenant.", 403),
    );

    const container = await render(page());

    expect(container.textContent).toMatch(/does not have permission/i);
  });

  it("shows the empty state when nothing is booked in the range", async () => {
    calendarApi.getConfirmedBookings.mockResolvedValue([]);

    const container = await render(page());

    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Nothing is booked in this range yet.");
  });
});
