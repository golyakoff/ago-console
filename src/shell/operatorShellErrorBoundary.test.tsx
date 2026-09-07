import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { User } from "oidc-client-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OperatorShell } from "./OperatorShell.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-41`. `appShellErrorBoundary.test.tsx` proves the mechanism catches a throw and keeps the nav
 * usable; this file proves the specific reason `OperatorShell` needs its *own* mount point rather
 * than relying on `AppShell`'s alone (`RenderErrorBoundary.tsx`'s own doc comment has the "why"):
 * `OperatorShell`/`AppShell` are mounted once for the whole signed-in session, and only what
 * `<Outlet />` resolves to changes underneath them as the operator navigates - so a boundary with no
 * reset tied to the route would keep showing a tripped fallback for a screen that has since
 * navigated away to one that works. This asserts the fix: navigating to a different, working screen
 * after a throw clears the fallback rather than leaving it stuck.
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

/** Throws on purpose - stands in for `CalendarElsewhereNotice`'s own crash, same as the other two
 * `23-41` test files use. */
function Bomb(): never {
  throw new Error("Bomb: thrown on purpose by a test");
}

/** Two routes under one `OperatorShell`, matching `App.tsx`'s own shape exactly: the queue (`/`)
 * throws, and "Все диалоги" (`/conversations/all`, `site:configure`-gated, same as the real route)
 * renders an ordinary, working screen. */
function twoRoutesShell() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route element={<OperatorShell />}>
              <Route path="/" element={<Bomb />} />
              <Route path="/conversations/all" element={<p data-testid="other-screen">a working screen</p>} />
            </Route>
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Демо-магазин" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({
    permissions: ["site:configure"],
    siteId: SITE_ID,
    locale: "Ru",
    credentialsArePublished: false,
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("the render-error boundary around OperatorShell's own <Outlet />", () => {
  it("shows the fallback for the screen that threw, without losing the nav", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(twoRoutesShell());

    expect(container.querySelector(".ago-alert--danger")).not.toBeNull();
    expect(byText(container, ".ago-shell__nav-link-label", "Все диалоги")).not.toBeNull();
  });

  it("clears once the operator navigates to a screen that works - it does not stay stuck on the old failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const container = await render(twoRoutesShell());
    expect(container.querySelector(".ago-alert--danger")).not.toBeNull();

    const allConversationsLink = byText<HTMLAnchorElement>(container, ".ago-shell__rail a", "Все диалоги");
    if (allConversationsLink === null) {
      throw new Error('no "Все диалоги" nav link found in the rail');
    }

    await interact(() => {
      allConversationsLink.click();
    });

    // The working screen actually rendered - not the stale fallback from the route just left.
    expect(container.querySelector('[data-testid="other-screen"]')?.textContent).toBe("a working screen");
    expect(container.querySelector(".ago-alert--danger")).toBeNull();
  });
});
