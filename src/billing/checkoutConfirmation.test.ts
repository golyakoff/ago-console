import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCheckoutConfirmation } from "./checkoutConfirmation.js";
import type { BillingStatusDto } from "../api/billingApi.js";

const billingApi = vi.hoisted(() => ({ fetchBillingStatus: vi.fn() }));
vi.mock("../api/billingApi.js", () => billingApi);

/** `25-23` grew `BillingStatusDto` by six fields. Nothing `checkCheckoutConfirmation` reads is among
 * them - it looks at `latestSubscription.status` and nothing else - so they are filled in here only
 * to keep the fixture a real `BillingStatusDto` rather than a partial cast, which would have let a
 * future field go missing silently. */
function statusWith(latestSubscription: BillingStatusDto["latestSubscription"]): BillingStatusDto {
  return {
    tier: "starter",
    seatLimit: 5,
    seatsUsed: 2,
    latestSubscription,
    tierDisplayName: "Business",
    adminLimit: 2,
    adminsUsed: 1,
    extraAdministratorsPurchased: 0,
    seatPricing: {
      minSeats: 2,
      maxSeats: 5,
      baseSeats: 3,
      freeSeatsIncluded: 2,
      baseSeatPriceRub: 490,
      pricePerExtraSeatRub: 200,
      billingPeriodDays: 30,
    },
    adminExtraPriceRub: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkCheckoutConfirmation", () => {
  it("reads 'pending' from a Pending subscription", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      statusWith({
        subscriptionId: "sub-1",
        status: "Pending",
        requestedSeats: 5,
        tier: "starter",
        cancelRequested: false,
        currentPeriodEnd: null,
        pendingSeatCount: null,
        pendingTier: null,
      }),
    );

    await expect(checkCheckoutConfirmation("token", "site-1")).resolves.toBe("pending");
  });

  it("reads 'confirmed' from a Succeeded subscription", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      statusWith({
        subscriptionId: "sub-1",
        status: "Succeeded",
        requestedSeats: 5,
        tier: "starter",
        cancelRequested: false,
        currentPeriodEnd: "2026-09-28T12:00:00Z",
        pendingSeatCount: null,
        pendingTier: null,
      }),
    );

    await expect(checkCheckoutConfirmation("token", "site-1")).resolves.toBe("confirmed");
  });

  it("reads 'failed' from a Failed subscription - never read as confirmed", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(
      statusWith({
        subscriptionId: "sub-1",
        status: "Failed",
        requestedSeats: 5,
        tier: "starter",
        cancelRequested: false,
        currentPeriodEnd: null,
        pendingSeatCount: null,
        pendingTier: null,
      }),
    );

    await expect(checkCheckoutConfirmation("token", "site-1")).resolves.toBe("failed");
  });

  it("reads 'unknown' when the site has no subscription at all", async () => {
    billingApi.fetchBillingStatus.mockResolvedValue(statusWith(null));

    await expect(checkCheckoutConfirmation("token", "site-1")).resolves.toBe("unknown");
  });

  it("folds a network/API failure into 'unknown' rather than throwing - a poll loop needs a function that never rejects", async () => {
    billingApi.fetchBillingStatus.mockRejectedValue(new Error("network drop"));

    await expect(checkCheckoutConfirmation("token", "site-1")).resolves.toBe("unknown");
  });
});
