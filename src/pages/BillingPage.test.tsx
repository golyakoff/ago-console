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
  purchaseAdministratorSlot: vi.fn(),
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

/** `25-23`: everything this item's own Scope asked the screen to stop getting wrong.
 * `26-294` merged the old Subscription/Operator-seats/Administrator-seats panels into one "Current
 * plan" card and moved pure reference pricing (base/extra seat price, purchasable range) to its
 * point of use in the "Add to your plan" card - these tests were rewritten around that new split. */
describe("the Solo/Business grid, as this screen actually renders it", () => {
  it("renders the tier by the grid's own name, never the raw enum value the wire carries", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());

    const currentPlanPanel = panelTitled(container, "Current plan");
    expect(currentPlanPanel.textContent).toContain("Solo");
    // `tier` is still `"free"` on the wire and must never reach the screen as a label - that is the
    // exact defect this item was filed for. Scoped to the Tier fact's own `<dd>` rather than the
    // whole card's `textContent`: the same card legitimately says "Included free on Solo" about the
    // seat allowance a few rows down, and a bare substring check would trip over that lowercase
    // "free" as a false positive.
    const tierValue = Array.from(currentPlanPanel.querySelectorAll("dt")).find((dt) => dt.textContent === "Tier")
      ?.parentElement?.querySelector("dd");
    expect(tierValue?.textContent).toBe("Solo");
  });

  it("shows Operator and Administrator counts as two separate pairs, each against its own limit", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ seatsUsed: 3, seatLimit: 4, adminsUsed: 2, adminLimit: 3, extraAdministratorsPurchased: 1 }),
    );

    const container = await render(page());
    const currentPlanPanel = panelTitled(container, "Current plan");

    expect(currentPlanPanel.textContent).toContain("3 / 4");
    expect(currentPlanPanel.textContent).toContain("2 / 3");
    expect(currentPlanPanel.textContent).toContain("Administrators are counted separately from Operator seats.");
  });

  it("names the Administrator allowance apart from what was bought beyond it, and prices the extra seat at its point of use", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ adminLimit: 3, adminsUsed: 3, extraAdministratorsPurchased: 1, adminExtraPriceRub: 500 }),
    );

    const container = await render(page());
    const currentPlanPanel = panelTitled(container, "Current plan");
    const addToPlanPanel = panelTitled(container, "Add to your plan");

    // `AdminLimit` is `ResolveAdminLimit(tier) + ExtraAdministratorsPurchased` - the persisted
    // purchase count `25-41` tracks, named apart from the tier's own included allowance.
    expect(currentPlanPanel.textContent).toContain("Purchased beyond the tier: 1");
    // `26-290` §4: the price itself is reference pricing and lives at its point of use (the buy
    // row), not on the Current plan card.
    expect(addToPlanPanel.textContent).toContain("₽500.00");
  });

  it("shows an unpublished extra-Administrator price as an absence, never as ₽0", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ adminExtraPriceRub: null }));

    const container = await render(page());
    const addToPlanPanel = panelTitled(container, "Add to your plan");

    expect(addToPlanPanel.textContent).toContain("not on sale yet");
    expect(addToPlanPanel.textContent).not.toContain("₽0.00");
  });

  it("takes the purchasable seat range and its prices from the server, not from a copy of its own", async () => {
    // The server's real bands are 2-5. The console used to hand-type "2-100" and locally accept
    // every value in between.
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());
    const currentPlanPanel = panelTitled(container, "Current plan");
    const addToPlanPanel = panelTitled(container, "Add to your plan");

    expect(currentPlanPanel.textContent).toContain("Included free on Solo: 2");
    expect(addToPlanPanel.textContent).toContain("Purchasable on Business: 2-5");
    expect(addToPlanPanel.textContent).toContain("₽490.00");
    expect(addToPlanPanel.textContent).toContain("₽200.00");
    expect(addToPlanPanel.textContent).not.toContain("100");
  });

  it("renders whatever range the server sends, so a band change needs no console release", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus({ seatPricing: seatPricing({ minSeats: 3, maxSeats: 9 }) }));

    const container = await render(page());

    expect(panelTitled(container, "Add to your plan").textContent).toContain("Purchasable on Business: 3-9");
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
    // `26-294`: the add-seats row now lives inside the "Add to your plan" card, alongside the
    // Administrator buy row and - on a `Succeeded` subscription, which this fixture's `businessStatus`
    // carries - the nested reduce-seats sub-panel. Scoped to the card's own buy rows rather than its
    // full `textContent`/every input: the reduce-seats control legitimately has a number input of its
    // own, and asserting "no input anywhere in this card" would wrongly fail on that unrelated control.
    const panel = panelTitled(container, "Add to your plan");
    const buyRows = Array.from(panel.querySelectorAll(".ago-billing-buy-row"));

    expect(panel.textContent).toContain("You already hold the largest seat count sold without a conversation.");
    // The Administrator row's own price is unpublished by default in this fixture (`freeStatus`'s
    // `adminExtraPriceRub: null`), so it renders no input of its own either - the seat row being at
    // its maximum is the only reason nothing here is left to buy.
    for (const row of buyRows) {
      expect(row.querySelector("input[type=number]")).toBeNull();
    }
    expect(byText(panel, "button", "Add")).toBeNull();
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
    const subscriptionPanel = panelTitled(container, "Current plan");
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

/** `25-95`: the decrease direction `25-23`'s add-only stepper removed the one console path for.
 * `ChangeSubscriptionSeatsHandler` never stopped accepting a lower absolute seat count - what was
 * gone was any console control that could ever send one. */
describe("reducing seats on an active (Succeeded) subscription", () => {
  it("requests the seat count the server reported minus the quantity chosen - a real absolute count, not a delta", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 4, seatsUsed: 2 }));
    // `DowngradeScheduled`'s own wire shape - `newTier`/`newSeatCount`, no `proratedAmountRub` at
    // all, because no charge was made (`ChangeSubscriptionSeatsResponseDto`'s own remarks).
    billingApi.changeSubscriptionSeats.mockResolvedValue({ newTier: "starter", newSeatCount: 3 });

    const container = await render(page());
    const panel = panelTitled(container, "Reduce operators");
    const removeInput = one<HTMLInputElement>(panel, "input[type=number]");
    const button = byText<HTMLButtonElement>(panel, "button", "Schedule reduction");
    if (button === null) {
      throw new Error("no Schedule reduction button rendered");
    }

    await interact(() => setInputValue(removeInput, "1"));
    await interact(() => button.click());

    // 4 held - 1 removed = 3 requested, the identical "absolute count sent, never the bare quantity
    // typed" contract `seatsAfterPurchase` already uses for the add direction.
    expect(billingApi.changeSubscriptionSeats).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 3);
  });

  it("never renders a charge for a scheduled downgrade - the response carries no amount to show", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 4, seatsUsed: 2 }));
    billingApi.changeSubscriptionSeats.mockResolvedValue({ newTier: "starter", newSeatCount: 3 });

    const container = await render(page());
    const panel = panelTitled(container, "Reduce operators");
    const removeInput = one<HTMLInputElement>(panel, "input[type=number]");
    const button = byText<HTMLButtonElement>(panel, "button", "Schedule reduction");
    if (button === null) {
      throw new Error("no Schedule reduction button rendered");
    }

    await interact(() => setInputValue(removeInput, "1"));
    await interact(() => button.click());

    // No success alert of any kind renders for this submission - a decrease is never billed and
    // never applies immediately, so there is nothing to confirm beyond what the persistent
    // pending-downgrade block (covered separately below) already shows once the refetch lands. In
    // particular, no ruble amount appears inside the reduce panel itself - unlike the charged-upgrade
    // path, which does show one (`billingUpgradeSuccessBody`).
    expect(panel.querySelector(".ago-alert--success")).toBeNull();
    expect(panel.textContent).not.toMatch(/₽\d/);
  });

  it("leads to the persistent scheduled-downgrade display once the post-request refetch reports it - never before", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(businessStatus({ seatLimit: 4, seatsUsed: 2 }))
      .mockResolvedValue(
        businessStatus({
          seatLimit: 4,
          seatsUsed: 2,
          latestSubscription: subscription({ requestedSeats: 4, pendingSeatCount: 3, pendingTier: "starter" }),
        }),
      );
    billingApi.changeSubscriptionSeats.mockResolvedValue({ newTier: "starter", newSeatCount: 3 });

    const container = await render(page());
    // Before submitting, nothing has scheduled anything yet.
    expect(container.textContent).not.toContain("Seat change scheduled");

    const panel = panelTitled(container, "Reduce operators");
    const removeInput = one<HTMLInputElement>(panel, "input[type=number]");
    const button = byText<HTMLButtonElement>(panel, "button", "Schedule reduction");
    if (button === null) {
      throw new Error("no Schedule reduction button rendered");
    }

    await interact(() => setInputValue(removeInput, "1"));
    await interact(() => button.click());

    // `load()` re-runs `fetchBillingStatus` after the request resolves - the persistent block reads
    // `sub.pendingSeatCount`/`pendingTier` off that refetch, never off the write response itself.
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Seat change scheduled");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("starter");
  });

  it("refuses a quantity that would take the total below the server's own minimum, and names that range", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 3, seatsUsed: 2 }));

    const container = await render(page());
    const panel = panelTitled(container, "Reduce operators");
    const removeInput = one<HTMLInputElement>(panel, "input[type=number]");
    const button = byText<HTMLButtonElement>(panel, "button", "Schedule reduction");
    if (button === null) {
      throw new Error("no Schedule reduction button rendered");
    }

    // 3 - 2 = 1, below `MinSeats` 2.
    await interact(() => setInputValue(removeInput, "2"));

    expect(panel.textContent).toContain("The resulting seat count has to be within 2-5");
    expect(button.disabled).toBe(true);

    await interact(() => button.click());

    expect(billingApi.changeSubscriptionSeats).not.toHaveBeenCalled();
  });

  it("offers no control at all once the site already holds the tier's own smallest seat count", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 2, seatsUsed: 2 }));

    const container = await render(page());
    const panel = panelTitled(container, "Reduce operators");

    expect(panel.textContent).toContain("You already hold the smallest seat count this tier allows.");
    expect(panel.querySelector("input[type=number]")).toBeNull();
    expect(byText(panel, "button", "Schedule reduction")).toBeNull();
  });

  it("is not offered without an active (Succeeded) subscription - there is nothing yet to reduce from", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());

    expect(() => panelTitled(container, "Reduce operators")).toThrow();
  });

  it("says out loud that the change is scheduled and never charges", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(businessStatus({ seatLimit: 4, seatsUsed: 2 }));

    const container = await render(page());
    const panel = panelTitled(container, "Reduce operators");

    expect(panel.textContent).toContain("does not take effect now and is never charged");
  });
});

/** `25-96`: the Administrator-seat purchase control this screen was missing entirely before this
 * item - `25-41`'s own endpoint existed and was tested on the `ago-chat` side, but nothing in the
 * console called it. `26-294` folded this control into a `.ago-billing-buy-row` inside the "Add to
 * your plan" card rather than a panel of its own - these tests scope to that row via its own button
 * or text (`.closest(".ago-billing-buy-row")`) rather than a `panelTitled` lookup that no longer
 * resolves to anything. */
describe("purchasing extra Administrator seats", () => {
  it("buys the quantity chosen on top of the current extra-Administrator count, charging immediately - no ЮKassa redirect", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ extraAdministratorsPurchased: 1, adminLimit: 3, adminsUsed: 2, adminExtraPriceRub: 500 }),
    );
    billingApi.purchaseAdministratorSlot.mockResolvedValue({ proratedAmountRub: 250, newExtraAdministratorCount: 3 });

    const container = await render(page());
    const button = byText<HTMLButtonElement>(container, "button", "Add administrators");
    if (button === null) {
      throw new Error("no Add administrators button rendered");
    }
    const row = button.closest(".ago-billing-buy-row");
    if (row === null) {
      throw new Error("Add administrators button is not inside a buy row");
    }
    const addInput = one<HTMLInputElement>(row, "input[type=number]");

    await interact(() => setInputValue(addInput, "2"));
    await interact(() => button.click());

    // 1 already bought + 2 added = 3 requested - the same "absolute count sent to the server, never
    // the bare quantity typed" contract `seatsAfterPurchase` uses for Operator seats.
    expect(billingApi.purchaseAdministratorSlot).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 3);
    expect(row.textContent).toContain("250.00");
    expect(row.textContent).toContain("This charges your saved payment method immediately");
  });

  it("offers no control, and explains why, while the extra-Administrator price is not yet published", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(freeStatus());

    const container = await render(page());
    const notice = byText(container, "p", "Extra Administrators are not on sale yet.");
    if (notice === null) {
      throw new Error("no 'not on sale yet' notice rendered");
    }
    const row = notice.closest(".ago-billing-buy-row");
    if (row === null) {
      throw new Error("the notice is not inside a buy row");
    }

    expect(row.querySelector("input[type=number]")).toBeNull();
    expect(byText(row, "button", "Add administrators")).toBeNull();
    expect(billingApi.purchaseAdministratorSlot).not.toHaveBeenCalled();
  });

  it("offers no control, and points at the Operator purchase above, without an active (Succeeded) subscription", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      businessStatus({ adminExtraPriceRub: 500, latestSubscription: subscription({ status: "PastDue" }) }),
    );

    const container = await render(page());
    const notice = byText(container, "p", "Purchasing extra Administrators needs an active paid subscription. Add operators above first to start one, then extra Administrators can be bought here.");
    if (notice === null) {
      throw new Error("no 'needs an active paid subscription' notice rendered");
    }
    const row = notice.closest(".ago-billing-buy-row");
    if (row === null) {
      throw new Error("the notice is not inside a buy row");
    }

    expect(row.querySelector("input[type=number]")).toBeNull();
    expect(byText(row, "button", "Add administrators")).toBeNull();
  });

  it("refreshes the purchased count and the resulting limit on the same screen after a successful purchase", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce(
        businessStatus({ extraAdministratorsPurchased: 1, adminLimit: 3, adminsUsed: 2, adminExtraPriceRub: 500 }),
      )
      .mockResolvedValue(
        businessStatus({ extraAdministratorsPurchased: 2, adminLimit: 4, adminsUsed: 2, adminExtraPriceRub: 500 }),
      );
    billingApi.purchaseAdministratorSlot.mockResolvedValue({ proratedAmountRub: 250, newExtraAdministratorCount: 2 });

    const container = await render(page());
    // Default quantity (1) is submitted as-is - this test is about the post-purchase refresh, not
    // the quantity chosen.
    const button = byText<HTMLButtonElement>(container, "button", "Add administrators");
    if (button === null) {
      throw new Error("no Add administrators button rendered");
    }

    await interact(() => button.click());

    // `load()` re-runs `fetchBillingStatus` after the purchase resolves - the display card reflects
    // the server's own post-purchase numbers, never a locally-computed guess.
    expect(billingApi.fetchBillingStatus).toHaveBeenCalledTimes(2);
    const currentPlanPanel = panelTitled(container, "Current plan");
    expect(currentPlanPanel.textContent).toContain("Purchased beyond the tier: 2");
    expect(currentPlanPanel.textContent).toContain("2 / 4");
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
