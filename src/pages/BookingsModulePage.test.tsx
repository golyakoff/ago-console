import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { BookingsModulePage } from "./BookingsModulePage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `26-316`: the tenant admin's own on/off toggle for the bookings (calendar) module. The screen's own
 * promises: it refuses without `site:configure`; it turns the module on with one click (sending the
 * module key and the site's booking trigger word, nothing secret); it turns it off with one click; and it
 * offers no off control for a module a platform owner granted (an override the tenant cannot switch off).
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const modulesApi = vi.hoisted(() => ({
  fetchModules: vi.fn(),
  enableModule: vi.fn(),
  disableModule: vi.fn(),
  setModuleTriggerWords: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/modulesApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
  return { ...actual, ...modulesApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** jsdom's `Location.prototype.reload` is non-configurable, so the whole `window.location` object has to
 * be replaced to observe the reload the toggle performs - the identical stub
 * `operatorShellUserMenu.test.tsx` uses for the tenancy switcher's own reload. */
const originalLocation = window.location;
function stubLocationReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } });
  return reload;
}

function calendarRow(overrides: Record<string, unknown> = {}) {
  return {
    moduleKey: "calendar",
    triggerWords: ["/записаться"],
    entryPoint: "https://calendar.example.com",
    grantedByOwner: false,
    ...overrides,
  };
}

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({
      user: signedIn(),
      isLoading: false,
      isSigningOut: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` for the same reason `ProductsPage.test.tsx`'s own `page` is - the
 * permission-refusal branch renders `AccessRefusal`, which renders a `<Link>` that throws outside a
 * router context. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <BookingsModulePage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function buttonLabelled(container: HTMLElement, label: string): HTMLButtonElement | null {
  return byText<HTMLButtonElement>(container, "button", label);
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID, enabledModules: [] });
  modulesApi.enableModule.mockResolvedValue(undefined);
  modulesApi.disableModule.mockResolvedValue(undefined);
  modulesApi.setModuleTriggerWords.mockResolvedValue(["/записаться"]);
});

// The same tracked-setter dance `WidgetConfigPage.test.tsx` uses: a bare `.value =` is swallowed by
// React as "no change", so go through the prototype's setter then dispatch a real "input" event.
function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(async () => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  await unmount();
});

describe("the bookings module toggle", () => {
  it("refuses an operator without site:configure", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID, enabledModules: [] });
    modulesApi.fetchModules.mockResolvedValue({ modules: [] });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to change this site's bookings module.");
    // The gate holds before any read is even attempted.
    expect(modulesApi.fetchModules).not.toHaveBeenCalled();
  });

  it("shows Off and turns the module on with one click, sending the trigger word", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [] });
    const reload = stubLocationReload();
    const container = await render(page());

    expect(container.textContent).toContain("Off");
    const enable = buttonLabelled(container, "Turn on");
    expect(enable).not.toBeNull();

    await interact(() => enable.click());

    expect(modulesApi.enableModule).toHaveBeenCalledTimes(1);
    expect(modulesApi.enableModule).toHaveBeenCalledWith("token", SITE_ID, "calendar", ["/записаться"]);
    expect(modulesApi.disableModule).not.toHaveBeenCalled();
    // The whole console re-bootstraps so the nav and calendar screens reflect the new state.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows On and turns the module off with one click when the tenant enabled it themselves", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow()] });
    const reload = stubLocationReload();
    const container = await render(page());

    expect(container.textContent).toContain("On");
    const disable = buttonLabelled(container, "Turn off");
    expect(disable).not.toBeNull();

    await interact(() => disable.click());

    expect(modulesApi.disableModule).toHaveBeenCalledTimes(1);
    expect(modulesApi.disableModule).toHaveBeenCalledWith("token", SITE_ID, "calendar");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("offers no off control for a platform-owner grant, and says AGO manages it", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow({ grantedByOwner: true })] });
    const container = await render(page());

    expect(container.textContent).toContain("On");
    expect(container.textContent).toContain("enabled for your account by AGO");
    expect(buttonLabelled(container, "Turn off")).toBeNull();
  });

  it("surfaces the server's refusal inline without reloading when enabling fails", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [] });
    const { ModulesError } = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
    modulesApi.enableModule.mockRejectedValue(new ModulesError("Module.ProvisioningNotConfigured", "Not configured yet."));
    const reload = stubLocationReload();
    const container = await render(page());

    await interact(() => buttonLabelled(container, "Turn on").click());

    expect(container.textContent).toContain("Not configured yet.");
    expect(reload).not.toHaveBeenCalled();
  });

  // `26-320`: the trigger-words editor, only on a tenant's own enabled module.
  it("shows the current trigger words and saves an edited set without reloading", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow()] });
    modulesApi.setModuleTriggerWords.mockResolvedValue(["/записаться", "/booking"]);
    const reload = stubLocationReload();
    const container = await render(page());

    const field = one<HTMLInputElement>(container, "input.ago-control");
    expect(field.value).toBe("/записаться");

    await interact(() => setTextValue(field, "/записаться, /booking"));
    await interact(() => buttonLabelled(container, "Save trigger words").click());

    expect(modulesApi.setModuleTriggerWords).toHaveBeenCalledTimes(1);
    expect(modulesApi.setModuleTriggerWords).toHaveBeenCalledWith("token", SITE_ID, "calendar", ["/записаться", "/booking"]);
    expect(container.textContent).toContain("Booking trigger words saved.");
    // Editing trigger words feeds only routing - the page does not reload the way the on/off toggle does.
    expect(reload).not.toHaveBeenCalled();
  });

  it("surfaces the server's reserved/collision refusal inline when saving trigger words fails", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow()] });
    const { ModulesError } = await vi.importActual<typeof import("../api/modulesApi.js")>("../api/modulesApi.js");
    modulesApi.setModuleTriggerWords.mockRejectedValue(
      new ModulesError("Module.TriggerWordAlreadyRegistered", "Trigger word '/faq' is already registered to module 'faq' on this site."),
    );
    const container = await render(page());

    await interact(() => setTextValue(one<HTMLInputElement>(container, "input.ago-control"), "/faq"));
    await interact(() => buttonLabelled(container, "Save trigger words").click());

    expect(container.textContent).toContain("is already registered to module 'faq'");
  });

  it("refuses to save an empty set client-side, without calling the server", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow()] });
    const container = await render(page());

    await interact(() => setTextValue(one<HTMLInputElement>(container, "input.ago-control"), "   "));
    await interact(() => buttonLabelled(container, "Save trigger words").click());

    expect(modulesApi.setModuleTriggerWords).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Enter at least one trigger word.");
  });

  it("offers no trigger-words editor for a platform-owner grant", async () => {
    modulesApi.fetchModules.mockResolvedValue({ modules: [calendarRow({ grantedByOwner: true })] });
    const container = await render(page());

    expect(container.querySelector("input.ago-control")).toBeNull();
    expect(buttonLabelled(container, "Save trigger words")).toBeNull();
  });
});
