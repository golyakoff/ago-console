import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { BillingPage, BILLING_PERMISSION } from "./BillingPage.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";
import type { BillingSeatPricingDto, BillingStatusDto, BillingSubscriptionSummaryDto } from "../api/billingApi.js";

/**
 * `26-300`: the v2 rebuild of `26-294`'s three-card `/settings/billing` page, onto the `26-299`
 * backend. Modeled on the previous `BillingPage.test.tsx` for the permission-gated-page shape and the
 * honest pending-then-confirmed poll (both unchanged by this item) - everything else is new, because
 * the cards themselves changed shape: Card A ("Buy now") is now always an instant, previewed purchase
 * against an already-`Succeeded` subscription; Card B ("Next period") is now an editable composition
 * (`setNextPeriodComposition`) that doubles as the Solo -> Business checkout entry point while no
 * usable subscription exists yet.
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
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const billingApi = vi.hoisted(() => ({
  fetchBillingStatus: vi.fn(),
  createCheckoutSession: vi.fn(),
  changeSubscriptionSeats: vi.fn(),
  cancelSubscription: vi.fn(),
  purchaseAdministratorSlot: vi.fn(),
  purchaseChannelAddOn: vi.fn(),
  setNextPeriodComposition: vi.fn(),
  previewBillingPurchase: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/billingApi.js", async () => {
  // `ApiProblemError`-throwing failure paths construct the real class from `problemDetails.js`
  // (unmocked) - the same "only replace the network call" shape `AccountDeletionPage.test.tsx`
  // already uses for `sitesApi.js`.
  const actual = await vi.importActual<typeof import("../api/billingApi.js")>("../api/billingApi.js");
  return { ...actual, ...billingApi };
});

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

/** Wrapped in a `MemoryRouter` for the same reason `AccountDeletionPage.test.tsx`'s `page` is - the
 * permission-refusal branch renders a `<Link to="/">`, which throws outside a router context. */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <BillingPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function seatPricing(overrides: Partial<BillingSeatPricingDto> = {}): BillingSeatPricingDto {
  return {
    minSeats: 2,
    maxSeats: 5,
    baseSeats: 3,
    freeSeatsIncluded: 2,
    baseSeatPriceRub: 490,
    pricePerExtraSeatRub: 200,
    billingPeriodDays: 30,
    ...overrides,
  };
}

/** A Solo site: free, never checked out. */
function freeStatus(overrides: Partial<BillingStatusDto> = {}): BillingStatusDto {
  return {
    tier: "free",
    seatLimit: 2,
    seatsUsed: 1,
    latestSubscription: null,
    tierDisplayName: "Solo",
    adminLimit: 1,
    adminsUsed: 1,
    extraAdministratorsPurchased: 0,
    seatPricing: seatPricing(),
    adminExtraPriceRub: null,
    channelCount: 0,
    channelAddOnPriceRub: 100,
    nextChargeRub: null,
    hasStoredPaymentMethod: false,
    connectedChannels: [],
    ...overrides,
  };
}

function subscription(overrides: Partial<BillingSubscriptionSummaryDto> = {}): BillingSubscriptionSummaryDto {
  return {
    subscriptionId: "sub-1",
    status: "Succeeded",
    requestedSeats: 3,
    tier: "starter",
    cancelRequested: false,
    currentPeriodEnd: "2026-09-28T12:00:00Z",
    pendingSeatCount: null,
    pendingTier: null,
    pendingAdminCount: null,
    ...overrides,
  };
}

/** A Business site, already `Succeeded`, with a stored payment method and a room-left composition. */
function businessStatus(overrides: Partial<BillingStatusDto> = {}): BillingStatusDto {
  return {
    ...freeStatus(),
    tier: "starter",
    tierDisplayName: "Business",
    seatLimit: 3,
    seatsUsed: 3,
    adminLimit: 2,
    adminsUsed: 2,
    latestSubscription: subscription(),
    hasStoredPaymentMethod: true,
    nextChargeRub: 490,
    adminExtraPriceRub: 500,
    ...overrides,
  };
}

/** jsdom's `Location` is largely non-configurable in place - the same workaround
 * `shell/tenancySwitcher.test.tsx` already uses for its own `window.location.reload` spy, applied
 * here to observe the redirect the checkout submit performs via `window.location.href`. */
const originalLocation = window.location;

function stubLocationHref(): { href: string } {
  const stub = { ...originalLocation, href: "" };
  Object.defineProperty(window, "location", { configurable: true, value: stub });
  return stub;
}

/** React tracks the DOM value it last wrote, so assigning `.value` directly on a `<select>` and
 * dispatching a plain `change` is enough to make it real - unlike a text `<input>`, a `<select>` has
 * no native setter React wraps, so no prototype-descriptor workaround is needed here
 * (`WidgetConfigPage.test.tsx`'s own `localeSelect` interaction is the identical shape). */
function selectValue(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** `element.click()` rather than a hand-built event: jsdom's real click implementation both toggles
 * `.checked` and fires the native `click` React's checkbox `onChange` actually listens for -
 * `CalendarServicesPage.test.tsx`'s own `clickCheckbox` precedent. */
function clickCheckbox(element: HTMLInputElement): void {
  element.click();
}

/** The two seat blocks (and the two panel-scoped buy rows) are told apart by their own DOM node, so
 * an assertion about one cannot be satisfied by text in the other. */
function panelTitled(container: HTMLElement, title: string): HTMLElement {
  const headings = Array.from(container.querySelectorAll(".ago-panel__title"));
  for (const heading of headings) {
    if (heading.textContent?.trim() === title) {
      const panel = heading.closest(".ago-panel");
      if (panel instanceof HTMLElement) {
        return panel;
      }
    }
  }

  throw new Error(`no panel titled "${title}" rendered`);
}

function buyRow(scope: HTMLElement, name: string): HTMLElement {
  const nameEl = byText<HTMLElement>(scope, ".ago-billing-buy-row__name", name);
  if (nameEl === null) {
    throw new Error(`no buy row named "${name}"`);
  }
  const row = nameEl.closest(".ago-billing-buy-row");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`buy row "${name}" is not inside .ago-billing-buy-row`);
  }
  return row;
}

function checkboxLabeled(scope: HTMLElement, text: string): HTMLInputElement {
  const span = byText<HTMLElement>(scope, "label.ago-row span", text);
  if (span === null) {
    throw new Error(`no checkbox labeled "${text}"`);
  }
  const label = span.closest("label");
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input === null || input === undefined) {
    throw new Error(`checkbox labeled "${text}" not found`);
  }
  return input;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [BILLING_PERMISSION], siteId: SITE_ID });
  billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());
  billingApi.previewBillingPurchase.mockResolvedValue({ chargedNowRub: 66.67, thenRecurringRub: 200, includedUntil: "2026-09-28T12:00:00Z" });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("who is offered the screen", () => {
  it("refuses an operator without site:configure, and never calls fetchBillingStatus - no billing data leaked", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to view this site's billing.");
    expect(billingApi.fetchBillingStatus).not.toHaveBeenCalled();
  });

  it("offers it to an operator holding site:configure, and shows the real tier/seats", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus());

    const container = await render(page());

    expect(container.textContent).toContain("Business");
    expect(container.textContent).toContain("3 / 3");
  });
});

describe("Card C - current plan", () => {
  it("shows the included-up-to allowance for both Operator and Administrator seats", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus());

    const container = await render(page());
    const panel = panelTitled(container, "Current plan");

    expect(panel.textContent).toContain("included up to 3");
    expect(panel.textContent).toContain("included up to 2");
  });

  it("lists a connected channel alongside the always-included website", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({
        connectedChannels: [{ kind: "Telegram", subscriptionId: "opt-1", cancelRequested: false, currentPeriodEnd: "2026-09-28T12:00:00Z" }],
      }),
    );

    const container = await render(page());
    const panel = panelTitled(container, "Current plan");

    expect(panel.textContent).toContain("Website + Telegram");
  });

  it("shows the payment method as an honest saved/not-saved fact - never a fabricated card number", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ hasStoredPaymentMethod: true }));

    const container = await render(page());
    const panel = panelTitled(container, "Current plan");

    expect(panel.textContent).toContain("Card on file");
  });

  it("shows a pending next-period change through a persistent note", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ latestSubscription: subscription({ pendingSeatCount: 4, pendingAdminCount: 1, pendingTier: "starter" }) }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Change scheduled");
  });
});

describe("Card A - buy now", () => {
  it("explains that one-off purchases need Business, on a Solo site", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());
    const panel = panelTitled(container, "Buy now");

    expect(panel.textContent).toContain("One-off purchases open once you are on Business");
    expect(panel.querySelector("select")).toBeNull();
  });

  it("explains that instant purchases need a saved payment method, on a Succeeded site without one", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ hasStoredPaymentMethod: false }));

    const container = await render(page());
    const panel = panelTitled(container, "Buy now");

    expect(panel.textContent).toContain("Instant purchases need a saved payment method");
  });

  it("withholds buy-now while a recurring charge is retrying (PastDue)", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ latestSubscription: subscription({ status: "PastDue" }) }));

    const container = await render(page());
    const panel = panelTitled(container, "Buy now");

    expect(panel.textContent).toContain("One-off purchases open once you are on Business");
  });

  it("previews the operator buy row's price for the selected quantity, and buys it for the previewed amount", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce(businessStatus()).mockResolvedValue(businessStatus({ seatLimit: 4, seatsUsed: 4 }));
    billingApi.changeSubscriptionSeats.mockResolvedValue({ proratedAmountRub: 66.67, newTier: "starter", newSeatCount: 4 });

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Operators");

    // Default quantity is 1 -> seatLimit(3) + 1 = 4.
    expect(billingApi.previewBillingPurchase).toHaveBeenCalledWith("token", SITE_ID, "sub-1", { kind: "Seats", requestedSeats: 4 });
    const button = byText<HTMLButtonElement>(row, "button", "Buy for ₽66.67");
    if (button === null) {
      throw new Error("no priced buy button rendered");
    }

    await interact(() => button.click());

    expect(billingApi.changeSubscriptionSeats).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 4);
    expect(row.textContent).toContain("66.67");
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
  });

  it("offers no control on the Operator row once the site already holds the largest purchasable seat count", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 5, seatsUsed: 5 }));

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Operators");

    expect(row.textContent).toContain("You already hold the largest seat count sold without a conversation.");
    expect(row.querySelector("select")).toBeNull();
  });

  it("buys extra Administrators for the previewed amount", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus({ adminExtraPriceRub: 500 }))
      .mockResolvedValue(businessStatus({ adminExtraPriceRub: 500, extraAdministratorsPurchased: 1 }));
    billingApi.purchaseAdministratorSlot.mockResolvedValue({ proratedAmountRub: 66.67, newExtraAdministratorCount: 1 });

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Administrators");
    const button = byText<HTMLButtonElement>(row, "button", "Buy for ₽66.67");
    if (button === null) {
      throw new Error("no priced buy button rendered");
    }

    await interact(() => button.click());

    expect(billingApi.purchaseAdministratorSlot).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 1);
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
  });

  it("offers no control on the Administrator row while its price is unpublished", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ adminExtraPriceRub: null }));

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Administrators");

    expect(row.textContent).toContain("not on sale yet");
    expect(row.querySelector("select")).toBeNull();
  });

  it("connects a not-yet-purchased channel for the previewed amount", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce(businessStatus()).mockResolvedValue(
      businessStatus({
        connectedChannels: [{ kind: "Telegram", subscriptionId: "opt-1", cancelRequested: false, currentPeriodEnd: "2026-09-28T12:00:00Z" }],
      }),
    );
    billingApi.purchaseChannelAddOn.mockResolvedValue({ proratedAmountRub: 66.67, optionSubscriptionId: "opt-1" });

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Telegram");
    const button = byText<HTMLButtonElement>(row, "button", "Connect for ₽66.67");
    if (button === null) {
      throw new Error("no connect button rendered");
    }

    await interact(() => button.click());

    expect(billingApi.purchaseChannelAddOn).toHaveBeenCalledWith("token", SITE_ID, "sub-1", "Telegram");
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
  });

  it("shows an already-connected channel as connected, with no button to buy it again", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({
        connectedChannels: [{ kind: "Telegram", subscriptionId: "opt-1", cancelRequested: false, currentPeriodEnd: "2026-09-28T12:00:00Z" }],
      }),
    );

    const container = await render(page());
    const row = buyRow(panelTitled(container, "Buy now"), "Telegram");

    expect(row.textContent).toContain("Connected");
    expect(row.querySelector("button")).toBeNull();
  });
});

describe("Card B - next period, no usable subscription yet (Solo)", () => {
  it("shows the Business transition note and a seats select defaulting to the purchasable minimum", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());
    const panel = panelTitled(container, "Next period");

    expect(panel.textContent).toContain("Moving to Business");
    expect(panel.textContent).toContain("₽490.00/mo");
    const select = one<HTMLSelectElement>(panel, "select");
    expect(select.value).toBe("2");
  });

  it("subscribes with the chosen seat count and the save-payment-method choice, redirecting to ЮKassa", async () => {
    const location = stubLocationHref();
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());
    billingApi.createCheckoutSession.mockResolvedValue({ confirmationUrl: "https://yookassa.example/pay/abc" });

    const container = await render(page());
    const panel = panelTitled(container, "Next period");
    const select = one<HTMLSelectElement>(panel, "select");
    await interact(() => selectValue(select, "4"));
    const checkbox = one<HTMLInputElement>(panel, 'input[type="checkbox"]');
    await interact(() => clickCheckbox(checkbox));
    const button = byText<HTMLButtonElement>(panel, "button", "Subscribe");
    if (button === null) {
      throw new Error("no Subscribe button rendered");
    }

    await interact(() => button.click());

    expect(billingApi.createCheckoutSession).toHaveBeenCalledWith("token", SITE_ID, 4, false);
    expect(location.href).toBe("https://yookassa.example/pay/abc");
  });
});

describe("Card B - next period, editing an active subscription's own composition", () => {
  it("persists a new seat count immediately, with no charge, and refreshes status", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus())
      .mockResolvedValue(businessStatus({ latestSubscription: subscription({ pendingSeatCount: 4, pendingTier: "starter" }) }));
    billingApi.setNextPeriodComposition.mockResolvedValue({ tier: "starter", requestedSeats: 4, requestedExtraAdministrators: 0 });

    const container = await render(page());
    const panel = panelTitled(container, "Next period");
    const selects = all(panel, "select") as HTMLSelectElement[];
    const opsSelect = selects[0];
    expect(opsSelect.value).toBe("3");

    await interact(() => selectValue(opsSelect, "4"));

    expect(billingApi.setNextPeriodComposition).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 4, 0);
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Change scheduled");
  });

  it("persists a new extra-Administrator count in either direction, with no charge", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus())
      .mockResolvedValue(businessStatus({ latestSubscription: subscription({ pendingAdminCount: 1, pendingTier: "starter" }) }));
    billingApi.setNextPeriodComposition.mockResolvedValue({ tier: "starter", requestedSeats: 3, requestedExtraAdministrators: 1 });

    const container = await render(page());
    const panel = panelTitled(container, "Next period");
    const selects = all(panel, "select") as HTMLSelectElement[];
    const adminsSelect = selects[1];
    expect(adminsSelect.value).toBe("0");

    await interact(() => selectValue(adminsSelect, "1"));

    expect(billingApi.setNextPeriodComposition).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 3, 1);
  });

  it("turns off a connected channel's own renewal by cancelling its option subscription - one-directional", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(
        businessStatus({
          connectedChannels: [{ kind: "Telegram", subscriptionId: "opt-1", cancelRequested: false, currentPeriodEnd: "2026-09-28T12:00:00Z" }],
        }),
      )
      .mockResolvedValue(
        businessStatus({
          connectedChannels: [{ kind: "Telegram", subscriptionId: "opt-1", cancelRequested: true, currentPeriodEnd: "2026-09-28T12:00:00Z" }],
        }),
      );
    billingApi.cancelSubscription.mockResolvedValue({ paidThroughUntil: "2026-09-28T12:00:00Z" });

    const container = await render(page());
    const panel = panelTitled(container, "Next period");
    const checkbox = checkboxLabeled(panel, "Telegram");
    expect(checkbox.checked).toBe(true);

    await interact(() => clickCheckbox(checkbox));

    expect(billingApi.cancelSubscription).toHaveBeenCalledWith("token", SITE_ID, "opt-1");
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
  });

  it("shows the server's own next-charge total, never a client-computed one", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ nextChargeRub: 690 }));

    const container = await render(page());
    const panel = panelTitled(container, "Next period");

    expect(panel.textContent).toContain("690.00");
  });

  it("does not call cancelSubscription for the whole subscription until the destructive click is confirmed", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus());

    const container = await render(page());
    const cancelButton = byText<HTMLButtonElement>(container, "button", "Do not renew");
    if (cancelButton === null) {
      throw new Error("no Do not renew button rendered");
    }

    await interact(() => cancelButton.click());

    expect(billingApi.cancelSubscription).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("No refund is given for the remaining time");
  });

  it("cancels the whole subscription only after confirmation", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus())
      .mockResolvedValue(businessStatus({ latestSubscription: subscription({ cancelRequested: true }) }));
    billingApi.cancelSubscription.mockResolvedValue({ paidThroughUntil: "2026-09-28T12:00:00Z" });

    const container = await render(page());
    const openButton = byText<HTMLButtonElement>(container, "button", "Do not renew");
    if (openButton === null) {
      throw new Error("no Do not renew button rendered");
    }
    await interact(() => openButton.click());

    const dialog = one(container, "dialog");
    const confirmButton = byText<HTMLButtonElement>(dialog, "button", "Do not renew");
    if (confirmButton === null) {
      throw new Error("the confirmation dialog has no destructive action");
    }

    await interact(() => confirmButton.click());

    expect(billingApi.cancelSubscription).toHaveBeenCalledWith("token", SITE_ID, "sub-1");
    expect(container.textContent).toContain("Subscription ending");
  });
});

describe("the honest pending-then-confirmed state", () => {
  it("shows the pending state and never claims Business while the subscription is still Pending", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }) }));

    const container = await render(page());

    expect(container.textContent).toContain("Confirming payment");
    const currentPlanPanel = panelTitled(container, "Current plan");
    expect(currentPlanPanel.textContent).toContain("Solo");
    expect(currentPlanPanel.textContent).not.toContain("Business");
  });

  it("polls and transitions to the confirmed state only once the server's own status moves to Succeeded - never sooner", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce(
      freeStatus({ latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }) }),
    );

    const container = await render(page());
    expect(container.textContent).toContain("Confirming payment");

    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus());

    await interact(() => vi.advanceTimersByTime(3000));

    expect(container.textContent).not.toContain("Confirming payment");
    expect(container.textContent).toContain("Business");
  });

  it("transitions to the failed state when ЮKassa declines the payment - never rendered as success", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce(
      freeStatus({ latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }) }),
    );

    const container = await render(page());

    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ latestSubscription: subscription({ status: "Failed", currentPeriodEnd: null }) }));

    await interact(() => vi.advanceTimersByTime(3000));

    expect(container.textContent).toContain("Payment declined");
    expect(container.textContent).not.toContain("Confirming payment");
  });
});
