import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { WidgetConfigPage } from "./WidgetConfigPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `11-10`: the console half of "the widget speaks the tenant's chosen language" - the one new
 * `Select` this item adds to `WidgetConfigPage`, modeled on the launcher-position control already
 * proven by `permissionGating.test.tsx` (which covers the page's `site:configure` gate and is not
 * repeated here). What is new here is the field itself: it loads the site's current locale, and
 * saving sends the chosen one back alongside color and position in the one existing PUT.
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
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const widgetConfigApi = vi.hoisted(() => ({ fetchWidgetConfig: vi.fn(), updateWidgetConfig: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/widgetConfigApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/widgetConfigApi.js")>("../api/widgetConfigApi.js");
  return { ...actual, ...widgetConfigApi };
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
    <Signed>
      <PermissionsProvider>
        <WidgetConfigPage />
      </PermissionsProvider>
    </Signed>
  );
}

/** The `<select>` for "Widget language" - found via its `<label>`'s `htmlFor`, matching `Field`'s
 * own wiring, not by class name (`testing.md`: never assert on structure a restyle would break). */
function localeSelect(container: HTMLElement): HTMLSelectElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Widget language");
  if (label === null) {
    throw new Error("no 'Widget language' field label found");
  }

  const id = label.getAttribute("for");
  const select = id ? document.getElementById(id) : null;
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("'Widget language' field is not a <select>");
  }

  return select;
}

beforeEach(() => {
  vi.clearAllMocks();
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  widgetConfigApi.fetchWidgetConfig.mockResolvedValue({
    siteId: SITE_ID,
    primaryColorHex: null,
    position: "BottomRight",
    locale: "Ru",
  });
  widgetConfigApi.updateWidgetConfig.mockImplementation((_token: string, _siteId: string, dto: unknown) =>
    Promise.resolve(dto),
  );
});

afterEach(async () => {
  await unmount();
});

describe("the widget language field", () => {
  it("loads the site's current language into the select", async () => {
    const container = await render(page());

    expect(localeSelect(container).value).toBe("Ru");
  });

  it("saves the chosen language alongside the existing color and position, in one PUT", async () => {
    const container = await render(page());

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(widgetConfigApi.updateWidgetConfig).toHaveBeenCalledWith(
      "token",
      SITE_ID,
      expect.objectContaining({ position: "BottomRight", locale: "En" }),
    );
  });

  it("reflects the server's saved language back into the select", async () => {
    const container = await render(page());
    widgetConfigApi.updateWidgetConfig.mockResolvedValue({ primaryColorHex: null, position: "BottomRight", locale: "En" });

    await interact(() => {
      const select = localeSelect(container);
      select.value = "En";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await interact(() => one<HTMLButtonElement>(container, "button[type='submit']").click());

    expect(localeSelect(container).value).toBe("En");
    expect(container.textContent).toContain("Saved.");
  });
});
