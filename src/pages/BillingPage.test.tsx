import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { BillingPage, BILLING_PERMISSION } from "./BillingPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { BillingStatusDto, BillingSubscriptionSummaryDto } from "../api/billingApi.js";

/**
 * `13-04`: `/settings/billing`. Modeled on `AccountDeletionPage.test.tsx`/`WidgetConfigPage.test.tsx`
 * for the permission-gated-page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me`
 * faked), plus this item's own new parts: the honest pending-then-confirmed poll (proven against a
 * mocked backend response *sequence*, not a single fixed fake), and the downgrade/cancellation scope
 * this item's own report explains was added because `13-03` unblocked it.
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
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
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

function freeStatus(): BillingStatusDto {
  return { tier: "free", seatLimit: 1, seatsUsed: 1, latestSubscription: null };
}

function subscription(overrides: Partial<BillingSubscriptionSummaryDto> = {}): BillingSubscriptionSummaryDto {
  return {
    subscriptionId: "sub-1",
    status: "Succeeded",
    requestedSeats: 5,
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
    billingApi.fetchBillingStatus.mockResolvedValue({ tier: "starter", seatLimit: 5, seatsUsed: 3, latestSubscription: subscription() });

    const container = await render(page());

    expect(container.textContent).toContain("starter");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("5");
  });
});

describe("the honest pending-then-confirmed state", () => {
  it("shows the pending state and never claims success while the subscription is still Pending", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue({
      tier: "free",
      seatLimit: 1,
      seatsUsed: 1,
      latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }),
    });

    const container = await render(page());

    expect(container.textContent).toContain("Confirming payment");
    // The tier line still reads the site's own untouched value - never "starter" just because a
    // Pending row exists, matching `CreateCheckoutSessionHandler`'s own "never touches Site.Tier
    // itself" contract.
    expect(container.textContent).toContain("free");
  });

  it("polls and transitions to the confirmed state only once the server's own status moves to Succeeded - never sooner", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce({
      tier: "free",
      seatLimit: 1,
      seatsUsed: 1,
      latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }),
    });

    const container = await render(page());
    expect(container.textContent).toContain("Confirming payment");

    // The webhook lands: the *next* poll tick sees the real, confirmed state.
    billingApi.fetchBillingStatus.mockResolvedValue({ tier: "starter", seatLimit: 5, seatsUsed: 1, latestSubscription: subscription() });

    await interact(() => vi.advanceTimersByTime(3000));

    expect(container.textContent).not.toContain("Confirming payment");
    expect(container.textContent).toContain("starter");
  });

  it("transitions to the failed state when ЮKassa declines the payment - never rendered as success", async () => {
    billingApi.fetchBillingStatus.mockResolvedValueOnce({
      tier: "free",
      seatLimit: 1,
      seatsUsed: 1,
      latestSubscription: subscription({ status: "Pending", currentPeriodEnd: null }),
    });

    const container = await render(page());

    billingApi.fetchBillingStatus.mockResolvedValue({
      tier: "free",
      seatLimit: 1,
      seatsUsed: 1,
      latestSubscription: subscription({ status: "Failed", currentPeriodEnd: null }),
    });

    await interact(() => vi.advanceTimersByTime(3000));

    expect(container.textContent).toContain("Payment declined");
    expect(container.textContent).not.toContain("Confirming payment");
  });
});

describe("starting a checkout (no active paid subscription)", () => {
  it("submits the requested seat count and redirects the browser to ЮKassa's hosted checkout", async () => {
    const location = stubLocationHref();
    billingApi.createCheckoutSession.mockResolvedValue({ confirmationUrl: "https://yookassa.example/pay/abc" });

    const container = await render(page());
    const seatInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Subscribe");
    if (button === null) {
      throw new Error("no Subscribe button rendered");
    }

    await interact(() => setInputValue(seatInput, "5"));
    await interact(() => button.click());

    expect(billingApi.createCheckoutSession).toHaveBeenCalledWith("token", SITE_ID, 5);
    expect(location.href).toBe("https://yookassa.example/pay/abc");
  });
});

describe("changing seat count on an active (Succeeded) subscription", () => {
  it("shows the charged amount once an upgrade succeeds", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue({ tier: "starter", seatLimit: 5, seatsUsed: 3, latestSubscription: subscription() });
    billingApi.changeSubscriptionSeats.mockResolvedValue({ proratedAmountRub: 123.45, newTier: "growth", newSeatCount: 12 });

    const container = await render(page());
    const seatInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Change seat count");
    if (button === null) {
      throw new Error("no Change seat count button rendered");
    }

    await interact(() => setInputValue(seatInput, "12"));
    await interact(() => button.click());

    expect(billingApi.changeSubscriptionSeats).toHaveBeenCalledWith("token", SITE_ID, "sub-1", 12);
    expect(container.textContent).toContain("123.45");
  });

  it("shows the scheduled downgrade through the persistent status block, not a separate toast", async () => {
    billingApi.fetchBillingStatus
      .mockResolvedValueOnce({ tier: "growth", seatLimit: 12, seatsUsed: 3, latestSubscription: subscription({ requestedSeats: 12, tier: "growth" }) })
      .mockResolvedValue({
        tier: "growth",
        seatLimit: 12,
        seatsUsed: 3,
        latestSubscription: subscription({ requestedSeats: 12, tier: "growth", pendingSeatCount: 3, pendingTier: "starter" }),
      });
    billingApi.changeSubscriptionSeats.mockResolvedValue({ newTier: "starter", newSeatCount: 3 });

    const container = await render(page());
    const seatInput = one<HTMLInputElement>(container, "input[type=number]");
    const button = byText<HTMLButtonElement>(container, "button", "Change seat count");
    if (button === null) {
      throw new Error("no Change seat count button rendered");
    }

    await interact(() => setInputValue(seatInput, "3"));
    await interact(() => button.click());

    expect(container.textContent).toContain("Seat change scheduled");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("starter");
  });
});

describe("cancelling a subscription", () => {
  it("does not call cancelSubscription until the destructive click is confirmed", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue({ tier: "starter", seatLimit: 5, seatsUsed: 3, latestSubscription: subscription() });

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
      .mockResolvedValueOnce({ tier: "starter", seatLimit: 5, seatsUsed: 3, latestSubscription: subscription() })
      .mockResolvedValue({
        tier: "starter",
        seatLimit: 5,
        seatsUsed: 3,
        latestSubscription: subscription({ cancelRequested: true }),
      });
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
  it("shows the retry-in-progress warning and offers no seat-change form", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue({
      tier: "starter",
      seatLimit: 5,
      seatsUsed: 3,
      latestSubscription: subscription({ status: "PastDue" }),
    });

    const container = await render(page());

    expect(container.textContent).toContain("Payment retry in progress");
    expect(byText(container, "button", "Change seat count")).toBeNull();
    // Cancel is still offered - `decisions/0006`/`CancelSubscriptionHandler` allow cancelling a
    // PastDue subscription.
    expect(byText(container, "button", "Cancel subscription")).not.toBeNull();
  });
});
