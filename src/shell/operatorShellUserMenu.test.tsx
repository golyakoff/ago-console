import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ACTIVE_SITE_STORAGE_KEY } from "../auth/activeSiteStorage.js";
import { OperatorShell } from "./OperatorShell.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `13-07`/`adr/0068`/`25-47`: the real end-to-end proof this item's own "reuse the mechanism,
 * don't invent a second one" instruction asks for - `TenancySwitcher.tsx`'s own `<select>` is gone,
 * replaced by a row per tenancy inside `ShellIdentity`'s own menu, but the thing that actually
 * happens when one is chosen (`PermissionsContext.switchTenancy`: persist, then reload) is
 * untouched. Follows the deleted `tenancySwitcher.test.tsx`'s own established harness exactly -
 * mount the real `PermissionsProvider` with `GET /api/v1/me/tenancies`/`GET /api/v1/operators/me`
 * faked, not a hand-built context value, so the path from the server's tenancy count to what the
 * header actually offers is what this test exercises, not an assumption about it.
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
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

const SITE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

/** The operator shell's header, the same reduced tree `permissionGating.test.tsx` renders - no
 * `OperatorConnectionProvider` (this file is not about the hub), matching how that file's own
 * `shellAt` omits it too. */
function shellAt(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path={path} element={<OperatorShell />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function trigger(container: HTMLElement): HTMLButtonElement {
  return one(container, ".ago-shell__identity .ago-user-menu__trigger");
}

async function openMenu(container: HTMLElement): Promise<void> {
  await interact(() => trigger(container).click());
}

function tenantSwitcherRows(container: HTMLElement): Element[] {
  return all(container, ".ago-user-menu__section .ago-user-menu__item");
}

/** jsdom's `Location.prototype.reload` is non-configurable, so `vi.spyOn(window.location, "reload")`
 * fails with "Cannot redefine property: reload" - the whole `window.location` object has to be
 * replaced with a configurable one instead, the common jsdom workaround. Restored in `afterEach`. */
const originalLocation = window.location;

function stubLocationReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });

  return reload;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_A });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
  localStorage.clear();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("the user menu's tenant switcher", () => {
  it("offers no switcher section at all for a single-tenant identity", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_A, siteName: "Acme Support" }] });

    const container = await render(shellAt("/"));
    await openMenu(container);

    expect(tenantSwitcherRows(container)).toHaveLength(0);
  });

  it("offers no switcher section while the tenancy list is still in flight", async () => {
    // "Not yet known" must not be treated as "more than one" any more than
    // `permissionGating.test.tsx`'s own equivalent case for permissions.
    tenanciesApi.fetchMyTenancies.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));
    await openMenu(container);

    expect(tenantSwitcherRows(container)).toHaveLength(0);
  });

  it("lists every other tenancy by name for a multi-tenant identity", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));
    await openMenu(container);

    // `SITE_A` is the identity's default active tenancy (nothing persisted yet) - only the *other*
    // one is offered to switch to, this item's own "one row per other tenant" wording.
    expect(tenantSwitcherRows(container).map((row) => row.textContent?.trim())).toEqual(["Widgets Inc"]);
  });

  it("persists the chosen tenancy and reloads the page when a different one is picked", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });
    const reload = stubLocationReload();

    const container = await render(shellAt("/"));
    await openMenu(container);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Widgets Inc")?.click());

    expect(localStorage.getItem(ACTIVE_SITE_STORAGE_KEY)).toBe(SITE_B);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reuses a previously persisted choice as the active tenancy the header names", async () => {
    localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, SITE_B);
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));
    await openMenu(container);

    expect(one(container, ".ago-user-menu__header-tenant").textContent).toBe("Widgets Inc");
    // The active tenancy is never offered as something to switch *to* - it is the one already
    // active, which is why it is excluded rather than appearing disabled.
    expect(tenantSwitcherRows(container).map((row) => row.textContent?.trim())).toEqual(["Acme Support"]);
  });
});
