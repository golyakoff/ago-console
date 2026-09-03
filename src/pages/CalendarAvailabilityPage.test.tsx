import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarAvailabilityPage } from "./CalendarAvailabilityPage.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";
import type { TenantConfiguration } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/availability` - moved from `ago-calendar-console`'s own
 * `AvailabilityPage.tsx`, which had **no test file of its own** in the source console. New coverage,
 * not a port, following this console's own "every screen carries tests" convention rather than
 * leaving the gap in place.
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
const calendarApi = vi.hoisted(() => ({ getConfiguration: vi.fn(), deleteDayOff: vi.fn(), editDayBoundary: vi.fn() }));

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
          <CalendarAvailabilityPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const configuration: TenantConfiguration = {
  tenantName: "Barbershop",
  publicKey: "demo-barbershop",
  allowedOrigins: [],
  calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: true, workerIds: ["w1"], workingHours: [] }],
  workers: [{ workerId: "w1", displayName: "Alex", isActive: true, serviceIds: [] }],
  services: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfiguration.mockResolvedValue(configuration);
  calendarApi.deleteDayOff.mockResolvedValue(undefined);
  calendarApi.editDayBoundary.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("the availability screen", () => {
  it("closes a worker's day off, naming the worker and calendar", async () => {
    const container = await render(page());

    const dateInputs = all(container, "input[type=date]") as HTMLInputElement[];
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dateInputs[0], "2026-06-01");
      dateInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Close the day")?.click());

    expect(calendarApi.deleteDayOff).toHaveBeenCalledWith("token", { calendarId: "cal-1", workerId: "w1", localDate: "2026-06-01" });
    expect(container.textContent).toContain("The day is closed.");
  });

  it("changes a day's hours with wall-clock times", async () => {
    const container = await render(page());

    const dateInputs = all(container, "input[type=date]") as HTMLInputElement[];
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dateInputs[1], "2026-06-02");
      dateInputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Apply the new hours")?.click());

    expect(calendarApi.editDayBoundary).toHaveBeenCalledWith("token", {
      calendarId: "cal-1",
      workerId: "w1",
      localDate: "2026-06-02",
      opensAt: "11:00",
      closesAt: "16:00",
    });
  });

  it("shows the server's own rejection when a day already has a booking on it", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.deleteDayOff.mockRejectedValue(new CalendarApiError("availability.day_has_bookings", "Cancel the booking first.", 409));

    const container = await render(page());
    const dateInputs = all(container, "input[type=date]") as HTMLInputElement[];
    await interact(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(dateInputs[0], "2026-06-01");
      dateInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Close the day")?.click());

    expect(container.textContent).toContain("Cancel the booking first.");
  });

  it("shows a note instead of the forms when no worker is on a calendar yet", async () => {
    calendarApi.getConfiguration.mockResolvedValue({ ...configuration, calendars: [] });

    const container = await render(page());

    expect(container.textContent).toMatch(/no worker is on a calendar yet/i);
    expect(container.querySelector("form")).toBeNull();
  });
});
