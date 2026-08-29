import { fetchBillingStatus } from "../api/billingApi.js";

/**
 * `13-04`: what a single poll tick learns about a checkout that has not yet been confirmed by
 * ЮKassa's webhook - three states rather than a boolean, the identical "not yet done and cannot tell
 * are different facts" reasoning `erasureCheck.ts`'s own `ErasureCheckOutcome` already establishes for
 * `16-02`'s analogous poll-until-real-completion problem.
 *
 * - `"pending"` - the site's own `latestSubscription.status` still reads `"Pending"`. `13-02`'s own
 *   checkout-session creation never touches `Site.Tier`/`Site.SeatLimit` itself, only a verified
 *   webhook does (`CreateCheckoutSessionHandler`'s own remarks) - this is the state a caller returning
 *   from ЮKassa's hosted checkout should expect to see immediately, not an error.
 * - `"confirmed"` - the webhook landed and applied a `"Succeeded"` outcome. The one state this screen
 *   is willing to render as done.
 * - `"failed"` - the webhook landed with a `"Failed"` outcome (ЮKassa declined the payment). Also a
 *   settled state - polling forever on a payment that will never succeed would strand the operator on
 *   a spinner - but never confused with `"confirmed"`.
 * - `"unknown"` - a network failure, or a subscription in some other status (`"PastDue"`/`"Lapsed"`,
 *   which cannot be the *latest* row immediately after a fresh checkout, or no subscription at all).
 *   **Never** treated as `"confirmed"` - the same false-completion bug `erasureCheck.ts`'s own remarks
 *   name for its analogous case.
 */
export type CheckoutConfirmationOutcome = "pending" | "confirmed" | "failed" | "unknown";

/**
 * Reads `GET /billing/status` and folds the result into a `CheckoutConfirmationOutcome`. Never throws -
 * `fetchBillingStatus`'s own `ApiProblemError`/network failure is caught and folded into `"unknown"`,
 * the identical "say nothing, tick again" contract `checkOperatorErasure`'s own doc comment states for
 * the reason a poll loop needs a function that never rejects.
 */
export async function checkCheckoutConfirmation(accessToken: string, siteId: string): Promise<CheckoutConfirmationOutcome> {
  try {
    const status = await fetchBillingStatus(accessToken, siteId);
    switch (status.latestSubscription?.status) {
      case "Pending":
        return "pending";
      case "Succeeded":
        return "confirmed";
      case "Failed":
        return "failed";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}
