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
  updateCalendar: vi.fn(),
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
  services: [
    {
      serviceId: "s1",
      name: "Haircut",
      durationMinutes: 45,
      priceMinorUnits: null,
      priceCurrencyCode: null,
      priceIsFrom: false,
      description: null,
    },
  ],
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
  calendarApi.updateCalendar.mockResolvedValue(undefined);
  calendarApi.addWorkingHoursRule.mockResolvedValue({ ruleId: "r1" });
});

afterEach(async () => {
  await unmount();
});

describe("the tenant setup screen", () => {
  // `23-105`: this screen used to show an embed snippet with a `data-booking` attribute for the
  // tenant to paste - `22-22` fixed what the snippet said, `23-105` found the snippet itself was the
  // wrong fix: booking is an entitlement (`adr/0151`), and no attribute on a tenant's own page can
  // assert one. This test proves the replacement holds - no snippet, no `<pre>`, no instruction to
  // edit anything - which is the item's own Done-when ("the setup screen stops asking a tenant to
  // change their site").
  it("does not ask the tenant to paste or edit anything - booking arrives on its own", async () => {
    const container = await render(page());

    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).not.toContain("data-booking");
    expect(container.textContent).not.toContain("<script");
    expect(container.textContent).toContain(
      "Booking appears in the chat widget already installed on your site as soon as this account is granted the calendar module",
    );
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

  // `25-53`: two blocks (a current-calendars table, a separate add-calendar card), split from the
  // one blended `<ul>`-plus-form card this section used to be.
  it("splits the calendars section into a current-calendars table and a separate add-calendar card", async () => {
    const container = await render(page());

    const headings = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    expect(headings).toContain("Calendars");
    expect(headings).toContain("New calendar");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent).toContain("Main");
  });

  // `25-53`: `updateCalendar` already existed (`calendarApi.ts`) but had no console UI before this
  // item - the table's own Edit action is new UI wired to an already-existing write, not new backend
  // capability. No delete action anywhere: `calendarApi.ts` exports no `deleteCalendar` - a real gap,
  // not an omission.
  it("edits a calendar from the table's own Edit action, and has no delete action at all", async () => {
    const container = await render(page());

    expect(byText<HTMLButtonElement>(container, "button", "Delete")).toBeNull();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit")?.click());
    expect(Array.from(container.querySelectorAll("h2")).map((h) => h.textContent)).toContain("Edit calendar");

    await interact(() => setTextValue(fieldByLabel(container, "Calendar name"), "Main (renamed)"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save")?.click());

    expect(calendarApi.updateCalendar).toHaveBeenCalledWith("token", "cal-1", {
      name: "Main (renamed)",
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

  /**
   * `23-46`: what the field shows before anything is typed. The example carries the scheme because an
   * origin without one never matches - the browser sends `Origin: https://shop.example`, and the
   * comparison is literal (`5-01`, layer 2) - and a field that leaves a person guessing between
   * `shop.ru` and `https://shop.ru` produces a widget that silently never connects.
   *
   * Asserted on the English locale here; `siteConfigLocale.test.tsx` covers that the Russian one is a
   * `.ru` example rather than a translated `.com`, which is the reason this became a string at all.
   */
  it("shows an example address with its scheme, because an origin without one never matches", async () => {
    const container = await render(page());

    const origins = fieldByLabel<HTMLTextAreaElement>(container, "One origin per line");
    expect(origins.placeholder).toBe("https://your.site.com");
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
    expect(link?.getAttribute("href")).toBe("/calendar/masters");
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
