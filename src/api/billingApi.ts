import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

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
  /** `26-299`: the identical shape `pendingSeatCount` already has, for a scheduled next-period
   * Administrator-count change (`SetNextPeriodComposition`) - `null` when none is scheduled. */
  pendingAdminCount: number | null;
}

/**
 * `25-23`: `Ago.Chat.Domain.SubscriptionTierBands`' own currently-effective numbers plus the two
 * seat price keys' currently-published amounts, carried on the billing status so this screen never
 * hand-types a second copy of the grid (`GetBillingStatus.BillingSeatPricingDto`).
 *
 * **This is what replaced `billingSeatCountFieldDescription`'s old hand-typed "От 2 до 100 мест".**
 * That copy was stale in a way nothing here could have caught: `SubscriptionTierBands.MaxSeats` is
 * **5**, not 100, so the console was advertising - and its own `billingValidation.ts` was locally
 * accepting - a seat count four times past what `TryResolveTier` will resolve at all. Reading
 * `minSeats`/`maxSeats` off the server closes both halves of that at once, the same "sourced, not
 * retyped" discipline `25-20`'s price-list screen already follows.
 */
export interface BillingSeatPricingDto {
  minSeats: number;
  maxSeats: number;
  baseSeats: number;
  freeSeatsIncluded: number;
  baseSeatPriceRub: number;
  pricePerExtraSeatRub: number;
  billingPeriodDays: number;
}

/**
 * `26-299`: every `ChannelKind` (`Ago.Chat.Domain`) this console's billing screen is authorised to
 * sell - the author's own final business call (`billing-v2-mockup.html`'s own `OFFERED` list):
 * Telegram and MAX only, ₽100/mo each. Every other kind (VK, Email, WhatsApp, Avito, SMS) is either
 * free or not yet available as a billed add-on and is deliberately never offered a buy row here - the
 * website/widget is not a `ChannelKind` at all (it is the included built-in, `ChannelKind`'s own
 * remarks in `ago-chat`).
 */
export type OfferedChannelKind = "Telegram" | "Max";

/**
 * `26-299`/`26-304`: `Ago.Chat.Domain.ChannelKind`'s own wire representation for the three billing
 * shapes this file talks to (`BillingConnectedChannelDto.Kind`, `PurchaseChannelAddOnRequest.ChannelKind`,
 * `PreviewBillingPurchaseRequest.ChannelKind`). `26-299` shipped these typed as the bare C# enum with no
 * `JsonStringEnumConverter` registered anywhere in `ago-chat` - by `System.Text.Json`'s own documented
 * default that meant the **numeric** ordinal, not the member-name string every other `ChannelKind` DTO
 * in this codebase carries (`ChannelIdentityDto.kind`, `RequestedChannelLink.kind`) - a real,
 * unverified contract risk this file used to flag and route around with a numeric `CHANNEL_KIND_WIRE_VALUE`
 * map. `26-304` (`ago-chat`) fixed that at the source: `ChannelKind` and `BillingPurchaseKind` now
 * serialise/deserialise as their **member-name string** on this endpoint family, matching this
 * codebase's own convention everywhere else - so this file sends `OfferedChannelKind`'s own string
 * value directly (`"Telegram"`/`"Max"`), no translation table needed any more.
 */
function decodeChannelKind(wireValue: unknown): string {
  if (typeof wireValue === "string") {
    return wireValue;
  }
  // `26-304` made the string the canonical wire shape - this numeric branch is kept only as a harmless
  // defensive fallback (a pre-`26-304` deploy still running, or a genuinely unrecognised value), never
  // expected to fire against a current backend. `Ago.Chat.Domain.ChannelKind`'s own declared member
  // order, for exactly that legacy case.
  const legacyOrdinalName: Readonly<Record<number, string>> = {
    0: "Max",
    1: "Sms",
    2: "Telegram",
    3: "WhatsApp",
    4: "Vk",
    5: "Avito",
    6: "Email",
  };
  if (typeof wireValue === "number" && wireValue in legacyOrdinalName) {
    return legacyOrdinalName[wireValue];
  }
  // Neither a recognised ordinal nor a string - a genuinely unrecognised wire value, not something
  // worth `String()`-coercing (which would print "[object Object]" for anything shaped that way).
  return "unknown";
}

/** `26-299`: one connected channel option, as the console's per-kind renew toggle needs it -
 * `subscriptionId` is what a "stop renewing this channel" toggle calls the existing
 * `cancelSubscription` with. `kind` is always the decoded member name (`"Telegram"`) by the time it
 * reaches this interface - see `decodeChannelKind` above for why the wire value itself is not
 * trusted to already be one. */
export interface BillingConnectedChannelDto {
  kind: string;
  subscriptionId: string;
  cancelRequested: boolean;
  currentPeriodEnd: string | null;
}

/** `GetBillingStatus.BillingStatusDto`'s own wire shape. `latestSubscription` is `null` only for a
 * site that has never started a checkout - still free by construction (`13-01`'s own default).
 *
 * `25-23` added six fields, all of them server facts this screen renders and never recomputes:
 * `tierDisplayName` is the grid's own name for `tier` (mapped server-side - see `BillingStatusDto`'s
 * own C# remarks for why there rather than here), `adminLimit`/`adminsUsed` are the Administrator pair
 * `ago-business 0011` counts separately from Operator seats, and `extraAdministratorsPurchased` is
 * `25-41`'s own persisted purchase count - the one number that makes the included-in-tier vs
 * bought-beyond-it split showable rather than guessed at. `adminExtraPriceRub` is `null` exactly when
 * that price key has never been published (`25-43`'s own "built, not yet for sale" state), which this
 * screen renders as an absence, never as ₽0.
 *
 * `26-299` added five more, every one additive (`api-design.md`'s "add within a version, never remove
 * or rename"): `channelCount`/`channelAddOnPriceRub` describe the connected-channel add-on the same
 * "sourced count plus sourced price" way the seat/Administrator pairs above already do;
 * `nextChargeRub` is the predictable recurring total the *base* subscription will next be charged
 * (already recomputed server-side from a scheduled next-period composition when one exists - see the
 * C# type's own remarks - never something this screen re-derives for the charge itself);
 * `hasStoredPaymentMethod` is what gates every instant, charge-now purchase this screen offers; and
 * `connectedChannels` replaces a bare count with the actual channel rows a per-kind renew toggle
 * needs (`channelCount` stays, unchanged, for whatever already only wants the number). */
export interface BillingStatusDto {
  tier: string;
  seatLimit: number;
  seatsUsed: number;
  latestSubscription: BillingSubscriptionSummaryDto | null;
  tierDisplayName: string;
  adminLimit: number;
  adminsUsed: number;
  extraAdministratorsPurchased: number;
  seatPricing: BillingSeatPricingDto;
  adminExtraPriceRub: number | null;
  channelCount: number;
  channelAddOnPriceRub: number | null;
  nextChargeRub: number | null;
  hasStoredPaymentMethod: boolean;
  connectedChannels: BillingConnectedChannelDto[];
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

/**
 * `25-41`'s own `PurchaseAdministratorSlot.PurchaseAdministratorSlotResult` wire shape - unlike
 * `ChangeSubscriptionSeatsResponseDto` above, this is a single record, never a discriminated union:
 * `PurchaseAdministratorSlotHandler`'s own remarks say this endpoint is *only ever* an immediate,
 * charged increase (no deferred-downgrade branch exists for Administrator slots at all), so
 * `proratedAmountRub` is always present.
 */
export interface PurchaseAdministratorSlotResponseDto {
  proratedAmountRub: number;
  newExtraAdministratorCount: number;
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

/**
 * `23-118`/`23-99`: the runtime shape the billing-status read promises. Every field is
 * present-but-nullable (none is `?`), so all ten are required keys. Dropped, `seatsUsed`/`seatLimit`/
 * `adminsUsed`/`adminLimit` render as a blank or `NaN` seat count and `tier`/`tierDisplayName` as a
 * blank tier - the false/blank state the `23-99` bound names for a status object whose absent field
 * silently renders empty, never a thrown error the screen could tell apart from a real value.
 */
const billingStatusRequiredKeys = requiredKeysOf<BillingStatusDto>({
  tier: true,
  seatLimit: true,
  seatsUsed: true,
  latestSubscription: true,
  tierDisplayName: true,
  adminLimit: true,
  adminsUsed: true,
  extraAdministratorsPurchased: true,
  seatPricing: true,
  adminExtraPriceRub: true,
  channelCount: true,
  channelAddOnPriceRub: true,
  nextChargeRub: true,
  hasStoredPaymentMethod: true,
  connectedChannels: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `ApiProblemError` - the same type `billingFetch` already
 * produces (`problemDetailsFrom`), so `BillingPage`'s existing `catch` needs no second error
 * vocabulary (mirrors `maxChannelApi.ts#rethrowAsApiProblem`).
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

/** `26-299`: `connectedChannels[].kind` is decoded before anything else sees it - see
 * `decodeChannelKind`'s own remarks for why the wire value cannot be trusted to already be the
 * member-name string every other reader of this response expects. Applied to the raw, not-yet-typed
 * body, ahead of `assertHasKeys` below, so the shape-mismatch check still runs against something that
 * genuinely satisfies `BillingStatusDto` once it passes. */
function normalizeConnectedChannels(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("connectedChannels" in body)) {
    return body;
  }
  const rawChannels = body.connectedChannels;
  if (!Array.isArray(rawChannels)) {
    return body;
  }
  // `Array.isArray`'s own type predicate narrows to `any[]`, not `unknown[]` - re-annotated here so
  // the `.map` below stays honestly `unknown`-typed rather than silently leaking `any` into its
  // return value (`@typescript-eslint/no-unsafe-return`'s own reason for flagging that leak).
  const channels: unknown[] = rawChannels;
  return {
    ...body,
    connectedChannels: channels.map((entry) =>
      typeof entry === "object" && entry !== null && "kind" in entry ? { ...entry, kind: decodeChannelKind(entry.kind) } : entry,
    ),
  };
}

export async function fetchBillingStatus(accessToken: string, siteId: string): Promise<BillingStatusDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/billing/status`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = normalizeConnectedChannels(await response.json());
  try {
    assertHasKeys<BillingStatusDto>(body, billingStatusRequiredKeys, "GET /api/v1/sites/{siteId}/billing/status");
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body;
}

/** `26-299`: `savePaymentMethod` is the operator's own checkout-time choice, not a decision this
 * client may keep making for them by always sending `true` - `CreateCheckoutSession`'s own C# remarks
 * state why declining to save a card is a real, informed trade-off (never a reusable card token) that
 * every later instant purchase on this screen then depends on having been made the other way. */
export function createCheckoutSession(
  accessToken: string,
  siteId: string,
  requestedSeats: number,
  savePaymentMethod: boolean,
): Promise<CheckoutSessionDto> {
  return billingFetch<CheckoutSessionDto>(accessToken, `/api/v1/sites/${siteId}/billing/checkout-sessions`, {
    method: "POST",
    body: JSON.stringify({ requestedSeats, savePaymentMethod }),
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

/** `25-41`'s own endpoint - `POST .../billing/subscriptions/{id}/administrators`, `BillingEndpoints`'s
 * `PurchaseAdministratorSlotRequest(int RequestedExtraAdministrators)`. Same "absolute count, not a
 * delta" contract `changeSubscriptionSeats` above uses for `requestedSeats`: the caller adds the
 * quantity chosen to `status.extraAdministratorsPurchased` before calling this, the identical shape
 * `BillingPage`'s existing seat-purchase call already follows for `seatLimit`. */
export function purchaseAdministratorSlot(
  accessToken: string,
  siteId: string,
  subscriptionId: string,
  requestedExtraAdministrators: number,
): Promise<PurchaseAdministratorSlotResponseDto> {
  return billingFetch<PurchaseAdministratorSlotResponseDto>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${subscriptionId}/administrators`,
    { method: "POST", body: JSON.stringify({ requestedExtraAdministrators }) },
  );
}

/** `26-278`/`26-299`: the identical prorated, charge-then-apply purchase shape
 * `purchaseAdministratorSlot` above uses, restated for a connected-channel add-on -
 * `{baseSubscriptionId}` is the site's own base `BillingSubscription`, never an option row
 * (`PurchaseChannelAddOnHandler`'s own guard). The response's own echoed `channelKind` is
 * deliberately not read back here - the caller already knows which `OfferedChannelKind` it just
 * bought, and `decodeChannelKind`'s own remarks are the reason not to lean on an ambiguous echoed
 * field when the caller does not have to. */
export interface PurchaseChannelAddOnResponseDto {
  proratedAmountRub: number;
  optionSubscriptionId: string;
}

export function purchaseChannelAddOn(
  accessToken: string,
  siteId: string,
  baseSubscriptionId: string,
  channelKind: OfferedChannelKind,
): Promise<PurchaseChannelAddOnResponseDto> {
  return billingFetch<{ proratedAmountRub: number; optionSubscriptionId: string }>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${baseSubscriptionId}/channels`,
    // `26-304`: `ChannelKind`'s own member-name string on the wire - see `decodeChannelKind`'s own
    // remarks for what this replaced.
    { method: "POST", body: JSON.stringify({ channelKind }) },
  );
}

/** `26-299`: `SetNextPeriodComposition.SetNextPeriodCompositionResult`'s own wire shape - echoes back
 * what was actually recorded, resolved against `SubscriptionTierBands.TryResolveTier` server-side. */
export interface SetNextPeriodCompositionResponseDto {
  tier: string;
  requestedSeats: number;
  requestedExtraAdministrators: number;
}

/** `26-299`: the console billing-v2 "Card B" write - plans the base subscription's whole next-period
 * seat/Administrator composition in one call, in either direction, charging nothing now
 * (`SetNextPeriodCompositionHandler`'s own remarks: only `PendingSeatCount`/`PendingTier`/
 * `PendingAdminCount` move; `Site` itself changes only at a real renewal). Only ever reachable on an
 * already `Succeeded`/`PastDue` base subscription - a site with none yet has no next period to plan,
 * and reaches Business for the first time through `createCheckoutSession` instead. */
export function setNextPeriodComposition(
  accessToken: string,
  siteId: string,
  subscriptionId: string,
  requestedSeats: number,
  requestedExtraAdministrators: number,
): Promise<SetNextPeriodCompositionResponseDto> {
  return billingFetch<SetNextPeriodCompositionResponseDto>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${subscriptionId}/next-period`,
    { method: "POST", body: JSON.stringify({ requestedSeats, requestedExtraAdministrators }) },
  );
}

/** `26-299`: `PreviewBillingPurchase.BillingPurchasePreviewResult`'s own wire shape - the exact number
 * an actual purchase of this shape would charge right now, and what it adds to the recurring total
 * from the next period onward, computed server-side at this type's own `BillingProration` floor rule
 * so «Докупить за ₽X» can never honestly disagree with what pressing the button actually charges. */
export interface BillingPurchasePreviewResultDto {
  chargedNowRub: number;
  thenRecurringRub: number;
  includedUntil: string;
}

/** `26-299`: the one discriminated request `previewBillingPurchase` below flattens onto - `Kind`
 * decides which of the other three fields the handler actually reads; the caller sends only the one
 * relevant to the kind being asked about. */
export type BillingPurchasePreviewRequest =
  | { kind: "Seats"; requestedSeats: number }
  | { kind: "Administrators"; requestedExtraAdministrators: number }
  | { kind: "Channel"; channelKind: OfferedChannelKind };

/** `26-299`: a read, never a charge - `.../purchase-preview`'s own `POST`, not a `GET`, because the
 * query shape (a discriminated kind plus whichever one field it needs) is naturally a request body
 * (`PreviewBillingPurchaseEndpoint`'s own C# remarks). This is what every «Докупить за ₽X» amount in
 * Card A is sourced from - never a client-computed proration, per `CLAUDE.md` rule 8 (a
 * compare-and-set-adjacent number comes from the server, not a local guess).
 *
 * `26-304`: `Kind` (`BillingPurchaseKind`) and `ChannelKind` both go on the wire as their own
 * member-name string (`"Seats"`/`"Administrators"`/`"Channel"`, `"Telegram"`/`"Max"`) - `request.kind`
 * and `OfferedChannelKind`'s own values are already exactly those strings, so no translation table is
 * needed (`decodeChannelKind`'s own remarks cover the identical fix for the response side). */
export function previewBillingPurchase(
  accessToken: string,
  siteId: string,
  subscriptionId: string,
  request: BillingPurchasePreviewRequest,
): Promise<BillingPurchasePreviewResultDto> {
  const body =
    request.kind === "Seats"
      ? { kind: request.kind, requestedSeats: request.requestedSeats }
      : request.kind === "Administrators"
        ? { kind: request.kind, requestedExtraAdministrators: request.requestedExtraAdministrators }
        : { kind: request.kind, channelKind: request.channelKind };

  return billingFetch<BillingPurchasePreviewResultDto>(
    accessToken,
    `/api/v1/sites/${siteId}/billing/subscriptions/${subscriptionId}/purchase-preview`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export { ApiProblemError };
