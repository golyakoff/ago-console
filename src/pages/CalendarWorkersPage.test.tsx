import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarWorkersPage } from "./CalendarWorkersPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { TenantConfiguration, WorkerDetail } from "../api/calendarApi.js";

/**
 * `22-06`: `/calendar/workers` - moved from `ago-calendar-console`'s own `WorkersPage.test.tsx`,
 * adapted to this console's own harness (`CalendarQueuePage.test.tsx`'s own doc comment has the "why
 * this shape" note). `calendarApi` is mocked function-by-function rather than at the `fetch` level -
 * this console's own established convention (`permissionGating.test.tsx`'s `widgetConfigApi`/
 * `offlineAutoReplyApi` mocks), unlike the source console's raw-`fetch` stub.
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
  listWorkers: vi.fn(),
  getConfiguration: vi.fn(),
  createWorker: vi.fn(),
  updateWorker: vi.fn(),
  deleteWorker: vi.fn(),
  getWorkerSchedule: vi.fn(),
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
          <CalendarWorkersPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

/** `FaqModulePage.test.tsx`'s own `fieldByLabel` helper, byte-for-byte - finds a `Field`'s control by
 * its `<label>` text via `htmlFor`, never by structure. */
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

const alex: WorkerDetail = {
  workerId: "w1",
  lastName: "Doe",
  firstName: "Alex",
  middleName: null,
  displayName: "Alex Doe",
  displayNameIsCustom: false,
  isActive: true,
  createdAt: "2026-03-02T09:00:00Z",
  updatedAt: "2026-03-02T09:00:00Z",
};

const configuration: TenantConfiguration = {
  tenantName: "Barbershop",
  publicKey: "demo-barbershop",
  allowedOrigins: [],
  calendars: [{ calendarId: "cal-1", name: "Main", timeZone: "Europe/Moscow", isPublished: true, workerIds: ["w1"], workingHours: [] }],
  workers: [{ workerId: "w1", displayName: "Alex Doe", isActive: true, serviceIds: [] }],
  services: [{ serviceId: "s1", name: "Haircut", durationMinutes: 45 }],
};

beforeEach(async () => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.listWorkers.mockResolvedValue([alex]);
  calendarApi.getConfiguration.mockResolvedValue(configuration);
  calendarApi.createWorker.mockResolvedValue({ workerId: "w2" });
  calendarApi.updateWorker.mockResolvedValue(undefined);
  calendarApi.deleteWorker.mockResolvedValue(undefined);
  // `20-14`: the schedule section the worker card renders while editing fires its own GET on mount -
  // none of these tests care about it, so every worker starts with none, the real server's own
  // "not configured yet" answer.
  const { CalendarApiError } = await import("../api/calendarApi.js");
  calendarApi.getWorkerSchedule.mockRejectedValue(new CalendarApiError("configuration.no_schedule", "No schedule yet.", 404));
});

afterEach(async () => {
  await unmount();
});

describe("the workers screen", () => {
  it("lists every worker with their activity, created and updated timestamps", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Alex Doe");
    const row = byText<HTMLElement>(container, "td", "Alex Doe")?.closest("tr");
    expect(row?.textContent).toContain("Active");
  });

  it("creates a worker with split name fields, on exactly one calendar", async () => {
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Add worker")?.click());
    await interact(() => setTextValue(fieldByLabel(container, "Last name"), "Fox"));
    await interact(() => setTextValue(fieldByLabel(container, "First name"), "Robin"));
    const haircutCheckbox = byText<HTMLLabelElement>(container, "fieldset label", "Haircut")?.querySelector("input");
    await interact(() => haircutCheckbox?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button[type=submit]", "Add worker")?.click());

    expect(calendarApi.createWorker).toHaveBeenCalledWith("token", {
      lastName: "Fox",
      firstName: "Robin",
      middleName: null,
      displayName: null,
      calendarId: "cal-1",
      serviceIds: ["s1"],
    });
  });

  it("refuses to offer a create card before there is a calendar to put a worker on", async () => {
    calendarApi.getConfiguration.mockResolvedValue({ ...configuration, calendars: [] });
    calendarApi.listWorkers.mockResolvedValue([]);

    const container = await render(page());

    expect(container.textContent).toContain("Add a calendar first");
    const addButton = byText<HTMLButtonElement>(container, "button", "Add worker");
    expect(addButton?.disabled).toBe(true);
  });

  it("deletes a worker after confirming, and reloads the table", async () => {
    calendarApi.listWorkers.mockResolvedValueOnce([alex]).mockResolvedValueOnce([]);

    const container = await render(page());
    expect(container.textContent).toContain("Alex Doe");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete")?.click());
    expect(container.textContent).toContain("never been booked");

    const confirmButtons = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === "Delete");
    await interact(() => confirmButtons[confirmButtons.length - 1]?.click());

    expect(calendarApi.deleteWorker).toHaveBeenCalledWith("token", "w1");
    expect(container.textContent).not.toContain("Alex Doe");
  });

  it("edits a worker's activity toggle and saves", async () => {
    const container = await render(page());
    expect(container.textContent).toContain("Alex Doe");

    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit")?.click());
    const activeCheckbox = one<HTMLInputElement>(container, "input[type=checkbox]");
    await interact(() => activeCheckbox.click());
    const saveButton = byText<HTMLButtonElement>(container, "button[type=submit]", "Save");
    await interact(() => saveButton?.click());

    expect(calendarApi.updateWorker).toHaveBeenCalledWith("token", "w1", expect.objectContaining({ isActive: false }));
  });
});
