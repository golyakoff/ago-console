import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { OwnerSitesPage } from "../owner/OwnerSitesPage.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-11`'s own Done-when, read as a DOM test rather than asserted from the config value alone -
 * `ago-widget`'s `locale.test.ts` set exactly this bar for the widget side of this same feature
 * (`11-10`), and this is its console-side twin. Follows `operatorShellUserMenu.test.tsx`'s/
 * `permissionGating.test.tsx`'s own established harness exactly: mock `config`, mock the three APIs
 * `PermissionsProvider` calls, mount the real `OperatorShell` inside `MemoryRouter` +
 * `PermissionsProvider`, read rendered text - never the config value in isolation.
 *
 * `25-47`: sign-out and the site-id fallback both moved behind the header's own avatar menu, so
 * both assertions below now open it first (`openIdentityMenu`) rather than reading the header row
 * directly.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: true,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn(), fetchOwnerSites: vi.fn() }));
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
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

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

/** `23-31`: the accordion's own section headers, in the rail's own order - see
 * `permissionGating.test.tsx`'s identical helper for the full reasoning (a section with no visible
 * items is never drawn, so this list *is* "which sections exist" for the signed-in identity). */
function sectionLabels(container: HTMLElement): string[] {
  return all(container, ".ago-shell__rail-section").map(
    (button) => button.querySelector(".ago-shell__nav-link-label")?.textContent?.trim() ?? "",
  );
}

/** `25-47`: sign-out and the site-id fallback both moved behind the avatar trigger's own dropdown -
 * opens it the same way a real click would, so the assertions below read what a reader actually
 * sees rather than markup that only exists once the menu is open. */
async function openIdentityMenu(container: HTMLElement): Promise<void> {
  await interact(() => one<HTMLButtonElement>(container, ".ago-shell__identity .ago-user-menu__trigger").click());
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Демо-магазин" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("the console shell for an active site with Locale = Ru", () => {
  beforeEach(() => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure"], siteId: SITE_ID, locale: "Ru", credentialsArePublished: true,
    });
  });

  it("renders the skip link, section labels and sign-out in Russian - and the brand, which never varies by locale", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-skip-link")?.textContent).toBe("Перейти к содержимому");
    // `23-31`: "AGO Офис" (`25-49`: was "Офис") is the header's whole brand text now, a literal like
    // "AGO" was before it - it does not come from `strings` and so does not vary between this test
    // and the English one below, which is exactly what this assertion is checking.
    expect(container.querySelector(".ago-shell__wordmark")?.textContent).toBe("AGO Офис");
    // `25-50`: Записи (was Календарь) moves to second place, ahead of Аналитика.
    expect(sectionLabels(container)).toEqual([
      "Диалоги",
      "Записи",
      "Аналитика",
      "Команда",
      "Каналы",
      "Автоматизация",
      "Администрирование",
    ]);
    await openIdentityMenu(container);
    expect(byText<HTMLButtonElement>(container, ".ago-user-menu__item", "Выйти")).not.toBeNull();
  });

  it("renders the public-demo notice in Russian", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-demo-notice__text")?.textContent).toContain(
      "Это публичная демо-консоль",
    );
  });

  it("renders the site-id fallback badge in Russian, for the pre-onboarding case with no named tenancy yet", async () => {
    // The identity's own tenancy list is empty (`13-07`'s "pre-onboarding" case,
    // `PermissionsProvider`'s own doc comment) - `beforeEach` above otherwise seeds a real, named
    // tenancy, which is the ordinary case and would show that name instead of this fallback.
    tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });

    const container = await render(shellAt("/"));
    await openIdentityMenu(container);

    expect(one(container, ".ago-user-menu__header-tenant").textContent).toBe(`сайт ${SITE_ID.slice(0, 8)}`);
  });
});

describe("the console shell for an active site with no Locale set", () => {
  beforeEach(() => {
    // Every existing tenant today: the response predates the `locale` field entirely, not merely
    // set to `"En"` - the real regression case, matching `ago-widget/locale.test.ts`'s own choice.
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID, credentialsArePublished: true });
  });

  it("renders unchanged, in English", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-skip-link")?.textContent).toBe("Skip to content");
    expect(container.querySelector(".ago-shell__wordmark")?.textContent).toBe("AGO Офис");
    // `25-50`: Bookings (was Calendar) moves to second place, ahead of Analytics.
    expect(sectionLabels(container)).toEqual([
      "Conversations",
      "Bookings",
      "Analytics",
      "Team",
      "Channels",
      "Automation",
      "Administration",
    ]);
    await openIdentityMenu(container);
    expect(byText<HTMLButtonElement>(container, ".ago-user-menu__item", "Sign out")).not.toBeNull();
    expect(container.querySelector(".ago-demo-notice__text")?.textContent).toContain("This is a public demo console");
  });
});

describe("pages with no active site", () => {
  it("OwnerSitesPage renders English even when this identity's own tenancy is Russian", async () => {
    // Same operator identity as the Russian-locale describe block above - real proof, not an
    // assumption, that /owner does not inherit a tenant's language just because this identity also
    // administers one (11-11's own settled design call: /owner is not scoped to any single tenant).
    operatorsApi.fetchMyPermissions.mockResolvedValue({
      permissions: ["site:configure"], siteId: SITE_ID, locale: "Ru",
    });
    ownerApi.fetchOwnerSites.mockResolvedValue({
      status: "ok", page: { sites: [], nextBefore: null, recentWindowDays: 30 },
    });

    const container = await render(
      <MemoryRouter initialEntries={["/owner"]}>
        <Signed>
          <PermissionsProvider>
            <Routes>
              <Route path="/owner" element={<OwnerSitesPage />} />
            </Routes>
          </PermissionsProvider>
        </Signed>
      </MemoryRouter>,
    );

    expect(sectionLabels(container)).toContain("Conversations");
    expect(sectionLabels(container)).not.toContain("Диалоги");
  });
});
