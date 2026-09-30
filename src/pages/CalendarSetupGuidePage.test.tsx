import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarSetupGuidePage } from "./CalendarSetupGuidePage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";
import type { CalendarReadiness, TenantConfiguration } from "../api/calendarApi.js";

/**
 * `26-329`: `/calendar/setup/guide` - the guided setup wizard's first implementation slice. Exercised
 * the same way every other calendar screen in this console is (`CalendarWorkersPage.test.tsx`'s own
 * harness), one step at a time: the pure step-derivation logic itself is unit-tested exhaustively in
 * `setupWizardStep.test.ts`, so this file proves each step actually renders the right form and calls
 * the right existing endpoint - never a second copy of the derivation's own truth table.
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
  createCalendar: vi.fn(),
  createWorker: vi.fn(),
  createService: vi.fn(),
  getWorker: vi.fn(),
  updateWorker: vi.fn(),
  addWorkingHoursRule: vi.fn(),
  updateCalendar: vi.fn(),
  previewRecutSchedule: vi.fn(),
  recutSchedule: vi.fn(),
}));
const modulesApi = vi.hoisted(() => ({ fetchModules: vi.fn(), setModuleTriggerWords: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/calendarApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/calendarApi.js")>("../api/calendarApi.js");
  return { ...actual, ...calendarApi };
});
vi.mock("../api/modulesApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
  return { ...actual, ...modulesApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <CalendarSetupGuidePage />
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

function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const NOTHING_CONFIGURED: CalendarReadiness[] = [
  {
    calendarId: null,
    calendarName: null,
    isBookable: false,
    preconditions: [
      { precondition: "WorkerOnCalendar", isMet: false },
      { precondition: "ServiceOffered", isMet: false },
      { precondition: "WorkingHoursConfigured", isMet: false },
      { precondition: "ScheduleSaved", isMet: false },
      { precondition: "SlotsMaterialized", isMet: false },
      { precondition: "CalendarPublished", isMet: false },
    ],
  },
];

const baseConfiguration: TenantConfiguration = {
  tenantName: "Barbershop",
  publicKey: "demo-barbershop",
  allowedOrigins: [],
  calendars: [],
  workers: [],
  services: [],
  workerQuota: 2,
};

function readinessAllMetExcept(unmet: CalendarReadiness["preconditions"][number]["precondition"][]): CalendarReadiness[] {
  const order: CalendarReadiness["preconditions"][number]["precondition"][] = [
    "WorkerOnCalendar",
    "ServiceOffered",
    "WorkingHoursConfigured",
    "ScheduleSaved",
    "SlotsMaterialized",
    "CalendarPublished",
  ];
  return [
    {
      calendarId: "cal-1",
      calendarName: "Main",
      isBookable: unmet.length === 0,
      preconditions: order.map((precondition) => ({ precondition, isMet: !unmet.includes(precondition) })),
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  modulesApi.fetchModules.mockResolvedValue({ modules: [{ moduleKey: "calendar", triggerWords: [], entryPoint: "https://x" }] });
});

afterEach(async () => {
  await unmount();
});

describe("the guided setup wizard", () => {
  it("refuses an operator without calendar:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID, enabledModules: ["calendar"] });
    calendarApi.getConfiguration.mockResolvedValue(baseConfiguration);
    calendarApi.getBookingReadiness.mockResolvedValue(NOTHING_CONFIGURED);

    const container = await render(page());

    expect(calendarApi.getConfiguration).not.toHaveBeenCalled();
    expect(container.textContent).toContain("permission");
  });

  it("starts at create-calendar for a tenant with nothing configured, defaulting the name to the tenant's own", async () => {
    calendarApi.getConfiguration.mockResolvedValue(baseConfiguration);
    calendarApi.getBookingReadiness.mockResolvedValue(NOTHING_CONFIGURED);
    calendarApi.createCalendar.mockResolvedValue({ calendarId: "cal-1" });

    const container = await render(page());

    expect(container.textContent).toContain("Create a calendar");
    const nameField = fieldByLabel<HTMLInputElement>(container, "Calendar name");
    expect(nameField.value).toBe("Barbershop");

    await interact(() => byText<HTMLButtonElement>(container, "button[type=submit]", "Add calendar")?.click());

    expect(calendarApi.createCalendar).toHaveBeenCalledWith("token", { name: "Barbershop", timeZone: "Europe/Moscow", publish: false });
  });

  it("moves to add-master once a calendar exists, and creates a worker on it", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...baseConfiguration,
      calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: false, workerIds: [], workingHours: [] }],
    });
    calendarApi.getBookingReadiness.mockResolvedValue(readinessAllMetExcept(["WorkerOnCalendar", "ServiceOffered", "WorkingHoursConfigured", "ScheduleSaved", "SlotsMaterialized", "CalendarPublished"]));
    calendarApi.createWorker.mockResolvedValue({ workerId: "w1" });

    const container = await render(page());

    expect(container.textContent).toContain("An active worker is on this calendar");
    expect(container.textContent).toContain("0 of 2");

    await interact(() => setTextValue(fieldByLabel(container, "Last name"), "Doe"));
    await interact(() => setTextValue(fieldByLabel(container, "First name"), "Alex"));
    await interact(() => byText<HTMLButtonElement>(container, "button[type=submit]", "Add worker")?.click());

    expect(calendarApi.createWorker).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ lastName: "Doe", firstName: "Alex", calendarId: "cal-1" }),
    );
  });

  it("gates on the booking trigger word before publish, and saves the default word", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...baseConfiguration,
      calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: false, workerIds: ["w1"], workingHours: [] }],
      workers: [{ workerId: "w1", displayName: "Alex Doe", isActive: true, serviceIds: ["s1"] }],
    });
    calendarApi.getBookingReadiness.mockResolvedValue(readinessAllMetExcept(["CalendarPublished"]));
    modulesApi.fetchModules.mockResolvedValue({ modules: [{ moduleKey: "calendar", triggerWords: [], entryPoint: "https://x" }] });
    modulesApi.setModuleTriggerWords.mockResolvedValue(["/записаться"]);

    const container = await render(page());

    expect(container.textContent).toContain("Set a booking trigger word");
    expect(container.textContent).not.toContain("Publish the calendar");

    await interact(() => byText<HTMLButtonElement>(container, "button[type=submit]", "Save trigger words")?.click());

    expect(modulesApi.setModuleTriggerWords).toHaveBeenCalledWith("token", SITE_ID, "calendar", ["/записаться"]);
  });

  it("offers an explicit publish button once every precondition but publish holds and a trigger word exists", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...baseConfiguration,
      calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: false, workerIds: ["w1"], workingHours: [] }],
      workers: [{ workerId: "w1", displayName: "Alex Doe", isActive: true, serviceIds: ["s1"] }],
    });
    calendarApi.getBookingReadiness.mockResolvedValue(readinessAllMetExcept(["CalendarPublished"]));
    modulesApi.fetchModules.mockResolvedValue({ modules: [{ moduleKey: "calendar", triggerWords: ["/записаться"], entryPoint: "https://x" }] });
    calendarApi.updateCalendar.mockResolvedValue(undefined);

    const container = await render(page());

    expect(container.textContent).toContain("The calendar is published");
    await interact(() => byText<HTMLButtonElement>(container, "button", "Publish")?.click());

    expect(calendarApi.updateCalendar).toHaveBeenCalledWith("token", "cal-1", { name: "Main", publish: true });
  });

  it("reaches done once everything, including the trigger word, holds - and links to the widget install screen", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...baseConfiguration,
      calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: true, workerIds: ["w1"], workingHours: [] }],
      workers: [{ workerId: "w1", displayName: "Alex Doe", isActive: true, serviceIds: ["s1"] }],
    });
    calendarApi.getBookingReadiness.mockResolvedValue(readinessAllMetExcept([]));
    modulesApi.fetchModules.mockResolvedValue({ modules: [{ moduleKey: "calendar", triggerWords: ["/записаться"], entryPoint: "https://x" }] });

    const container = await render(page());

    expect(container.textContent).toContain("Done");
    expect(container.textContent).toContain("/записаться");
    const link = byText<HTMLAnchorElement>(container, "a", "Install widget");
    expect(link?.getAttribute("href")).toBe("/channels/install");
  });
});
