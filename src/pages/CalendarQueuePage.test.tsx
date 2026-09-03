import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarQueuePage } from "./CalendarQueuePage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";
import type { PendingBooking } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar` - moved from `ago-calendar-console`'s own `QueuePage.test.tsx`, adapted to
 * this console's own harness shape (`FaqModulePage.test.tsx`'s own pattern: the real
 * `PermissionsProvider`, `operatorsApi`/`tenanciesApi` mocked, `calendarApi` mocked module-by-
 * function). The two calendars in the fixture are unchanged from the source - the item's own
 * parenthesis that a queue scoped to one calendar would pass a single-calendar test and fail the
 * product.
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
const calendarApi = vi.hoisted(() => ({
  getPendingBookings: vi.fn(),
  rejectBooking: vi.fn(),
  cancelBooking: vi.fn(),
  markNoShow: vi.fn(),
}));

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
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <CalendarQueuePage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function booking(
  bookingId: string,
  calendarId: string,
  startsAt: string,
  confirmationDeadline: string,
  isOverdue: boolean,
  phone: string | null = null,
): PendingBooking {
  return {
    bookingId,
    calendarId,
    workerId: "w1",
    serviceId: "s1",
    customerId: "c1",
    startsAt,
    endsAt: startsAt,
    localDate: "2026-05-05",
    confirmationDeadline,
    isOverdue,
    phone,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getPendingBookings.mockResolvedValue([]);
  calendarApi.rejectBooking.mockResolvedValue(undefined);
  calendarApi.cancelBooking.mockResolvedValue(undefined);
  calendarApi.markNoShow.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("the pending-bookings queue", () => {
  it("shows bookings from every calendar the tenant has, not just one", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([
      booking("b1", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false),
      booking("b2", "cal-2aaa", "2026-05-05T11:00:00+00:00", "2026-05-05T08:45:00+00:00", false),
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("cal-1aaa".slice(0, 8));
    expect(container.textContent).toContain("cal-2aaa".slice(0, 8));
  });

  it("rejects a booking and drops it from the queue", async () => {
    calendarApi.getPendingBookings
      .mockResolvedValueOnce([
        booking("b1", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false),
        booking("b2", "cal-2aaa", "2026-05-05T11:00:00+00:00", "2026-05-05T08:45:00+00:00", false),
      ])
      .mockResolvedValueOnce([booking("b1", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false)]);

    const container = await render(page());
    expect(container.textContent).toContain("cal-2aaa".slice(0, 8));

    const rejectButtons = all(container, "button").filter((b) => b.textContent === "Reject");
    await interact(() => (rejectButtons[1] as HTMLButtonElement).click());

    expect(calendarApi.rejectBooking).toHaveBeenCalledWith("token", "b2");
    expect(container.textContent).not.toContain("cal-2aaa".slice(0, 8));
  });

  it("shows an overdue row loudly instead of hiding it", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([
      booking("b3", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", true),
    ]);

    const container = await render(page());

    expect(container.textContent).toMatch(/the sweep is not running/i);
  });

  it("says what the server said when an action is refused", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([booking("b1", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false)]);
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.rejectBooking.mockRejectedValue(new CalendarApiError("booking.invalid_state", "That booking was already confirmed.", 409));

    const container = await render(page());
    const rejectButton = byText<HTMLButtonElement>(container, "button", "Reject");
    await interact(() => rejectButton?.click());

    expect(container.textContent).toContain("That booking was already confirmed.");
  });

  it("shows the phone when the server includes it", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([
      booking("b4", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false, "+79990000001"),
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("+79990000001");
  });

  it("shows 'hidden', not a blank cell, when the server omits the phone", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([booking("b5", "cal-1aaa", "2026-05-05T09:00:00+00:00", "2026-05-05T08:15:00+00:00", false, null)]);

    const container = await render(page());

    expect(container.textContent).toContain("hidden");
  });

  it("shows the empty state when there is nothing to confirm", async () => {
    calendarApi.getPendingBookings.mockResolvedValue([]);

    const container = await render(page());

    expect(container.textContent).toContain("Nothing is waiting.");
    expect(container.querySelector("table")).toBeNull();
  });
});
