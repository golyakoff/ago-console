import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSiteDetailPage } from "./OwnerSiteDetailPage.js";
import type { OwnerSiteDetail, OwnerSiteModule } from "../api/ownerApi.js";
import { all, one, render, unmount } from "../testing/dom.js";

/**
 * `23-14`: the per-tenant detail read's own behaviour tests - mirrors `ownerSitesPage.test.tsx`'s
 * setup (same mocked modules, same `Signed` wrapper), since this page is mounted the identical way.
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
const ownerApi = vi.hoisted(() => ({ fetchOwnerSiteDetail: vi.fn() }));
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

function shellAt(siteId: string = SITE_ID) {
  return (
    <MemoryRouter initialEntries={[`/owner/sites/${siteId}`]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/sites/:siteId" element={<OwnerSiteDetailPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function oneModule(overrides: Partial<OwnerSiteModule> = {}): OwnerSiteModule {
  return {
    moduleKey: "calendar",
    triggerWords: ["book-a-table"],
    entryPoint: "https://module.example.com/entry",
    grantedByOwner: true,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

function detail(overrides: Partial<OwnerSiteDetail> = {}): OwnerSiteDetail {
  return {
    siteId: SITE_ID,
    name: "Demo Shop One",
    tier: "free",
    createdAt: "2026-01-01T00:00:00Z",
    seatCount: 2,
    conversationCount: 5,
    recentMessageCount: 10,
    lastMessageAt: "2026-08-27T00:00:00Z",
    attachmentBytes: 1024,
    recentWindowDays: 30,
    modules: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
});

afterEach(async () => {
  await unmount();
});

describe("the site detail page's own access states", () => {
  it("renders the tenant's own facts once granted", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Demo Shop One");
    expect(container.textContent).toContain("free");
    expect(container.textContent).toContain(SITE_ID);
  });

  it("shows a refusal, not a table, when the server refuses", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not authorized");
    expect(container.querySelector("table")).toBeNull();
  });

  /** `23-14`'s own Done-when: a genuine 404, distinguishable from a refusal - the platform owner may
   * legitimately name a site that does not exist. */
  it("shows a real not-found state for a site id that does not exist", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "not-found" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("No such site");
    expect(container.textContent).not.toContain("Not authorized");
  });
});

describe("the site detail page's own entitlements table", () => {
  it("shows a module the owner granted, with its expiry", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({
            moduleKey: "calendar",
            grantedByOwner: true,
            expiresAt: "2026-12-31T00:00:00Z",
            isActive: true,
          }),
        ],
      }),
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("calendar");
    expect(container.textContent).toContain("Platform owner");
    expect(container.textContent).toContain("Active");
  });

  /** A module the tenant enabled must read differently from one the owner granted - never the same
   * label (this item's own Done-when). */
  it("distinguishes a tenant-granted module from an owner-granted one", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", grantedByOwner: true }),
          oneModule({ moduleKey: "faq", grantedByOwner: false }),
        ],
      }),
    });

    const container = await render(shellAt());

    const badges = all(container, "table .ago-badge").map((b) => (b.textContent ?? "").trim());
    expect(badges).toContain("Platform owner");
    expect(badges).toContain("Tenant");
  });

  /** A grant with no expiry renders as an explicit statement, never a blank cell. */
  it("renders a module with no expiry as an explicit 'No end date'", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({ modules: [oneModule({ expiresAt: null })] }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("No end date");
  });

  /** The item's own most-emphasised Done-when: an expired grant is shown as expired, not omitted -
   * matching what the live read-store query already decided (`isActive: false`), never recomputed by
   * this page from `expiresAt` and the browser's own clock. */
  it("shows an expired grant as expired, not omitted from the list", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({
      status: "ok",
      site: detail({
        modules: [
          oneModule({ moduleKey: "calendar", expiresAt: "2020-01-01T00:00:00Z", isActive: false }),
        ],
      }),
    });

    const container = await render(shellAt());

    const row = one<HTMLTableRowElement>(container, "table tbody tr");
    expect(row.textContent).toContain("calendar");
    expect(row.textContent).toContain("Expired");
  });

  it("states in words what an expiry does and does not do", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail() });

    const container = await render(shellAt());

    expect(container.textContent).toMatch(/never told/i);
  });

  it("shows an empty-modules note rather than an empty table when the tenant holds none", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: detail({ modules: [] }) });

    const container = await render(shellAt());

    expect(container.textContent).toContain("no modules enabled");
    expect(container.querySelector("table")).toBeNull();
  });
});
