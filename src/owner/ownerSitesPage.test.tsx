import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSitesPage } from "./OwnerSitesPage.js";
import { all, render, unmount } from "../testing/dom.js";

/**
 * `4-06`(console): found live - a platform owner who also holds an operator seat lost the whole
 * console nav (Conversations, the site-scoped screens) the moment they opened "Platform sites",
 * because this page built its own single-item nav ("Back to the console") instead of the same list
 * `OperatorShell` builds. `consoleNav.ts`'s `buildTenantNavItems` is now shared between the two -
 * this file is the `OwnerSitesPage` half of proving it, mirroring `permissionGating.test.tsx`'s own
 * setup for `OperatorShell`.
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
const ownerApi = vi.hoisted(() => ({ fetchOwnerSites: vi.fn(), probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "owner-sub", preferred_username: "golyakoff" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function shellAt() {
  return (
    <MemoryRouter initialEntries={["/owner"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner" element={<OwnerSitesPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function navLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__nav a").map((link) => (link.textContent ?? "").trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  ownerApi.fetchOwnerSites.mockResolvedValue({
    status: "ok",
    page: { sites: [], nextBefore: null, recentWindowDays: 30 },
  });
});

afterEach(async () => {
  await unmount();
});

describe("the platform-sites page's own navigation", () => {
  it("offers the same console sections OperatorShell would, for an owner who also holds an operator seat", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Demo Shop One" }] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });

    const container = await render(shellAt());

    expect(navLabels(container)).toEqual([
      "Conversations",
      "All conversations",
      "Widget appearance",
      "Offline auto-reply",
      "Platform sites",
    ]);
  });

  it("offers only Platform sites for an owner with no operator seat at all", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    expect(navLabels(container)).toEqual(["Platform sites"]);
  });

  it("marks Platform sites as the active link, since this page is what it points at", async () => {
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });

    const container = await render(shellAt());

    const link = all(container, ".ago-shell__nav a").find((a) => (a.textContent ?? "").trim() === "Platform sites");
    expect(link?.classList.contains("ago-shell__nav-link--active")).toBe(true);
  });
});
