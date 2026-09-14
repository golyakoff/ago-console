import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { BillingPage, BILLING_PERMISSION } from "./BillingPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { BillingSeatPricingDto, BillingStatusDto, BillingSubscriptionSummaryDto } from "../api/billingApi.js";

/**
 * `13-04`: `/settings/billing`. Modeled on `AccountDeletionPage.test.tsx`/`WidgetConfigPage.test.tsx`
 * for the permission-gated-page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me`
 * faked), plus this item's own new parts: the honest pending-then-confirmed poll (proven against a
 * mocked backend response *sequence*, not a single fixed fake), and the downgrade/cancellation scope
 * this item's own report explains was added because `13-03` unblocked it.
 *
 * `25-23` added the "the Solo/Business grid, as this screen actually renders it" block below, and
 * rebuilt every fixture here around the extended `BillingStatusDto`. The fixtures' own numbers are
 * `SubscriptionTierBands`' real current values - `MinSeats` 2, **`MaxSeats` 5**, `BaseSeats` 3,
 * `FreeSeatsIncluded` 2 - because the bug this item fixed was a console that had 100 written down
 * where the server says 5, and a fixture that repeated the wrong number would have hidden it again.
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

/** React tracks the DOM value it last wrote, so assigning `.value` directly is swallowed as "no
 * change" and no `onChange` fires - going through the *prototype's* setter is what makes the
 * synthetic change real, the identical workaround `SearchConversationsPage.test.tsx`/
 * `ConversationPage.test.tsx` already use for the same reason. */
const INPUT_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function setInputValue(input: HTMLInputElement, value: string): void {
  INPUT_VALUE_DESCRIPTOR?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

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

/** A Solo site: free, never checked out, one Administrator included and no extra ones bought. */
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
    ...overrides,
  };
}

/** A Business site with room left to buy: 3 of the 5 purchasable seats held. */
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
    ...overrides,
  };
}

/** jsdom's `Location` is largely non-configurable in place - the same workaround
 * `shell/tenancySwitcher.test.tsx` already uses for its own `window.location.reload` spy, applied
 * here to observe the redirect this screen's checkout submit performs via `window.location.href`. */
const originalLocation = window.location;

function stubLocationHref(): { href: string } {
  const stub = { ...originalLocation, href: "" };
  Object.defineProperty(window, "location", { configurable: true, value: stub });
  return stub;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [BILLING_PERMISSION], siteId: SITE_ID });
  billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());
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
    expect(container.textContent).toContain("3");
  });
});

/** `25-23`: everything this item's own Scope asked the screen to stop getting wrong. */
describe("the Solo/Business grid, as this screen actually renders it", () => {
  it("renders the tier by the grid's own name, never the raw enum value the wire carries", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());

    const subscriptionPanel = panelTitled(container, "Subscription");
    expect(subscriptionPanel.textContent).toContain("Solo");
    // `tier` is still `"free"` on the wire and must never reach the screen as a label - that is the
    // exact defect this item was filed for. Scoped to the tier panel because the Operator block
    // legitimately says "Included free on Solo" about the allowance.
    expect(subscriptionPanel.textContent).not.toContain("free");
  });

  it("shows Operator and Administrator counts as two separate pairs, each against its own limit", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ seatsUsed: 3, seatLimit: 4, adminsUsed: 2, adminLimit: 3, extraAdministratorsPurchased: 1 }),
    );

    const container = await render(page());
    const operatorPanel = panelTitled(container, "Operator seats");
    const adminPanel = panelTitled(container, "Administrator seats");

    expect(operatorPanel.textContent).toContain("In use: 3");
    expect(operatorPanel.textContent).toContain("Limit: 4");
    expect(adminPanel.textContent).toContain("In use: 2");
    expect(adminPanel.textContent).toContain("Limit: 3");
    expect(adminPanel.textContent).toContain("Administrators are counted separately from Operator seats.");
  });

  it("names the Administrator allowance apart from what was bought beyond it", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ adminLimit: 3, adminsUsed: 3, extraAdministratorsPurchased: 1, adminExtraPriceRub: 500 }),
    );

    const container = await render(page());
    const adminPanel = panelTitled(container, "Administrator seats");

    // `AdminLimit` is `ResolveAdminLimit(tier) + ExtraAdministratorsPurchased`, so 3 - 1 = the 2 the
    // Business tier itself includes; the 1 is `25-41`'s own persisted purchase count, not a guess.
    expect(adminPanel.textContent).toContain("Included in the tier: 2");
    expect(adminPanel.textContent).toContain("Purchased beyond the tier: 1");
    expect(adminPanel.textContent).toContain("₽500.00");
  });

  it("shows an unpublished extra-Administrator price as an absence, never as ₽0", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ adminExtraPriceRub: null }));

    const container = await render(page());
    const adminPanel = panelTitled(container, "Administrator seats");

    expect(adminPanel.textContent).toContain("not on sale yet");
    expect(adminPanel.textContent).not.toContain("₽0.00");
  });

  it("takes the purchasable seat range and its prices from the server, not from a copy of its own", async () => {
    // The server's real bands are 2-5. The console used to hand-type "2-100" and locally accept
    // every value in between.
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());
    const operatorPanel = panelTitled(container, "Operator seats");

    expect(operatorPanel.textContent).toContain("Purchasable on Business: 2-5");
    expect(operatorPanel.textContent).toContain("Included free on Solo: 2");
    expect(operatorPanel.textContent).toContain("₽490.00");
    expect(operatorPanel.textContent).toContain("₽200.00");
    expect(operatorPanel.textContent).not.toContain("100");
  });

  it("renders whatever range the server sends, so a band change needs no console release", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ seatPricing: seatPricing({ minSeats: 3, maxSeats: 9 }) }));

    const container = await render(page());

    expect(panelTitled(container, "Operator seats").textContent).toContain("Purchasable on Business: 3-9");
  });
});

/** `25-23`: the direct-edit seat field is gone; what replaced it buys a quantity. */
describe("the add-seats control", () => {
  it("buys the quantity chosen on top of the seat count the server reported, not an absolute typed over it", async () => {
    const location = stubLocationHref();
    billingApi.createCheckoutSession.mockResolvedValue({ confirmationUrl: "https://yookassa.example/pay/abc" });
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ seatLimit: 2 }));

    const container = await render(page());
    const addInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Add");
    if (button === null) {
      throw new Error("no Add button rendered");
    }

    await interact(() => setInputValue(addInput, "2"));
    await interact(() => button.click());

    // 2 held + 2 added = 4 requested, never the bare "2" that was typed.
    expect(billingApi.createCheckoutSession).toHaveBeenCalledWith("token", SITE_ID, 4);
    expect(location.href).toBe("https://yookassa.example/pay/abc");
  });

  it("says out loud that pressing it opens ЮKassa when the site has no active subscription", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());

    expect(container.textContent).toContain("moves this site onto Business");
    expect(container.textContent).toContain("ЮKassa");
  });

  it("refuses a quantity that would take the total past the server's own maximum, and names that range", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ seatLimit: 2 }));

    const container = await render(page());
    const addInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Add");
    if (button === null) {
      throw new Error("no Add button rendered");
    }

    // 2 + 5 = 7, past `MaxSeats` 5. The old hardcoded ceiling of 100 waved this through to the
    // server, which then refused it. The message appears on the change, before any click.
    await interact(() => setInputValue(addInput, "5"));

    expect(container.textContent).toContain("The resulting seat count has to be within 2-5");
    expect(button.disabled).toBe(true);

    await interact(() => button.click());

    expect(billingApi.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("offers no control at all once the site already holds the largest purchasable seat count", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 5, seatsUsed: 5 }));

    const container = await render(page());

    expect(container.textContent).toContain("You already hold the largest seat count sold without a conversation.");
    expect(container.querySelector("input[type=number]")).toBeNull();
    expect(byText(container, "button", "Add")).toBeNull();
  });
});

describe("the honest pending-then-confirmed state", () => {
  it("shows the pending state and never claims success while the subscription is still Pending", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      freeStatus({ latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }) }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Confirming payment");
    // The tier line still reads the site's own untouched value - never "Business" just because a
    // Pending row exists, matching `CreateCheckoutSessionHandler`'s own "never touches Site.Tier
    // itself" contract. Scoped to the tier panel: the Operator block legitimately names Business
    // when describing what is purchasable.
    const subscriptionPanel = panelTitled(container, "Subscription");
    expect(subscriptionPanel.textContent).toContain("Solo");
    expect(subscriptionPanel.textContent).not.toContain("Business");
  });

  it("polls and transitions to the confirmed state only once the server's own status moves to Succeeded - never sooner", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce(
      freeStatus({ latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }) }),
    );

    const container = await render(page());
    expect(container.textContent).toContain("Confirming payment");

    // The webhook lands: the *next* poll tick sees the real, confirmed state.
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

    billingApi.fetchBillingStatus.mockResolvedValue(
      freeStatus({ latestSubscription: subscription({ status: "Failed", currentPeriodEnd: null }) }),
    );

    await interact(() => vi.advanceTimersByTime(3000));

    expect(container.textContent).toContain("Payment declined");
    expect(container.textContent).not.toContain("Confirming payment");
  });
});

describe("adding seats to an active (Succeeded) subscription", () => {
  it("shows the charged amount once an upgrade succeeds", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 3, seatsUsed: 3 }));
    billingApi.changeSubscriptionSeats.mockResolvedValue({ proratedAmountRub: 123.45, newTier: "starter", newSeatCount: 5 });

    const container = await render(page());
    const addInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Add");
    if (button === null) {
      throw new Error("no Add button rendered");
    }

    await interact(() => setInputValue(addInput, "2"));
    await interact(() => button.click());

    expect(billingApi.changeSubscriptionSeats).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 5);
    expect(container.textContent).toContain("123.45");
  });

  it("shows a scheduled downgrade through the persistent status block", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({
        seatLimit: 4,
        latestSubscription: subscription({ requestedSeats: 4, pendingSeatCount: 3, pendingTier: "starter" }),
      }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Seat change scheduled");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("starter");
  });
});

describe("cancelling a subscription", () => {
  it("does not call cancelSubscription until the destructive click is confirmed", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus());

    const container = await render(page());
    const cancelButton = byText<HTMLButtonElement>(container, "button", "Cancel subscription");
    if (cancelButton === null) {
      throw new Error("no Cancel subscription button rendered");
    }

    await interact(() => cancelButton.click());

    expect(billingApi.cancelSubscription).not.toHaveBeenCalled();
    expect(one(container, "dialog").textContent).toContain("No refund is given for the remaining time");
  });

  it("cancels only after confirmation, and then shows the paid-through date via the persistent status block", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus())
      .mockResolvedValue(businessStatus({ latestSubscription: subscription({ cancelRequested: true }) }));
    billingApi.cancelSubscription.mockResolvedValue({ paidThroughUntil: "2026-09-28T12:00:00Z" });

    const container = await render(page());
    const openButton = byText<HTMLButtonElement>(container, "button", "Cancel subscription");
    if (openButton === null) {
      throw new Error("no Cancel subscription button rendered");
    }
    await interact(() => openButton.click());

    const dialog = one(container, "dialog");
    const confirmButton = byText<HTMLButtonElement>(dialog, "button", "Cancel subscription");
    if (confirmButton === null) {
      throw new Error("the confirmation dialog has no destructive action");
    }

    await interact(() => confirmButton.click());

    expect(billingApi.cancelSubscription).toHaveBeenCalledWith("token", SITE_ID, "sub-1");
    expect(container.textContent).toContain("Subscription ending");
  });
});

describe("PastDue - a recurring charge failed", () => {
  it("shows the retry-in-progress warning and offers no add-seats control", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ latestSubscription: subscription({ status: "PastDue" }) }),
    );

    const container = await render(page());

    expect(container.textContent).toContain("Payment retry in progress");
    expect(byText(container, "button", "Add")).toBeNull();
    // Cancel is still offered - `decisions/0006`/`CancelSubscriptionHandler` allow cancelling a
    // PastDue subscription.
    expect(byText(container, "button", "Cancel subscription")).not.toBeNull();
  });
});

/** `25-23`: the two seat blocks are told apart by their own panel, so an assertion about one cannot
 * be satisfied by text in the other - the whole point of splitting them. */
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
