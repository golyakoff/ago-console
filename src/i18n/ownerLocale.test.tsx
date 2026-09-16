import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerSitesPage } from "../owner/OwnerSitesPage.js";
import { OwnerSiteDetailPage } from "../owner/OwnerSiteDetailPage.js";
import { OwnerPricingPage } from "../owner/OwnerPricingPage.js";
import { OwnerSuspensionsPage } from "../owner/OwnerSuspensionsPage.js";
import { OwnerTenantIsolationPage } from "../owner/OwnerTenantIsolationPage.js";
import type { OwnerSiteDetail, OwnerPricing } from "../api/ownerApi.js";
import { OwnerStringsProvider } from "./OwnerStringsProvider.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `25-89`'s own literal Done-when: "the owner panel's own routes are wrapped in their own explicit
 * Russian `StringsProvider`, not relying on `StringsContext`'s own bare default or on `25-88`'s own
 * `resolve.ts` change (neither reaches these routes) - proven by rendering an owner page with no
 * other locale signal available and seeing Russian." This is that proof, for all five owner pages -
 * the identical shape `preSessionLocale.test.tsx` already established for `23-28`'s four pre-session
 * routes, applied here to `OwnerStringsProvider` instead of `PreSessionStringsProvider`.
 *
 * Each page here is mounted exactly as `App.tsx` mounts it - wrapped in `OwnerStringsProvider`,
 * nothing more, no `PermissionsProvider`-supplied tenant and no site whose own `resolve.ts` reading
 * could supply a locale either - so a regression that moved the wrapping out of `App.tsx` itself
 * (not just out of `StringsContext.tsx`) would show up here too. The five pages' own bare-mount unit
 * tests (`ownerSitesPage.test.tsx` and its four siblings) are deliberately left asserting English
 * unchanged - they mount each page directly, with no provider at all, which is the component-level-
 * isolation case `StringsContext.tsx`'s own doc comment names as the bare default's other remaining
 * caller; this file is the proof for the *route*, not the component in isolation.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    calendarApiBaseUrl: "https://calendar-api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({
  fetchOwnerSites: vi.fn(),
  fetchOwnerSiteDetail: vi.fn(),
  fetchOwnerPricing: vi.fn(),
  fetchOwnerSuspensions: vi.fn(),
  fetchOwnerTenantIsolationSummary: vi.fn(),
}));
const calendarApi = vi.hoisted(() => ({ fetchOwnerTenantScopeSummary: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/calendarApi.js", () => calendarApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "owner-sub", preferred_username: "golyakoff" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false,
 isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function emptySiteDetail(): OwnerSiteDetail {
  return {
    siteId: SITE_ID,
    name: "Демо-магазин",
    tier: "free",
    createdAt: "2026-01-01T00:00:00Z",
    seatCount: 2,
    conversationCount: 5,
    recentMessageCount: 10,
    lastMessageAt: "2026-08-27T00:00:00Z",
    attachmentBytes: 1024,
    recentWindowDays: 30,
    modules: [],
    allowedOrigins: [],
    operators: [],
    suspendedUntil: null,
    roles: [],
    allKnownPermissions: [],
    channelQuantity: null,
  };
}

function emptyPricing(): OwnerPricing {
  return {
    seatPricing: {
      pricePerSeatRub: 500,
      baseSeats: 2,
      baseSeatPriceRub: 1000,
      pricePerExtraSeatRub: 300,
      billingPeriodDays: 30,
      freeSeatsIncluded: 1,
      tiers: [{ key: "starter", minSeats: 1, maxSeats: 2 }],
    },
    billingOptions: [],
    pricedResources: [],
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

describe("the owner panel, wrapped exactly as App.tsx wraps it (25-89)", () => {
  it("/owner renders Russian with no tenant to read a locale from", async () => {
    ownerApi.fetchOwnerSites.mockResolvedValue({
      status: "ok",
      page: { sites: [], nextBefore: null, recentWindowDays: 30, matchingSites: 0, totalSites: 0 },
    });

    const container = await render(
      <MemoryRouter initialEntries={["/owner"]}>
        <OwnerStringsProvider>
          <Signed>
            <PermissionsProvider>
              <Routes>
                <Route path="/owner" element={<OwnerSitesPage />} />
              </Routes>
            </PermissionsProvider>
          </Signed>
        </OwnerStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Сайты платформы");
    expect(container.textContent).toContain("Пока нет ни одного сайта.");
    expect(container.textContent).not.toContain("Platform sites");
    expect(container.textContent).not.toContain("No sites yet.");
  });

  it("/owner/sites/:siteId renders Russian with no tenant to read a locale from", async () => {
    ownerApi.fetchOwnerSiteDetail.mockResolvedValue({ status: "ok", site: emptySiteDetail() });

    const container = await render(
      <MemoryRouter initialEntries={[`/owner/sites/${SITE_ID}`]}>
        <OwnerStringsProvider>
          <Signed>
            <PermissionsProvider>
              <Routes>
                <Route path="/owner/sites/:siteId" element={<OwnerSiteDetailPage />} />
              </Routes>
            </PermissionsProvider>
          </Signed>
        </OwnerStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Разрешённые источники");
    expect(container.textContent).toContain("Операторы");
    expect(container.textContent).not.toContain("Allowed origins");
    expect(container.textContent).not.toContain("Operators");
  });

  it("/owner/pricing renders Russian with no tenant to read a locale from", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({ status: "ok", pricing: emptyPricing() });

    const container = await render(
      <MemoryRouter initialEntries={["/owner/pricing"]}>
        <OwnerStringsProvider>
          <Signed>
            <PermissionsProvider>
              <Routes>
                <Route path="/owner/pricing" element={<OwnerPricingPage />} />
              </Routes>
            </PermissionsProvider>
          </Signed>
        </OwnerStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Прайс-лист");
    expect(container.textContent).toContain("Другие опции биллинга");
    expect(container.textContent).not.toContain("Price list");
    expect(container.textContent).not.toContain("Other billing options");
  });

  it("/owner/suspensions renders Russian with no tenant to read a locale from", async () => {
    ownerApi.fetchOwnerSuspensions.mockResolvedValue({ status: "ok", suspensions: [] });

    const container = await render(
      <MemoryRouter initialEntries={["/owner/suspensions"]}>
        <OwnerStringsProvider>
          <Signed>
            <PermissionsProvider>
              <Routes>
                <Route path="/owner/suspensions" element={<OwnerSuspensionsPage />} />
              </Routes>
            </PermissionsProvider>
          </Signed>
        </OwnerStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Заблокированные аккаунты");
    expect(container.textContent).toContain("Сейчас нет заблокированных аккаунтов.");
    expect(container.textContent).not.toContain("Suspended accounts");
    expect(container.textContent).not.toContain("No accounts are currently suspended.");
  });

  it("/owner/tenant-isolation renders Russian with no tenant to read a locale from", async () => {
    // Refused on both backends - the simplest granted-nothing fixture, and still real page content
    // (the refusal `Alert`) to assert Russian against, the same "the reader who is refused still
    // reads a real Russian sentence" shape every other owner page's own refused branch already
    // proves in `ownerLocale.test.tsx`'s siblings above.
    ownerApi.fetchOwnerTenantIsolationSummary.mockResolvedValue({ status: "not-authorized" });
    calendarApi.fetchOwnerTenantScopeSummary.mockResolvedValue({ status: "not-authorized" });

    const container = await render(
      <MemoryRouter initialEntries={["/owner/tenant-isolation"]}>
        <OwnerStringsProvider>
          <Signed>
            <PermissionsProvider>
              <Routes>
                <Route path="/owner/tenant-isolation" element={<OwnerTenantIsolationPage />} />
              </Routes>
            </PermissionsProvider>
          </Signed>
        </OwnerStringsProvider>
      </MemoryRouter>,
    );

    expect(container.textContent).toContain("Изоляция арендаторов");
    expect(container.textContent).toContain("Ни один из бэкендов не подтвердил права владельца платформы");
    expect(container.textContent).not.toContain("Tenant isolation");
    expect(container.textContent).not.toContain("Neither backend answered as the platform owner");
  });
});
