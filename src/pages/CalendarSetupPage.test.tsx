import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarSetupPage } from "./CalendarSetupPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { TenantConfiguration } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/setup` - moved from `ago-calendar-console`'s own `ConfigurationPage.test.tsx`,
 * adapted to this console's own harness - see `CalendarQueuePage.test.tsx`'s own doc comment.
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
  getConfiguration: vi.fn(),
  getBookingReadiness: vi.fn(),
  setAllowedOrigins: vi.fn(),
  createCalendar: vi.fn(),
  createService: vi.fn(),
  addWorkingHoursRule: vi.fn(),
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
          <CalendarSetupPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function fieldByLabel<T extends HTMLElement>(container: HTMLElement, label: string): T {
  const labelEl = byText<HTMLLabelElement>(container, ".ago-field__label", label);
  if (labelEl === null) {
    throw new Error(`no '${label}' field label found`);
  }
  const id = labelEl.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (field === null) {
    throw new Error(`'${label}' field has no control with id='${id}'`);
  }
  return field as T;
}

function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const configuration: TenantConfiguration = {
  tenantName: "Barbershop",
  publicKey: "demo-barbershop",
  allowedOrigins: ["https://shop.example"],
  calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: true, workerIds: ["w1"], workingHours: [] }],
  workers: [{ workerId: "w1", displayName: "Alex", isActive: true, serviceIds: ["s1"] }],
  services: [{ serviceId: "s1", name: "Haircut", durationMinutes: 45 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfiguration.mockResolvedValue(configuration);
  calendarApi.getBookingReadiness.mockResolvedValue([]);
  calendarApi.setAllowedOrigins.mockResolvedValue(undefined);
  calendarApi.createCalendar.mockResolvedValue({ calendarId: "cal-2" });
  calendarApi.createService.mockResolvedValue({ serviceId: "s2" });
  calendarApi.addWorkingHoursRule.mockResolvedValue({ ruleId: "r1" });
});

afterEach(async () => {
  await unmount();
});

describe("the tenant setup screen", () => {
  // `22-22`: this test used to assert `data-booking="demo-barbershop"` and a `data-booking-api`
  // attribute - it encoded the defect rather than catching it, which is why CI stayed green while the
  // snippet could not work. It now asserts only what `ago-widget/src/config.ts` actually reads, and
  // asserts the absence of what it does not.
  it("shows an embed snippet the widget can actually read", async () => {
    const container = await render(page());

    const snippet = container.querySelector("pre[aria-label='Embed snippet']");

    // The literal "true", not a key: the widget tests `dataset["booking"] === "true"`, so any real
    // public key here evaluates to false and the booking chip silently never renders.
    expect(snippet?.textContent).toContain('data-booking="true"');
    expect(snippet?.textContent).not.toContain("demo-barbershop");

    // `#342` renamed the bundle, and the URL is composed from apiBaseUrl the way InstallSnippetPage
    // composes its own, so the two cannot drift apart again.
    expect(snippet?.textContent).toContain("/widget/widget.js");
    expect(snippet?.textContent).not.toContain("ago-chat.js");
    expect(snippet?.textContent).not.toContain("…");

    // Read by nothing in the widget's parseConfig.
    expect(snippet?.textContent).not.toContain("data-booking-api");

    expect(snippet?.textContent).toContain("data-site=");
    expect(snippet?.textContent?.match(/<script/g)).toHaveLength(1);
  });

  it("tells the tenant where to get the site key it cannot fill in for them", async () => {
    const container = await render(page());

    // The chat site's key needs `site:configure`; this screen is reached with `calendar:configure`.
    // So the placeholder stays and the copy has to lead somewhere.
    const link = byText<HTMLAnchorElement>(container, "a", "Install widget");
    expect(link?.getAttribute("href")).toBe("/settings/install");
  });

  it("creates a calendar with an IANA zone", async () => {
    const container = await render(page());

    await interact(() => setTextValue(fieldByLabel(container, "Calendar name"), "Second chair"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add calendar")?.click());

    expect(calendarApi.createCalendar).toHaveBeenCalledWith("token", {
      name: "Second chair",
      timeZone: "Europe/Moscow",
      publish: true,
    });
  });

  it("sends working hours as wall clock, never as an instant", async () => {
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Add working hours")?.click());

    expect(calendarApi.addWorkingHoursRule).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ startsAt: "09:00", endsAt: "18:00", dayOfWeek: 1, workerId: "w1" }),
    );
  });

  it("replaces the whole allowed-origin list rather than appending to it", async () => {
    const container = await render(page());

    const origins = fieldByLabel<HTMLTextAreaElement>(container, "One origin per line");
    await interact(() => setTextValue(origins, "https://a.example\nhttps://b.example"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save origins")?.click());

    expect(calendarApi.setAllowedOrigins).toHaveBeenCalledWith("token", ["https://a.example", "https://b.example"]);
  });

  it("shows the server's own rejection instead of pretending the write worked", async () => {
    const { CalendarApiError } = await import("../api/calendarApi.js");
    calendarApi.setAllowedOrigins.mockRejectedValue(
      new CalendarApiError("configuration.invalid", "'https://shop.example/booking' is not an origin.", 400),
    );

    const container = await render(page());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save origins")?.click());

    expect(container.textContent).toContain("'https://shop.example/booking' is not an origin.");
  });

  // `23-23`: this screen renders the server's own readiness answer verbatim - it invents nothing
  // about which precondition is unmet, only where to send the tenant for the one it names.
  it("names the unmet precondition and links to the screen that fixes it", async () => {
    calendarApi.getBookingReadiness.mockResolvedValue([
      {
        calendarId: "cal-1",
        calendarName: "Main",
        isBookable: false,
        preconditions: [
          { precondition: "CalendarPublished", isMet: true },
          { precondition: "WorkerOnCalendar", isMet: true },
          { precondition: "ServiceOffered", isMet: true },
          { precondition: "WorkingHoursConfigured", isMet: true },
          { precondition: "ScheduleSaved", isMet: true },
          { precondition: "SlotsMaterialized", isMet: false },
        ],
      },
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("Not bookable");
    expect(container.textContent).toContain("Slots have been generated inside the horizon");

    const link = byText<HTMLAnchorElement>(container, "a", "View slots");
    expect(link?.getAttribute("href")).toBe("/calendar/workers");
  });

  it("shows a bookable calendar as bookable, with nothing to fix", async () => {
    calendarApi.getBookingReadiness.mockResolvedValue([
      {
        calendarId: "cal-1",
        calendarName: "Main",
        isBookable: true,
        preconditions: [
          { precondition: "CalendarPublished", isMet: true },
          { precondition: "WorkerOnCalendar", isMet: true },
          { precondition: "ServiceOffered", isMet: true },
          { precondition: "WorkingHoursConfigured", isMet: true },
          { precondition: "ScheduleSaved", isMet: true },
          { precondition: "SlotsMaterialized", isMet: true },
        ],
      },
    ]);

    const container = await render(page());

    expect(container.textContent).toContain("Bookable");
    expect(container.querySelector("a[href='/calendar/setup'], a[href='/calendar/workers']")).toBeNull();
  });
});
