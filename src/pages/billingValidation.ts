/**
 * `13-04`: a client-side seat-count check that catches an obvious typo before a round trip - UX-only,
 * the same "client-side check mirrors the server's own rule without trying to replicate every case"
 * posture `widgetConfigValidation.ts` already takes for its own hex-colour check.
 * `CreateCheckoutSessionHandler`/`ChangeSubscriptionSeatsHandler`'s own
 * `SubscriptionTierBands.TryResolveTier` calls are the real, authoritative gate - a false "looks
 * fine" here just means the server rejects it instead and `BillingPage` surfaces that `detail` text
 * unchanged, the identical fallback `WidgetConfigPage` already relies on for its own client-side
 * check.
 *
 * ## `25-23`: the bounds are arguments now, and the constants that used to be here are gone
 *
 * This module previously declared `MIN_SEATS = 2` and **`MAX_SEATS = 100`** as its own copy of
 * `SubscriptionTierBands.MinSeats`/`MaxSeats`. The comment claimed it "mirrors" them. It did not:
 * `SubscriptionTierBands.MaxSeats` is **5**. The console was locally accepting - and advertising, in
 * `billingSeatCountFieldDescription` - a seat count twenty times past the largest one
 * `TryResolveTier` resolves at all, so every value in `6..100` passed this check and was then
 * refused by the server.
 *
 * That is the failure mode a hand-copied constant has and a sourced one does not, so the copy is
 * deleted rather than corrected: `25-23` put the real bands on `GET .../billing/status`
 * (`BillingSeatPricingDto.minSeats`/`maxSeats`), and the caller passes what the server said. The
 * alternative - correcting `100` to `5` and leaving the constants here - would have fixed today's
 * drift and rebuilt the exact mechanism that produced it.
 */
export function isValidSeatCount(value: number, minSeats: number, maxSeats: number): boolean {
  return Number.isInteger(value) && value >= minSeats && value <= maxSeats;
}
