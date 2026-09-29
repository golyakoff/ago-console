import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  cancelSubscription,
  changeSubscriptionSeats,
  createCheckoutSession,
  fetchBillingStatus,
  previewBillingPurchase,
  purchaseAdministratorSlot,
  purchaseChannelAddOn,
  setNextPeriodComposition,
  type BillingConnectedChannelDto,
  type BillingSeatPricingDto,
  type BillingStatusDto,
  type BillingSubscriptionSummaryDto,
} from "../api/billingApi.js";
import { checkCheckoutConfirmation } from "../billing/checkoutConfirmation.js";
import type { CheckoutConfirmationOutcome } from "../billing/checkoutConfirmation.js";
import { usePollUntilCheckoutSettled } from "../billing/usePollUntilCheckoutSettled.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Badge, type BadgeTone } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { shapeMismatchMessage } from "./apiErrorMessage.js";

/** `13-04`: this screen's own gate - every billing endpoint below is gated server-side on the
 * identical permission (`Ago.Chat.Domain.Permission.SiteConfigure`), the same category `5-08` already
 * put "site configuration" screens under. Client-side, this is UX only - the real gate is the
 * server's own check on every call. */
export const BILLING_PERMISSION = "site:configure";

const CHECKOUT_POLL_INTERVAL_MS = 3_000;

/** The smallest quantity any "докупить"/buy-row stepper can name - one is the smallest purchase that
 * means anything, the identical floor `25-23`'s own `MIN_SEATS_TO_ADD` established for the `26-294`
 * page this rebuilds. */
const MIN_QUANTITY = 1;

/** `26-300`: `PurchaseAdministratorSlotHandler`/`SetNextPeriodCompositionHandler` both enforce only
 * "the requested extra-Administrator count is not negative" - no `SubscriptionTierBands`-style band
 * the way Operator seats have one. This is a UI-only ceiling for the `<select>` these two controls
 * render (a dropdown needs a finite option list), never a number this screen tells the server about -
 * a quantity beyond it is simply not offered as a menu item, not refused as invalid. */
const ADMIN_EXTRA_UI_MAX = 10;

function rub(amount: number): string {
  return `₽${amount.toFixed(2)}`;
}

function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value++) {
    values.push(value);
  }
  return values;
}

/** `Ago.Chat.Domain.ChannelKind`'s own display names. `src/owner/ownerSites.ts` keeps the identical
 * mapping for the owner's own screens - copied locally rather than imported, the same "a channel kind
 * is shared vocabulary, but `owner/` and `pages/` stay their own modules" precedent
 * `CalendarClientDetailPage.tsx`'s own local `channelKindLabel` copy already sets for an analogous
 * small enum-label helper. Reuses the exact `ownerChannelKind*` string keys rather than a second,
 * billing-specific translation of the same handful of proper nouns. */
function channelKindLabel(kind: string, strings: ConsoleStrings): string {
  if (kind === "Max") {
    return strings.ownerChannelKindMax;
  }
  if (kind === "Telegram") {
    return strings.ownerChannelKindTelegram;
  }
  if (kind === "Vk") {
    return strings.ownerChannelKindVk;
  }
  if (kind === "WhatsApp") {
    return strings.ownerChannelKindWhatsApp;
  }
  if (kind === "Avito") {
    return strings.ownerChannelKindAvito;
  }
  return kind;
}

/** `SubscriptionTierBands.ComputeSeatPriceRub`'s own formula, mirrored client-side for display only -
 * never sent to the server as a charge (every real charge in this screen is `previewBillingPurchase`'s
 * own server-computed number, `CLAUDE.md` rule 8). Used only to show what the *next period's own
 * recurring total* would be against a composition already confirmed by the server
 * (`nextChargeRub`/the pending fields it was computed from), so this can never honestly disagree with
 * what `GetBillingStatusHandler` itself already computed the identical way. */
function computeSeatPriceRub(seats: number, baseSeatPriceRub: number, pricePerExtraSeatRub: number, baseSeats: number): number {
  return baseSeatPriceRub + Math.max(0, seats - baseSeats) * pricePerExtraSeatRub;
}

function computeRecurringTotal(
  seats: number,
  extraAdministrators: number,
  renewingChannelCount: number,
  pricing: BillingSeatPricingDto,
  adminExtraPriceRub: number | null,
  channelAddOnPriceRub: number | null,
): number {
  const seatAmount = computeSeatPriceRub(seats, pricing.baseSeatPriceRub, pricing.pricePerExtraSeatRub, pricing.baseSeats);
  const adminAmount = extraAdministrators * (adminExtraPriceRub ?? 0);
  const channelAmount = renewingChannelCount * (channelAddOnPriceRub ?? 0);
  return seatAmount + adminAmount + channelAmount;
}

/** `26-300`: one row of the dense label/value grid Card C uses - `.ago-billing-facts` (`index.css`,
 * `26-294`) lays these out two-to-a-row on a wide viewport. `note` is the small, second-order fact
 * shown under the primary value - "included up to N" for the seat/admin pairs. */
function FactRow({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="ago-billing-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <span className="ago-billing-fact__note">{note}</span>}
    </div>
  );
}

/** `26-294`: Card 1's status badge, unchanged by this item - `latestSubscription.status` rendered as
 * one word plus colour, not a raw enum. A `null` subscription is the ordinary free-tier state, not an
 * error - `tone: "neutral"`. */
function subscriptionStatusBadge(
  sub: BillingSubscriptionSummaryDto | null,
  strings: ConsoleStrings,
): { tone: BadgeTone; label: string } {
  if (sub === null) {
    return { tone: "neutral", label: strings.billingStatusFreeLabel };
  }
  switch (sub.status) {
    case "Succeeded":
      return { tone: "success", label: strings.billingStatusActiveLabel };
    case "Pending":
      return { tone: "accent", label: strings.billingPendingTitle };
    case "Failed":
      return { tone: "danger", label: strings.billingFailedTitle };
    case "PastDue":
      return { tone: "danger", label: strings.billingStatusPastDueLabel };
    case "Lapsed":
      return { tone: "neutral", label: strings.billingStatusLapsedLabel };
  }
}

interface BuyQuantityRowProps {
  strings: ConsoleStrings;
  label: string;
  hint?: ReactNode;
  maxQuantity: number;
  notPriced?: boolean;
  atMaximum?: boolean;
  atMaximumNote?: string;
  preview: (qty: number) => Promise<number>;
  purchase: (qty: number) => Promise<number>;
  onPurchased: () => void;
}

/** `26-300`: one buyable dimension in the "Buy now" card - a quantity stepper plus one button whose
 * own caption is always `previewBillingPurchase`'s own `chargedNowRub` for the quantity currently
 * selected, refetched every time that quantity changes. Shared by the Operator and Administrator buy
 * rows (they differ only in label, bound, and which two closures the parent passes); the per-kind
 * channel rows use `BuyChannelRow` below instead, since a channel has no quantity to choose. */
function BuyQuantityRow({
  strings,
  label,
  hint,
  maxQuantity,
  notPriced,
  atMaximum,
  atMaximumNote,
  preview,
  purchase,
  onPurchased,
}: BuyQuantityRowProps) {
  const [qty, setQty] = useState(MIN_QUANTITY);
  // `26-300`: the last *settled* preview, keyed by the quantity it answers for - not two separate
  // `amount`/`loadingPreview` flags set synchronously at the top of the effect below
  // (`react-hooks/set-state-in-effect` refuses that shape: an effect may only set state from an async
  // callback, never synchronously during its own body). `loadingPreview`/`amount` are derived from
  // this below rather than tracked as their own state - "still loading" is simply "no settled answer
  // for the currently-selected quantity yet".
  const [resolvedPreview, setResolvedPreview] = useState<{ qty: number; amount: number | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  useEffect(() => {
    if (notPriced || atMaximum) {
      return;
    }
    let cancelled = false;
    preview(qty)
      .then((value) => {
        if (!cancelled) {
          setResolvedPreview({ qty, amount: value });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPreview({ qty, amount: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notPriced, atMaximum, preview, qty]);

  const loadingPreview = resolvedPreview === null || resolvedPreview.qty !== qty;
  const amount = !loadingPreview ? resolvedPreview.amount : null;

  if (notPriced) {
    return (
      <div className="ago-billing-buy-row">
        <div className="ago-billing-buy-row__info">
          <span className="ago-billing-buy-row__name">{label}</span>
        </div>
        <span className="ago-billing-note">{strings.billingNotPricedYetLabel}</span>
      </div>
    );
  }

  if (atMaximum) {
    return (
      <div className="ago-billing-buy-row">
        <div className="ago-billing-buy-row__info">
          <span className="ago-billing-buy-row__name">{label}</span>
        </div>
        <span className="ago-billing-note">{atMaximumNote}</span>
      </div>
    );
  }

  const handleBuy = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const charged = await purchase(qty);
      setSuccess(charged);
      setQty(MIN_QUANTITY);
      onPurchased();
    } catch (err) {
      setError(err instanceof ApiProblemError ? err.message : strings.billingBuyPurchaseError);
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel =
    submitting
      ? strings.billingBuySubmittingButton
      : loadingPreview || amount === null
        ? `${strings.billingBuyButtonLabel} (${strings.billingBuyPriceCalculating})`
        : `${strings.billingBuyButtonLabel} ${rub(amount)}`;

  return (
    <div className="ago-billing-buy-row">
      <div className="ago-billing-buy-row__info">
        <span className="ago-billing-buy-row__name">{label}</span>
        {hint && <span className="ago-billing-buy-row__price">{hint}</span>}
      </div>
      <div className="ago-billing-buy-row__controls">
        <Field label={strings.billingBuyQuantityLabel}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={qty}
              disabled={submitting}
              onChange={(event) => setQty(Number(event.target.value))}
            >
              {range(MIN_QUANTITY, maxQuantity).map((n) => (
                <option key={n} value={n}>{`+${n}`}</option>
              ))}
            </Select>
          )}
        </Field>
        <Button variant="primary" disabled={submitting || loadingPreview} onClick={() => void handleBuy()}>
          {buttonLabel}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {success !== null && (
        <Alert tone="success" title={strings.billingBuySuccessTitle}>
          {strings.billingBuySuccessBody} {rub(success)}.
        </Alert>
      )}
    </div>
  );
}

interface BuyChannelRowProps {
  strings: ConsoleStrings;
  displayName: string;
  connected: boolean;
  priced: boolean;
  preview: () => Promise<number>;
  purchase: () => Promise<number>;
  onPurchased: () => void;
}

/** `26-300`: the per-kind channel buy row - Telegram and MAX only (`billingApi.ts`'s own
 * `OfferedChannelKind` remarks), each its own row since a channel purchase has no quantity, only a
 * connect-or-not state. */
function BuyChannelRow({ strings, displayName, connected, priced, preview, purchase, onPurchased }: BuyChannelRowProps) {
  // `26-300`: the same "derive loading from a settled-or-not preview" shape `BuyQuantityRow` above
  // uses, for the identical `react-hooks/set-state-in-effect` reason - `null` means "not settled for
  // the current connected/priced combination yet".
  const [resolvedPreview, setResolvedPreview] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  useEffect(() => {
    if (connected || !priced) {
      return;
    }
    let cancelled = false;
    preview()
      .then((value) => {
        if (!cancelled) {
          setResolvedPreview(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPreview(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connected, priced, preview]);

  const loadingPreview = !connected && priced && resolvedPreview === null;
  const amount = resolvedPreview;

  const handleBuy = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const charged = await purchase();
      setSuccess(charged);
      onPurchased();
    } catch (err) {
      setError(err instanceof ApiProblemError ? err.message : strings.billingBuyPurchaseError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ago-billing-buy-row">
      <div className="ago-billing-buy-row__info">
        <span className="ago-billing-buy-row__name">{displayName}</span>
      </div>
      {connected ? (
        <span className="ago-billing-note">{strings.billingChannelConnectedLabel}</span>
      ) : !priced ? (
        <span className="ago-billing-note">{strings.billingNotPricedYetLabel}</span>
      ) : (
        <Button variant="primary" disabled={submitting || loadingPreview} onClick={() => void handleBuy()}>
          {submitting
            ? strings.billingBuySubmittingButton
            : loadingPreview || amount === null
              ? `${strings.billingChannelConnectButtonLabel} (${strings.billingBuyPriceCalculating})`
              : `${strings.billingChannelConnectButtonLabel} ${rub(amount)}`}
        </Button>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {success !== null && (
        <Alert tone="success" title={strings.billingBuySuccessTitle}>
          {strings.billingBuySuccessBody} {rub(success)}.
        </Alert>
      )}
    </div>
  );
}

interface ActiveNextPeriodPanelProps {
  strings: ConsoleStrings;
  timeZone: string;
  accessToken: string;
  siteId: string;
  status: BillingStatusDto;
  sub: BillingSubscriptionSummaryDto;
  onChanged: () => void;
  onRequestCancel: () => void;
}

/** `26-300`: the editable next-period composition for a site that already has a `Succeeded`/`PastDue`
 * base subscription - the one state `SetNextPeriodCompositionHandler`'s own top gate accepts a
 * composition change on at all. Every dropdown persists immediately on change (`setNextPeriodComposition`
 * charges nothing - only `PendingSeatCount`/`PendingAdminCount`/`PendingTier` move), then refetches
 * `status` - there is no separate "unsaved edit" state to reconcile, and the displayed total is always
 * `status.nextChargeRub` itself, never a locally-held guess of what the save is about to produce. */
function ActiveNextPeriodPanel({
  strings,
  timeZone,
  accessToken,
  siteId,
  status,
  sub,
  onChanged,
  onRequestCancel,
}: ActiveNextPeriodPanelProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [channelSavingId, setChannelSavingId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  const pricing = status.seatPricing;
  const effectiveSeats = sub.pendingSeatCount ?? sub.requestedSeats;
  const effectiveAdmins = sub.pendingAdminCount ?? status.extraAdministratorsPurchased;
  const renewingChannelCount = status.connectedChannels.filter((channel) => !channel.cancelRequested).length;

  // What is billing *today*, for the "vs. current charge" delta below - the identical formula
  // `GetBillingStatusHandler` itself uses for `nextChargeRub`, applied to the currently-billing
  // composition instead of the pending one, so the comparison is apples to apples.
  const currentTotal = computeRecurringTotal(
    sub.requestedSeats,
    status.extraAdministratorsPurchased,
    renewingChannelCount,
    pricing,
    status.adminExtraPriceRub,
    status.channelAddOnPriceRub,
  );
  const nextTotal = status.nextChargeRub;
  const delta = nextTotal !== null ? nextTotal - currentTotal : 0;

  const periodEndDate = sub.currentPeriodEnd ? parseInstant(sub.currentPeriodEnd) : null;

  async function persist(newSeats: number, newAdmins: number) {
    setSaving(true);
    setSaveError(null);
    try {
      await setNextPeriodComposition(accessToken, siteId, sub.subscriptionId, newSeats, newAdmins);
      onChanged();
    } catch (err) {
      setSaveError(err instanceof ApiProblemError ? err.message : strings.billingNextPeriodSaveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleChannelTurnOff(channel: BillingConnectedChannelDto) {
    setChannelSavingId(channel.subscriptionId);
    setChannelError(null);
    try {
      await cancelSubscription(accessToken, siteId, channel.subscriptionId);
      onChanged();
    } catch (err) {
      setChannelError(err instanceof ApiProblemError ? err.message : strings.billingNextPeriodChannelToggleError);
    } finally {
      setChannelSavingId(null);
    }
  }

  return (
    <div className="ago-stack">
      <p className="ago-billing-note">
        {strings.billingNextPeriodIntroActive} {periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}:
      </p>

      <div className="ago-billing-buy-row">
        <div className="ago-billing-buy-row__info">
          <span className="ago-billing-buy-row__name">{strings.billingOperatorSeatsHeading}</span>
        </div>
        <Field label={strings.billingOperatorSeatsHeading}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={effectiveSeats}
              disabled={saving}
              onChange={(event) => void persist(Number(event.target.value), effectiveAdmins)}
            >
              {range(pricing.minSeats, pricing.maxSeats).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="ago-billing-buy-row">
        <div className="ago-billing-buy-row__info">
          <span className="ago-billing-buy-row__name">{strings.billingAdminSeatsHeading}</span>
        </div>
        <Field label={strings.billingAdminSeatsHeading}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={effectiveAdmins}
              disabled={saving}
              onChange={(event) => void persist(effectiveSeats, Number(event.target.value))}
            >
              {range(0, ADMIN_EXTRA_UI_MAX).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {saveError && <Alert tone="danger">{saveError}</Alert>}

      <div className="ago-billing-channel-list">
        <label className="ago-row">
          <input type="checkbox" checked disabled />
          <span>{strings.billingWebsiteChannelName}</span>
        </label>
        {status.connectedChannels.map((channel) => (
          <label className="ago-row" key={channel.subscriptionId}>
            <input
              type="checkbox"
              checked={!channel.cancelRequested}
              disabled={channel.cancelRequested || channelSavingId === channel.subscriptionId}
              onChange={() => void handleChannelTurnOff(channel)}
            />
            <span>{channelKindLabel(channel.kind, strings)}</span>
          </label>
        ))}
      </div>
      {channelError && <Alert tone="danger">{channelError}</Alert>}

      <div className="ago-billing-total">
        <span>{strings.billingNextPeriodTotalLabel}</span>
        <strong>{nextTotal !== null && nextTotal > 0 ? rub(nextTotal) : strings.billingNextPeriodTotalFree}</strong>
      </div>
      {nextTotal !== null && delta !== 0 && (
        <p className="ago-billing-note">
          {strings.billingNextPeriodVsCurrentLabel} {delta > 0 ? "+" : "−"}
          {rub(Math.abs(delta))}
        </p>
      )}

      <p className="ago-billing-note">{strings.billingNextPeriodNote}</p>

      {!sub.cancelRequested && (
        <div className="ago-row">
          <Button variant="danger" size="sm" onClick={onRequestCancel}>
            {strings.billingCancelButton}
          </Button>
        </div>
      )}
    </div>
  );
}

interface CheckoutNextPeriodPanelProps {
  strings: ConsoleStrings;
  accessToken: string;
  siteId: string;
  pricing: BillingSeatPricingDto;
}

/** `26-300`: a site with no `Succeeded`/`PastDue` base subscription cannot call
 * `setNextPeriodComposition` (`SetNextPeriodCompositionHandler`'s own guard) or any instant-purchase
 * endpoint (all three need an existing stored payment method) - the *only* way onto Business is
 * `createCheckoutSession`. This panel is that entry point, doubling as "Next period" while on Solo (or
 * `Failed`/`Lapsed`) - complete with the one save-payment-method choice this screen ever asks for,
 * because `CreateCheckoutSessionRequest` is the only wire shape that carries it at all. */
function CheckoutNextPeriodPanel({ strings, accessToken, siteId, pricing }: CheckoutNextPeriodPanelProps) {
  const [seats, setSeats] = useState(pricing.minSeats);
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { confirmationUrl } = await createCheckoutSession(accessToken, siteId, seats, savePaymentMethod);
      // A real, full-page navigation to ЮKassa's hosted checkout - the component unmounts here on
      // success; `submitting` is only ever reset on the failure path below.
      window.location.href = confirmationUrl;
    } catch (err) {
      setError(err instanceof ApiProblemError ? err.message : strings.billingCheckoutError);
      setSubmitting(false);
    }
  };

  return (
    <form className="ago-stack" onSubmit={(event) => void handleSubmit(event)}>
      <p className="ago-billing-note">{strings.billingNextPeriodIntroNoSubscription}</p>

      <div className="ago-billing-transition">
        <strong>{strings.billingBusinessTransitionTitle}</strong>
        <span>
          {strings.billingBusinessTransitionBody} {rub(pricing.baseSeatPriceRub)}/{strings.billingPerMonthAbbrev}
        </span>
      </div>

      <Field label={strings.billingOperatorSeatsHeading}>
        {(controlProps) => (
          <Select
            {...controlProps}
            value={seats}
            disabled={submitting}
            onChange={(event) => setSeats(Number(event.target.value))}
          >
            {range(pricing.minSeats, pricing.maxSeats).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <label className="ago-row">
        <input
          type="checkbox"
          checked={savePaymentMethod}
          onChange={(event) => setSavePaymentMethod(event.target.checked)}
          disabled={submitting}
        />
        <span>{strings.billingSavePaymentMethodLabel}</span>
      </label>
      <p className="ago-billing-note">
        {savePaymentMethod ? strings.billingSavePaymentMethodHintOn : strings.billingSavePaymentMethodHintOff}
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? strings.billingSubscribingButton : strings.billingStartSubscriptionButton}
        </Button>
      </div>
    </form>
  );
}

/**
 * `26-300`: the full v2 rebuild of the `26-294` three-card page - see `strings.ts`'s own
 * `billingPanelTitle` remarks for the shape this rewrites and why "Buy now" and "Next period" are two
 * different actions rather than one. Reads `GET .../billing/status` (`26-299`'s five additive fields:
 * `channelCount`/`channelAddOnPriceRub`/`nextChargeRub`/`hasStoredPaymentMethod`/`connectedChannels`)
 * and writes through five endpoints: the two this screen already had
 * (`createCheckoutSession`/`cancelSubscription`), one whose shape changed
 * (`changeSubscriptionSeats`, now only ever called as an immediate upgrade - the downgrade branch
 * `26-294` used is superseded by `setNextPeriodComposition`, which covers both directions and
 * Administrators too), and three new ones (`purchaseAdministratorSlot`'s call site moved, plus
 * `purchaseChannelAddOn`, `setNextPeriodComposition`, `previewBillingPurchase`).
 *
 * The honest pending-then-confirmed mechanism `13-04` established is unchanged: `latestSubscription.status`
 * is polled while `"Pending"` (`usePollUntilCheckoutSettled`) and never claimed settled off the ЮKassa
 * redirect alone.
 */
export function BillingPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<BillingStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const accessToken = user?.access_token;

  const load = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchBillingStatus(accessToken, siteId)
      .then((dto) => {
        setStatus(dto);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(shapeMismatchMessage(err, strings) ?? (err instanceof ApiProblemError ? err.message : strings.billingLoadError)),
      );
  }, [accessToken, siteId, strings]);

  useEffect(() => {
    if (!hasPermission(BILLING_PERMISSION)) {
      return;
    }
    load();
  }, [load, hasPermission]);

  const sub = status?.latestSubscription ?? null;
  const isPending = sub?.status === "Pending";

  const checkConfirmation = useCallback((): Promise<CheckoutConfirmationOutcome> => {
    if (!accessToken || !siteId) {
      return Promise.resolve("unknown");
    }
    return checkCheckoutConfirmation(accessToken, siteId);
  }, [accessToken, siteId]);

  const onCheckoutSettled = useCallback(() => {
    load();
  }, [load]);

  usePollUntilCheckoutSettled(isPending, CHECKOUT_POLL_INTERVAL_MS, checkConfirmation, onCheckoutSettled);

  // `26-300`: Card A's own preview/purchase closures - `useCallback`, not inline arrows, so
  // `BuyQuantityRow`/`BuyChannelRow`'s own preview effect only refires when a real input (the
  // subscription id, or `status` itself) actually changes, not on every unrelated re-render of this
  // page.
  const subscriptionId = sub?.subscriptionId;

  const previewSeats = useCallback(
    (qty: number) => {
      if (!accessToken || !siteId || !subscriptionId || status === null) {
        return Promise.reject(new Error("billing status not loaded"));
      }
      return previewBillingPurchase(accessToken, siteId, subscriptionId, {
        kind: "Seats",
        requestedSeats: status.seatLimit + qty,
      }).then((result) => result.chargedNowRub);
    },
    [accessToken, siteId, subscriptionId, status],
  );
  const buySeats = useCallback(
    async (qty: number) => {
      if (!accessToken || !siteId || !subscriptionId || status === null) {
        throw new Error("billing status not loaded");
      }
      const response = await changeSubscriptionSeats(accessToken, siteId, subscriptionId, status.seatLimit + qty);
      // `ChangeSubscriptionSeatsResponseDto`'s own discriminated union - this call site is always an
      // increase (the quantity picker only ever adds), so the `Upgraded` shape (`proratedAmountRub`
      // present) is the only one that can come back; the fallback is defensive, never expected to run.
      return "proratedAmountRub" in response ? response.proratedAmountRub : 0;
    },
    [accessToken, siteId, subscriptionId, status],
  );

  const previewAdmins = useCallback(
    (qty: number) => {
      if (!accessToken || !siteId || !subscriptionId || status === null) {
        return Promise.reject(new Error("billing status not loaded"));
      }
      return previewBillingPurchase(accessToken, siteId, subscriptionId, {
        kind: "Administrators",
        requestedExtraAdministrators: status.extraAdministratorsPurchased + qty,
      }).then((result) => result.chargedNowRub);
    },
    [accessToken, siteId, subscriptionId, status],
  );
  const buyAdmins = useCallback(
    async (qty: number) => {
      if (!accessToken || !siteId || !subscriptionId || status === null) {
        throw new Error("billing status not loaded");
      }
      const response = await purchaseAdministratorSlot(accessToken, siteId, subscriptionId, status.extraAdministratorsPurchased + qty);
      return response.proratedAmountRub;
    },
    [accessToken, siteId, subscriptionId, status],
  );

  const previewTelegram = useCallback(() => {
    if (!accessToken || !siteId || !subscriptionId) {
      return Promise.reject(new Error("billing status not loaded"));
    }
    return previewBillingPurchase(accessToken, siteId, subscriptionId, { kind: "Channel", channelKind: "Telegram" }).then(
      (result) => result.chargedNowRub,
    );
  }, [accessToken, siteId, subscriptionId]);
  const buyTelegram = useCallback(async () => {
    if (!accessToken || !siteId || !subscriptionId) {
      throw new Error("billing status not loaded");
    }
    const response = await purchaseChannelAddOn(accessToken, siteId, subscriptionId, "Telegram");
    return response.proratedAmountRub;
  }, [accessToken, siteId, subscriptionId]);

  const previewMax = useCallback(() => {
    if (!accessToken || !siteId || !subscriptionId) {
      return Promise.reject(new Error("billing status not loaded"));
    }
    return previewBillingPurchase(accessToken, siteId, subscriptionId, { kind: "Channel", channelKind: "Max" }).then(
      (result) => result.chargedNowRub,
    );
  }, [accessToken, siteId, subscriptionId]);
  const buyMax = useCallback(async () => {
    if (!accessToken || !siteId || !subscriptionId) {
      throw new Error("billing status not loaded");
    }
    const response = await purchaseChannelAddOn(accessToken, siteId, subscriptionId, "Max");
    return response.proratedAmountRub;
  }, [accessToken, siteId, subscriptionId]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(BILLING_PERMISSION)) {
    return <AccessRefusal title={strings.billingTitle} message={strings.billingForbidden} strings={strings} />;
  }

  const pricing = status?.seatPricing ?? null;

  const handleCancelConfirm = async () => {
    if (!accessToken || !siteId || !sub) {
      return;
    }

    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await cancelSubscription(accessToken, siteId, sub.subscriptionId);
      setCancelConfirming(false);
      load();
    } catch (err) {
      setCancelError(err instanceof ApiProblemError ? err.message : strings.billingCancelError);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const periodEndDate = sub?.currentPeriodEnd ? parseInstant(sub.currentPeriodEnd) : null;
  const badge = subscriptionStatusBadge(sub, strings);

  // `26-300`: an instant "Buy now" purchase always needs an already-`Succeeded` subscription with a
  // stored payment method - `PastDue` is excluded too, the identical "a retrying subscription has a
  // more pressing question than a new purchase" reasoning `26-294`'s own add-seats control already
  // held for the same state.
  const canBuyNow = status !== null && sub !== null && sub.status === "Succeeded";
  const buyNowNoPaymentMethod = canBuyNow && status !== null && !status.hasStoredPaymentMethod;

  // `26-300`: `SetNextPeriodCompositionHandler`'s own top gate - `Succeeded` or `PastDue`.
  const canScheduleNextPeriod = status !== null && sub !== null && (sub.status === "Succeeded" || sub.status === "PastDue");

  const isBusiness = status !== null && status.tier !== "free";
  const includedOperators = status !== null && pricing !== null ? (isBusiness ? pricing.baseSeats : pricing.freeSeatsIncluded) : 0;
  const includedAdmins = status !== null ? status.adminLimit - status.extraAdministratorsPurchased : 0;

  const renewingChannelNames =
    status?.connectedChannels.filter((channel) => !channel.cancelRequested).map((channel) => channelKindLabel(channel.kind, strings)) ?? [];
  const channelsValue =
    renewingChannelNames.length > 0
      ? `${strings.billingWebsiteChannelName} + ${renewingChannelNames.join(", ")}`
      : strings.billingWebsiteChannelName;

  const opsAddable = status !== null && pricing !== null ? pricing.maxSeats - status.seatLimit : 0;

  return (
    <>
      <PageHead title={strings.billingTitle} description={strings.billingDescription} />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {status === null || pricing === null ? (
        loadError ? null : (
          <Panel>
            <Skeleton lines={3} label={strings.billingLoadingLabel} />
          </Panel>
        )
      ) : (
        <div className="ago-billing-grid">
          {/* Card C - "Текущий тариф" / Current plan. */}
          <Panel title={strings.billingPanelTitle} actions={<Badge tone={badge.tone}>{badge.label}</Badge>}>
            <div className="ago-stack">
              <dl className="ago-billing-facts">
                <FactRow label={strings.billingTierLabel} value={status.tierDisplayName} />
                <FactRow
                  label={strings.billingOperatorSeatsHeading}
                  value={`${status.seatsUsed} / ${status.seatLimit}`}
                  note={`${strings.billingIncludedUpToLabel} ${includedOperators}`}
                />
                <FactRow
                  label={strings.billingAdminSeatsHeading}
                  value={`${status.adminsUsed} / ${status.adminLimit}`}
                  note={`${strings.billingIncludedUpToLabel} ${includedAdmins}`}
                />
                <FactRow label={strings.billingChannelsHeading} value={channelsValue} />
                <FactRow
                  label={strings.billingPaidUntilLabel}
                  value={periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}
                />
                <FactRow
                  label={strings.billingPaymentMethodLabel}
                  value={status.hasStoredPaymentMethod ? strings.billingPaymentMethodSaved : strings.billingPaymentMethodNotSaved}
                />
              </dl>

              <p className="ago-billing-note">{strings.billingAdminSeatsNote}</p>

              {isPending && (
                <Alert tone="info" title={strings.billingPendingTitle}>
                  {strings.billingPendingBody} <Spinner label={strings.billingPendingTitle} labelHidden />
                </Alert>
              )}
              {sub?.status === "Failed" && (
                <Alert tone="danger" title={strings.billingFailedTitle}>
                  {strings.billingFailedBody}
                </Alert>
              )}
              {sub?.status === "PastDue" && (
                <Alert tone="danger" title={strings.billingPastDueTitle}>
                  {strings.billingPastDueBody}
                </Alert>
              )}
              {sub?.cancelRequested && (
                <p className="ago-billing-note">
                  <strong>{strings.billingCancelRequestedTitle}:</strong> {strings.billingCancelRequestedBody}{" "}
                  {periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}.
                </p>
              )}
              {sub && (sub.pendingSeatCount !== null || sub.pendingAdminCount !== null) && (
                <p className="ago-billing-note">
                  <strong>{strings.billingPendingChangeTitle}:</strong> {strings.billingPendingChangeBody}{" "}
                  {sub.pendingSeatCount ?? sub.requestedSeats} {strings.billingOperatorSeatsHeading.toLowerCase()},{" "}
                  {sub.pendingAdminCount ?? status.extraAdministratorsPurchased} {strings.billingAdminSeatsHeading.toLowerCase()}
                  {sub.pendingTier ? ` (${sub.pendingTier})` : ""}.
                </p>
              )}
            </div>
          </Panel>

          {/* Card A - "Докупить сейчас" / Buy now. */}
          <Panel title={strings.billingBuyNowHeading}>
            <div className="ago-stack">
              {!canBuyNow ? (
                <p className="ago-billing-note">{strings.billingBuyNowNeedsSubscription}</p>
              ) : buyNowNoPaymentMethod ? (
                <p className="ago-billing-note">{strings.billingBuyNowNoPaymentMethod}</p>
              ) : (
                <>
                  <p className="ago-billing-note">{strings.billingBuyNowIntro}</p>

                  <BuyQuantityRow
                    strings={strings}
                    label={strings.billingOperatorSeatsHeading}
                    hint={`${strings.billingIncludedUpToLabel} ${pricing.baseSeats} · +${rub(pricing.pricePerExtraSeatRub)}`}
                    maxQuantity={Math.max(opsAddable, MIN_QUANTITY)}
                    atMaximum={opsAddable <= 0}
                    atMaximumNote={strings.billingBuyAtMaximumNote}
                    preview={previewSeats}
                    purchase={buySeats}
                    onPurchased={load}
                  />

                  <BuyQuantityRow
                    strings={strings}
                    label={strings.billingAdminSeatsHeading}
                    hint={status.adminExtraPriceRub !== null ? `+${rub(status.adminExtraPriceRub)}` : undefined}
                    maxQuantity={ADMIN_EXTRA_UI_MAX}
                    notPriced={status.adminExtraPriceRub === null}
                    preview={previewAdmins}
                    purchase={buyAdmins}
                    onPurchased={load}
                  />

                  <div className="ago-billing-note">{strings.billingChannelsHeading}</div>
                  <BuyChannelRow
                    strings={strings}
                    displayName={strings.ownerChannelKindTelegram}
                    connected={status.connectedChannels.some((channel) => channel.kind === "Telegram")}
                    priced={status.channelAddOnPriceRub !== null}
                    preview={previewTelegram}
                    purchase={buyTelegram}
                    onPurchased={load}
                  />
                  <BuyChannelRow
                    strings={strings}
                    displayName={strings.ownerChannelKindMax}
                    connected={status.connectedChannels.some((channel) => channel.kind === "Max")}
                    priced={status.channelAddOnPriceRub !== null}
                    preview={previewMax}
                    purchase={buyMax}
                    onPurchased={load}
                  />
                </>
              )}
            </div>
          </Panel>

          {/* Card B - "Следующий период" / Next period. */}
          <Panel title={strings.billingNextPeriodHeading}>
            {isPending ? (
              <p className="ago-billing-note">{strings.billingPendingBody}</p>
            ) : canScheduleNextPeriod && sub ? (
              <ActiveNextPeriodPanel
                strings={strings}
                timeZone={timeZone}
                accessToken={accessToken ?? ""}
                siteId={siteId ?? ""}
                status={status}
                sub={sub}
                onChanged={load}
                onRequestCancel={() => setCancelConfirming(true)}
              />
            ) : (
              <CheckoutNextPeriodPanel strings={strings} accessToken={accessToken ?? ""} siteId={siteId ?? ""} pricing={pricing} />
            )}
          </Panel>
        </div>
      )}

      <Dialog
        open={cancelConfirming}
        title={strings.billingCancelDialogTitle}
        onClose={() => setCancelConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelConfirming(false)} disabled={cancelSubmitting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void handleCancelConfirm()} disabled={cancelSubmitting}>
              {strings.billingCancelConfirmButton}
            </Button>
          </>
        }
      >
        {cancelError && <Alert tone="danger">{cancelError}</Alert>}
        <p>{strings.billingCancelDialogBody}</p>
      </Dialog>
    </>
  );
}
