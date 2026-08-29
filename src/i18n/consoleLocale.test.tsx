import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { OwnerSitesPage } from "../owner/OwnerSitesPage.js";
import { all, render, unmount } from "../testing/dom.js";

/**
 * `11-11`'s own Done-when, read as a DOM test rather than asserted from the config value alone -
 * `ago-widget`'s `locale.test.ts` set exactly this bar for the widget side of this same feature
 * (`11-10`), and this is its console-side twin. Follows `tenancySwitcher.test.tsx`'s/
 * `permissionGating.test.tsx`'s own established harness exactly: mock `config`, mock the three APIs
 * `PermissionsProvider` calls, mount the real `OperatorShell` inside `MemoryRouter` +
 * `PermissionsProvider`, read rendered text - never the config value in isolation.
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
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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
      permissions: ["site:configure"], siteId: SITE_ID, locale: "Ru",
    });
  });

  it("renders the skip link, brand tagline, nav labels and sign-out in Russian", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-skip-link")?.textContent).toBe("Перейти к содержимому");
    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Консоль оператора");
    const navLabels = all(container, ".ago-shell__nav a").map((a) => a.textContent?.trim());
    expect(navLabels).toEqual(["Диалоги", "Все диалоги", "Поиск", "Внешний вид виджета", "Автоответ офлайн", "Оплата"]);
    expect(container.querySelector(".ago-shell__identity button")?.textContent).toBe("Выйти");
  });

  it("renders the public-demo notice in Russian", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-demo-notice__text")?.textContent).toContain(
      "Это публичная демо-консоль",
    );
  });

  it("renders the site-id badge in Russian", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-shell__operator-site")?.textContent).toBe(`сайт ${SITE_ID.slice(0, 8)}`);
  });
});

describe("the console shell for an active site with no Locale set", () => {
  beforeEach(() => {
    // Every existing tenant today: the response predates the `locale` field entirely, not merely
    // set to `"En"` - the real regression case, matching `ago-widget/locale.test.ts`'s own choice.
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  });

  it("renders unchanged, in English", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-skip-link")?.textContent).toBe("Skip to content");
    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Operator console");
    const navLabels = all(container, ".ago-shell__nav a").map((a) => a.textContent?.trim());
    expect(navLabels).toEqual([
      "Conversations",
      "All conversations",
      "Search",
      "Widget appearance",
      "Offline auto-reply",
      "Billing",
    ]);
    expect(container.querySelector(".ago-shell__identity button")?.textContent).toBe("Sign out");
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

    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Platform owner console");
    const navLabels = all(container, ".ago-shell__nav a").map((a) => a.textContent?.trim());
    expect(navLabels).toContain("Conversations");
    expect(navLabels).not.toContain("Диалоги");
  });
});

/** Found live, 2026-08-27: the header subtitle should name which tab is open, not who is signed in -
 * even the platform owner, on their own operator seat, reads "operator console" on the messaging tab
 * and "client console" on any tenant-management one, the same text an ordinary operator sees there.
 * `/owner` itself is covered by the "renders English" test above (`consoleTaglineOwner`). */
describe("the console header's role tagline", () => {
  beforeEach(() => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  });

  it("reads 'Operator console' on the messaging tab", async () => {
    const container = await render(shellAt("/"));

    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Operator console");
  });

  it("reads 'Client console' on the site-wide conversations tab", async () => {
    const container = await render(shellAt("/admin"));

    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Client console");
  });

  it("reads 'Client console' on the widget-appearance settings tab", async () => {
    const container = await render(shellAt("/settings/widget"));

    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Client console");
  });

  it("reads 'Client console' on the offline-auto-reply settings tab", async () => {
    const container = await render(shellAt("/settings/auto-reply"));

    expect(container.querySelector(".ago-shell__product")?.textContent).toBe("Client console");
  });
});
