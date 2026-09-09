import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerPricingPage } from "./OwnerPricingPage.js";
import type { OwnerPricing } from "../api/ownerApi.js";
import { one, render, unmount } from "../testing/dom.js";

/**
 * `25-20`: the price-list page's own behaviour tests - mirrors `ownerSitesPage.test.tsx`'s setup
 * (the identical mocked modules, the identical `Signed` wrapper), since this page is mounted the
 * identical way and gated the identical way.
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
const ownerApi = vi.hoisted(() => ({ fetchOwnerPricing: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);

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

function shellAt() {
  return (
    <MemoryRouter initialEntries={["/owner/pricing"]}>
      <Signed>
        <PermissionsProvider>
          <Routes>
            <Route path="/owner/pricing" element={<OwnerPricingPage />} />
          </Routes>
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

const REAL_PRICING: OwnerPricing = {
  seatPricing: {
    pricePerSeatRub: 590,
    billingPeriodDays: 30,
    freeSeatsIncluded: 2,
    tiers: [
      { key: "starter", minSeats: 3, maxSeats: 9 },
      { key: "growth", minSeats: 10, maxSeats: 100 },
    ],
  },
  billingOptions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: null });
  ownerApi.fetchOwnerPricing.mockResolvedValue({ status: "ok", pricing: REAL_PRICING });
});

afterEach(async () => {
  await unmount();
});

describe("the price-list page's own read", () => {
  it("shows the real per-seat price, free-seat allowance and both tier bands", async () => {
    const container = await render(shellAt());

    expect(container.textContent).toContain("₽590.00");
    expect(container.textContent).toContain("2 seats included");
    expect(container.textContent).toContain("Starter");
    expect(container.textContent).toContain("3–9");
    expect(container.textContent).toContain("Growth");
    expect(container.textContent).toContain("10–100");
    expect(container.textContent).toContain("30 days");
  });

  // `25-20`'s own honest finding, proven at the UI level too: an empty `billingOptions` list renders
  // as a stated "not configured" note, never as a blank panel that could be mistaken for a loading
  // state or a bug.
  it("states plainly that no billing options are configured, rather than showing an empty table", async () => {
    const container = await render(shellAt());

    expect(container.textContent).toContain("No billing options are configured on this deployment");
    expect(container.querySelectorAll("table")).toHaveLength(1); // only the seat-pricing table - no empty second table
  });

  it("renders a configured billing option's price as 'Not configured' when the server sends null", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        billingOptions: [{ optionKey: "whatsapp-entitlement", moduleKey: null, priceRub: null }],
      },
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("whatsapp-entitlement");
    expect(container.textContent).toContain("Not configured");
  });

  it("shows the server's own refusal, and names no role", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({ status: "not-authorized" });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not authorized");
    expect(container.textContent).not.toContain("platform owner");
    expect(container.textContent).not.toContain("₽590");
  });

  it("marks Platform sites, not a second entry, as the pinned link while here", async () => {
    const container = await render(shellAt());

    const pinned = one<HTMLAnchorElement>(container, ".ago-shell__rail-link--pinned");
    expect(pinned.textContent?.trim()).toBe("Platform sites");
    expect(pinned.getAttribute("href")).toBe("/owner");
  });
});
