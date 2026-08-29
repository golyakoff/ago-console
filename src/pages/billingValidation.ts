/**
 * `13-04`: mirrors `Ago.Chat.Domain.SubscriptionTierBands.MinSeats`/`MaxSeats` (2-100) closely enough
 * to catch an obvious typo before a round trip - UX-only, the same "client-side check mirrors the
 * server's own rule without trying to replicate every case" posture `widgetConfigValidation.ts`
 * already takes for its own hex-colour check. `CreateCheckoutSessionHandler`/
 * `ChangeSubscriptionSeatsHandler`'s own `SubscriptionTierBands.TryResolveTier` calls are the real,
 * authoritative gate - a false "looks fine" here just means the server rejects it instead and
 * `BillingPage` surfaces that `detail` text unchanged, the identical fallback `WidgetConfigPage`
 * already relies on for its own client-side check.
 */
export const MIN_SEATS = 2;
export const MAX_SEATS = 100;

export function isValidSeatCount(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_SEATS && value <= MAX_SEATS;
}
