import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { CalendarServicesPage } from "./CalendarServicesPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { TenantConfiguration } from "../api/calendarApi.js";

/**
 * `23-31`: `/calendar/services` - carved out of `CalendarSetupPage`'s own combined screen, onto its
 * own route. This harness mirrors `CalendarSetupPage.test.tsx`'s exactly (same fixtures, same
 * `fieldByLabel`/`setTextValue` helpers) - the two screens read the identical `TenantConfiguration`
 * shape and the split changed which screen renders which panel, not how either is tested.
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
  createService: vi.fn(),
  updateService: vi.fn(),
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
          <CalendarServicesPage />
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

/** `23-35`'s own `Description` textarea - `setTextValue`'s own trick, on
 * `HTMLTextAreaElement.prototype` instead: the description field is a `Textarea`, not an `Input`. */
function setTextareaValue(element: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** `23-35`'s own checkbox. `element.click()` rather than a hand-built event: jsdom's real click
 * implementation both toggles `.checked` and fires the native `click` React's checkbox `onChange`
 * actually listens for - the same reason testing-library's own `fireEvent.click` is how a checkbox
 * is conventionally toggled rather than a synthetic `change`. */
function clickCheckbox(element: HTMLInputElement): void {
  element.click();
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
      isActive: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["calendar:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  calendarApi.getConfiguration.mockResolvedValue(configuration);
  calendarApi.createService.mockResolvedValue({ serviceId: "s2" });
  calendarApi.updateService.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("the services dictionary screen", () => {
  it("lists the existing services, name and duration", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("45");
  });

  // `25-53`: two blocks (a current-services table, a separate add-service card), split from the
  // one blended card this screen used to be - the item's own named example. `26-96` gave the table
  // the actions column `25-53` had to leave out, and the assertion that used to say "no Edit button"
  // now says the opposite - while still asserting no "Delete", which this product deliberately does
  // not offer for a service (`Ago.Calendar.Domain.Service.IsActive`).
  it("splits into a current-services table and a separate add-service card, with edit but never delete", async () => {
    const container = await render(page());

    const headings = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    expect(headings).toContain("Services");
    expect(headings).toContain("New service");
    expect(container.querySelector("table")).not.toBeNull();
    expect(byText<HTMLButtonElement>(container, "button", "Edit")).not.toBeNull();
    expect(byText<HTMLButtonElement>(container, "button", "Withdraw")).not.toBeNull();
    expect(byText<HTMLButtonElement>(container, "button", "Delete")).toBeNull();
  });

  it("adds a service with no price or description and re-reads the configuration", async () => {
    calendarApi.getConfiguration.mockResolvedValueOnce(configuration).mockResolvedValueOnce({
      ...configuration,
      services: [
        ...configuration.services,
        {
          serviceId: "s2",
          name: "Beard trim",
          durationMinutes: 20,
          priceMinorUnits: null,
          priceCurrencyCode: null,
          priceIsFrom: false,
          description: null,
        },
      ],
    });

    const container = await render(page());

    await interact(() => setTextValue(fieldByLabel(container, "Service name"), "Beard trim"));
    await interact(() => setTextValue(fieldByLabel(container, "Duration (minutes)"), "20"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add service")?.click());

    // `23-35`: a nullable field that is sometimes wrong is worse than an honest absence - a service
    // created with neither field left blank sends null, not a zero or an empty string standing in
    // for "unset".
    expect(calendarApi.createService).toHaveBeenCalledWith("token", {
      name: "Beard trim",
      durationMinutes: 20,
      priceMinorUnits: null,
      priceIsFrom: false,
      description: null,
    });
    expect(calendarApi.getConfiguration).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Beard trim");
  });

  it("adds a service with a price and a description", async () => {
    const container = await render(page());

    await interact(() => setTextValue(fieldByLabel(container, "Service name"), "Colour"));
    await interact(() => setTextValue(fieldByLabel(container, "Duration (minutes)"), "90"));
    await interact(() => setTextValue(fieldByLabel(container, "Price (RUB)"), "3500"));
    await interact(() => clickCheckbox(one<HTMLInputElement>(container, 'input[type="checkbox"]')));
    await interact(() => setTextareaValue(fieldByLabel(container, "Description"), "Full colour and toner."));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add service")?.click());

    // 3500 rubles is 350000 kopecks - Ago.Calendar.Domain.Money's own minor units, converted at this
    // exact boundary so the server never parses a fractional-ruble string.
    expect(calendarApi.createService).toHaveBeenCalledWith("token", {
      name: "Colour",
      durationMinutes: 90,
      priceMinorUnits: 350000,
      priceIsFrom: true,
      description: "Full colour and toner.",
    });
  });

  it("shows a stated price and description on the existing services list", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...configuration,
      services: [
        {
          serviceId: "s1",
          name: "Colour",
          durationMinutes: 90,
          priceMinorUnits: 350000,
          priceCurrencyCode: "RUB",
          priceIsFrom: true,
          description: "Full colour and toner.",
          isActive: true,
        },
      ],
    });

    const container = await render(page());

    // "от" ("from") - the floor reading, because this service's own real cost varies.
    expect(container.textContent).toContain("от 3500 ₽");
    expect(container.textContent).toContain("Full colour and toner.");
  });

  // `26-96`: the edit and the withdrawal this screen had no API for until now.

  it("opens the edit card prefilled and sends every field back", async () => {
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit")?.click());

    // Prefilled from the row, not blank: the whole point is correcting what is already there.
    expect(fieldByLabel<HTMLInputElement>(container, "Service name").value).toBe("Haircut");
    expect(fieldByLabel<HTMLInputElement>(container, "Duration (minutes)").value).toBe("45");
    // The create card is gone while the edit card is open - never two forms on screen at once.
    expect(byText<HTMLButtonElement>(container, "button", "Add service")).toBeNull();

    await interact(() => setTextValue(fieldByLabel(container, "Duration (minutes)"), "60"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save service")?.click());

    expect(calendarApi.updateService).toHaveBeenCalledWith("token", "s1", {
      name: "Haircut",
      durationMinutes: 60,
      priceMinorUnits: null,
      priceIsFrom: false,
      description: null,
      isActive: true,
    });
    // The authoritative answer is always the next GET - no optimistic update on this screen.
    expect(calendarApi.getConfiguration).toHaveBeenCalledTimes(2);
  });

  it("prefills a stated price back into rubles rather than kopecks", async () => {
    calendarApi.getConfiguration.mockResolvedValue({
      ...configuration,
      services: [
        {
          serviceId: "s1",
          name: "Colour",
          durationMinutes: 90,
          priceMinorUnits: 350000,
          priceCurrencyCode: "RUB",
          priceIsFrom: true,
          description: "Full colour and toner.",
          isActive: true,
        },
      ],
    });
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit")?.click());

    // The exact inverse of the kopeck conversion the create form does - 350000 back to "3500",
    // never "350000" and never "3500.00".
    expect(fieldByLabel<HTMLInputElement>(container, "Price (RUB)").value).toBe("3500");
  });

  it("withdraws a service from the row, sending its own current fields beside the flipped flag", async () => {
    const container = await render(page());

    await interact(() => byText<HTMLButtonElement>(container, "button", "Withdraw")?.click());

    // Replace semantics: the endpoint takes the whole record, so a row toggle has to send the five
    // fields it already holds rather than only the flag.
    expect(calendarApi.updateService).toHaveBeenCalledWith("token", "s1", {
      name: "Haircut",
      durationMinutes: 45,
      priceMinorUnits: null,
      priceIsFrom: false,
      description: null,
      isActive: false,
    });
  });

  it("keeps a withdrawn service on the list, marked, and offers to put it back", async () => {
    // The visible half of option (a): a withdrawn service does not vanish from the console, because
    // `GET /configuration` deliberately keeps returning it - a worker card and a past booking both
    // resolve their service name through the same record.
    calendarApi.getConfiguration.mockResolvedValue({
      ...configuration,
      services: [{ ...configuration.services[0], isActive: false }],
    });

    const container = await render(page());

    expect(container.textContent).toContain("Haircut");
    expect(container.textContent).toContain("Withdrawn");
    expect(byText<HTMLButtonElement>(container, "button", "Withdraw")).toBeNull();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Put back on offer")?.click());

    expect(calendarApi.updateService).toHaveBeenCalledWith(
      "token",
      "s1",
      expect.objectContaining({ isActive: true }),
    );
  });

  it("refuses an operator who lacks calendar:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure"],
      siteId: SITE_ID,
      enabledModules: ["calendar"],
    });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission");
    expect(calendarApi.getConfiguration).not.toHaveBeenCalled();
  });
});
