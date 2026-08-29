import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

/**
 * `13-04`: the console billing screen's own wire contract - `Ago.Chat.Api.Billing.BillingEndpoints`
 * (`ago-chat`), read directly from that file's own C# source rather than reconstructed from prose, the
 * same discipline `18-01`'s own console worker used after finding a real contract gap the same way.
 *
 * `GET /api/v1/sites/{siteId}/billing/status` did not exist before this item - `13-01`/`13-02`/`13-03`
 * all built write paths onto `Site.Tier`/`Site.SeatLimit`/`BillingSubscription`, but none of them built
 * the corresponding read a console screen needs, and no other endpoint in `ago-chat` incidentally
 * carries this shape (`GetSiteConfigById`'s own `SiteConfigDto` has no `Tier`/`SeatLimit` field at all;
 * `GetSeatAssignmentSummary` has `SeatLimit` but is gated on `site:manage-operators`, not
 * `site:configure`, and carries no `Tier` or subscription id). This gap was real and would have blocked
 * this item even at its original upgrade-only scope, not only the downgrade/cancel expansion - so it
 * was added to `ago-chat` as its own small, additive change alongside this one, in the same spirit
 * `13-01`'s own "state a real gap here rather than silently working around it" precedent already
 * established for the identical situation.
 */
export type BillingSubscriptionStatusDto = "Pending" | "Succeeded" | "Failed" | "PastDue" | "Lapsed";

/**
 * `Ago.Chat.Application.UseCases.GetBillingStatus.BillingSubscriptionSummaryDto`'s own wire shape,
 * camelCase per ASP.NET Core's default `System.Text.Json` policy (`OperatorPermissionsResponse`'s own
 * precedent, `operatorsApi.ts`). `status` is a real, honest signal, not a guess: `"Pending"` is what
 * this screen polls after returning from ЮKassa's hosted checkout, and only a transition away from it -
 * to `"Succeeded"` or `"Failed"` - is ever shown as a settled outcome.
 */
export interface BillingSubscriptionSummaryDto {
  subscriptionId: string;
  status: BillingSubscriptionStatusDto;
  requestedSeats: number;
  tier: string;
  cancelRequested: boolean;
  currentPeriodEnd: string | null;
  pendingSeatCount: number | null;
  pendingTier: string | null;
}

/** `GetBillingStatus.BillingStatusDto`'s own wire shape. `latestSubscription` is `null` only for a
 * site that has never started a checkout - still free by construction (`13-01`'s own default). */
export interface BillingStatusDto {
  tier: string;
  seatLimit: number;
  seatsUsed: number;
  latestSubscription: BillingSubscriptionSummaryDto | null;
}

/** `CreateCheckoutSession.CheckoutSessionDto`'s own wire shape - `confirmationUrl` is ЮKassa's hosted
 * checkout page, never itself proof of payment (`roadmap.md`'s "never the redirect alone"). */
export interface CheckoutSessionDto {
  confirmationUrl: string;
}

/**
 * `ChangeSubscriptionSeats.ChangeSubscriptionSeatsResult`'s own two shapes, told apart on the wire by
 * which fields are present - `proratedAmountRub` only ever appears on an immediate, charged upgrade
 * (`Upgraded`); a deferred downgrade (`DowngradeScheduled`) carries no amount field at all, because no
 * charge was made. A discriminated union keyed on that field's presence, not a separate `kind` string
 * the C# side does not send - `ChangeSubscriptionSeatsResult` has no such discriminator either (two
 * sealed records, told apart by their own shape).
 */
export type ChangeSubscriptionSeatsResponseDto =
  | { proratedAmountRub: number; newTier: string; newSeatCount: number }
  | { newTier: string; newSeatCount: number };

/** `CancelSubscription.CancelSubscriptionResult`'s own wire shape - `paidThroughUntil` is what this
 * screen shows: "your paid tier runs until this date, then downgrades" (`decisions/0006`'s own
 * wording, `ago-chat`). */
export interface CancelSubscriptionResponseDto {
  paidThroughUntil: string | null;
}

async function billingFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    }),
  });

  if (!response.ok) {
    // `ApiProblemError`, not a bespoke error class - `sitesApi.ts#eraseSite`'s own precedent for a
    // new write in this codebase: the RFC 7807 shape every `ago-chat` endpoint already carries, and
    // nothing here branches on a `type` code narrowly enough to want its own subclass.
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as T;
}

export function fetchBillingStatus(accessToken: string, siteId: string): Promise<BillingStatusDto> {
  return billingFetch<BillingStatusDto>(accessToken, `/api/v1/sites/${siteId}/billing/status`);
}

export function createCheckoutSession(
  accessToken: string,
  siteId: string,
  requestedSeats: number,
): Promise<CheckoutSessionDto> {
  return billingFetch<CheckoutSessionDto>(accessToken, `/api/v1/sites/${siteId}/billing/checkout-sessions`, {
    method: "POST",
    body: JSON.stringify({ requestedSeats }),
  });
}

export function changeSubscriptionSeats(
  accessToken: string,
  siteId: string,
  subscriptionId: string,
  requestedSeats: number,
): Promise<ChangeSubscriptionSeatsResponseDto> {
  return billingFetch<ChangeSubscriptionSeatsResponseDto>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${subscriptionId}/seats`,
    { method: "POST", body: JSON.stringify({ requestedSeats }) },
  );
}

export function cancelSubscription(
  accessToken: string,
  siteId: string,
  subscriptionId: string,
): Promise<CancelSubscriptionResponseDto> {
  return billingFetch<CancelSubscriptionResponseDto>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${subscriptionId}/cancel`,
    { method: "POST" },
  );
}

export { ApiProblemError };
