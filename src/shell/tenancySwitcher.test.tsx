import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { ACTIVE_SITE_STORAGE_KEY } from "../auth/activeSiteStorage.js";
import { OperatorShell } from "./OperatorShell.js";
import { all, interact, render, unmount } from "../testing/dom.js";

/**
 * `13-07`/`adr/0068`: the console half of the Done-when this item names explicitly - "the switcher
 * renders only when `GET` (the tenancy list) returns more than one entry... a single-tenant
 * operator's console renders with no switcher visible at all." Follows `permissionGating.test.tsx`'s
 * own established pattern exactly: the real `PermissionsProvider` mounted with
 * `GET /api/v1/me/tenancies`/`GET /api/v1/operators/me` faked, not a hand-made context value - the
 * path from the server's tenancy count to whether a `<select>` exists at all is what this item
 * actually shipped, and a fabricated context value would skip it.
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
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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

function switcherSelect(container: HTMLElement): HTMLSelectElement | null {
  return container.querySelector("select[aria-label='Active site']");
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

describe("the tenancy switcher", () => {
  it("does not render at all for a single-tenant identity", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_A, siteName: "Acme Support" }] });

    const container = await render(shellAt("/"));

    expect(switcherSelect(container)).toBeNull();
  });

  it("does not render while the tenancy list is still in flight", async () => {
    // "Not yet known" must not be treated as "more than one" any more than
    // `permissionGating.test.tsx`'s own equivalent case for permissions.
    tenanciesApi.fetchMyTenancies.mockReturnValue(new Promise(() => undefined));

    const container = await render(shellAt("/"));

    expect(switcherSelect(container)).toBeNull();
  });

  it("renders, listing every tenancy by name, for a multi-tenant identity", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));

    const select = switcherSelect(container);
    expect(select).not.toBeNull();
    const optionLabels = all(select, "option").map((option) => option.textContent);
    expect(optionLabels).toEqual(["Acme Support", "Widgets Inc"]);
  });

  it("defaults to the first tenancy in the order the server returned, when nothing is stored", async () => {
    // `ListMyTenanciesHandler` (`ago-chat`) already orders by name server-side - the console trusts
    // that order rather than re-sorting, so this fixture lists them exactly as a real response would.
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));

    expect(switcherSelect(container).value).toBe(SITE_A);
  });

  it("reuses a previously persisted choice, instead of defaulting to the first tenancy", async () => {
    localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, SITE_B);
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));

    expect(switcherSelect(container).value).toBe(SITE_B);
  });

  it("falls back to the first tenancy when the persisted choice no longer exists", async () => {
    // The identity's own list changed since the choice was stored (a site was removed, or this is a
    // stale value from a different browser profile) - never trusted blindly.
    localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, "cccccccc-cccc-cccc-cccc-cccccccccccc");
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });

    const container = await render(shellAt("/"));

    expect(switcherSelect(container).value).toBe(SITE_A);
  });

  /**
   * `13-07`'s own Done-when: "picking a different tenancy changes the active `Site` for every screen
   * that reads it... without a fresh login." `PermissionsProvider`'s own doc comment states the
   * chosen mechanism is a full page reload, not a React-level remount - proven here by asserting the
   * two real, observable effects of that choice: the new choice is persisted (so the reload actually
   * picks it back up), and `window.location.reload` is genuinely invoked (not a state update that
   * merely re-renders in place).
   */
  it("persists the chosen tenancy and reloads the page when a different one is picked", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });
    const reload = stubLocationReload();

    const container = await render(shellAt("/"));
    const select = switcherSelect(container);
    expect(select.value).toBe(SITE_A);

    await interact(() => {
      select.value = SITE_B;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(localStorage.getItem(ACTIVE_SITE_STORAGE_KEY)).toBe(SITE_B);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not re-fire the switch when the already-selected tenancy is chosen again", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({
      tenancies: [
        { siteId: SITE_A, siteName: "Acme Support" },
        { siteId: SITE_B, siteName: "Widgets Inc" },
      ],
    });
    const reload = stubLocationReload();

    const container = await render(shellAt("/"));
    const select = switcherSelect(container);

    await interact(() => {
      select.value = SITE_A;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(reload).not.toHaveBeenCalled();
  });
});
