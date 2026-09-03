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
  calendarApi.setAllowedOrigins.mockResolvedValue(undefined);
  calendarApi.createCalendar.mockResolvedValue({ calendarId: "cal-2" });
  calendarApi.createService.mockResolvedValue({ serviceId: "s2" });
  calendarApi.addWorkingHoursRule.mockResolvedValue({ ruleId: "r1" });
});

afterEach(async () => {
  await unmount();
});

describe("the tenant setup screen", () => {
  it("shows the embed snippet with the tenant's own public key and API origin in it", async () => {
    const container = await render(page());

    const snippet = container.querySelector("pre[aria-label='Embed snippet']");
    expect(snippet?.textContent).toContain('data-booking="demo-barbershop"');
    expect(snippet?.textContent).toContain('data-booking-api="https://calendar-api.test.invalid"');
    expect(snippet?.textContent).toContain("data-site=");
    expect(snippet?.textContent?.match(/<script/g)).toHaveLength(1);
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
});
