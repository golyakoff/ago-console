import { useMemo, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { OwnerPricingPage } from "./OwnerPricingPage.js";
import type { OwnerPricing } from "../api/ownerApi.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

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
const ownerApi = vi.hoisted(() => ({ fetchOwnerPricing: vi.fn(), publishPriceVersion: vi.fn() }));
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
  // `25-43`: empty by default - the read-only suites below never touch this section, and adding it
  // here (rather than only in the "priced resources" suite's own fixtures) is what proves this new,
  // required field does not disturb any of `25-20`'s own pre-existing assertions.
  pricedResources: [],
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

/**
 * `25-43`: the one write this screen has ever had - publishing a new version for an already-
 * registered price key. Mirrors `DocumentsPage.test.tsx`'s own "publishing a new version" suite
 * (`setTextValue`/`interact`/`form button[type='submit']`), the identical publish/refresh shape.
 */
describe("priced resources", () => {
  function amountField(container: HTMLElement): HTMLInputElement {
    const field = one<HTMLInputElement>(container, "input[type='number']");
    return field;
  }

  function setTextValue(element: HTMLInputElement, value: string): void {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("states plainly that an unpublished key is not yet for sale, rather than showing a zero price", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        pricedResources: [{ key: "seat-base", label: "Business tier - base price", currentVersion: null, currentAmountRub: null }],
      },
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("Not yet for sale");
    // No toggle to hide behind for a key with nothing published yet - the form is the only thing
    // there is to show, the identical `formVisible` rule `ConsentDocumentPanel` uses for its own
    // `current === null` case.
    expect(container.querySelector("input[type='number']")).not.toBeNull();
  });

  it("shows a published key's own current version and amount, with the form closed behind a toggle", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        pricedResources: [{ key: "seat-base", label: "Business tier - base price", currentVersion: "v3", currentAmountRub: 490 }],
      },
    });

    const container = await render(shellAt());

    expect(container.textContent).toContain("₽490.00 (v3)");
    expect(container.querySelector("input[type='number']")).toBeNull();
    expect(container.textContent).toContain("Publish a new price");
  });

  it("publishes a new version for the key and reloads the price list", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        pricedResources: [{ key: "seat-base", label: "Business tier - base price", currentVersion: "v3", currentAmountRub: 490 }],
      },
    });
    ownerApi.publishPriceVersion.mockResolvedValue({
      status: "ok",
      version: "v4",
      sequence: 4,
      amountRub: 555,
      publishedAt: "2026-09-10T00:00:00Z",
    });
    const container = await render(shellAt());
    expect(ownerApi.fetchOwnerPricing).toHaveBeenCalledTimes(1);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Publish a new price")?.click());
    await interact(() => setTextValue(amountField(container), "555"));
    await interact(() => one<HTMLButtonElement>(container, "form button[type='submit']").click());

    expect(ownerApi.publishPriceVersion).toHaveBeenCalledWith("token", "seat-base", 555);
    expect(container.textContent).toContain("The new price was published.");
    expect(ownerApi.fetchOwnerPricing).toHaveBeenCalledTimes(2);
  });

  it("rejects a negative amount before ever calling publish", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        pricedResources: [{ key: "seat-base", label: "Business tier - base price", currentVersion: null, currentAmountRub: null }],
      },
    });
    const container = await render(shellAt());

    await interact(() => setTextValue(amountField(container), "-5"));
    // Dispatched directly on the form, not via `submitButton.click()`: the input's own `min={0}`
    // gives every real browser a second, native line of defence that blocks the click-triggered
    // implicit submission before this component's own JS ever runs (jsdom enforces the identical
    // HTML5 constraint-validation rule) - proven live while writing this test, the exact reason this
    // is a defence-in-depth test for the handler's own validation branch, not a redundant one.
    const formEl = container.querySelector("form");
    await interact(() => formEl?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(container.textContent).toContain("Enter a Rouble amount of zero or more.");
    expect(ownerApi.publishPriceVersion).not.toHaveBeenCalled();
  });

  it("shows the server's own refusal message when the key is not registered", async () => {
    ownerApi.fetchOwnerPricing.mockResolvedValue({
      status: "ok",
      pricing: {
        ...REAL_PRICING,
        pricedResources: [{ key: "seat-base", label: "Business tier - base price", currentVersion: null, currentAmountRub: null }],
      },
    });
    ownerApi.publishPriceVersion.mockResolvedValue({ status: "invalid", message: "This price key does not exist." });
    const container = await render(shellAt());

    await interact(() => setTextValue(amountField(container), "100"));
    await interact(() => one<HTMLButtonElement>(container, "form button[type='submit']").click());

    expect(container.textContent).toContain("This price key does not exist.");
  });
});
