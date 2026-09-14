import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  cancelSubscription,
  changeSubscriptionSeats,
  createCheckoutSession,
  fetchBillingStatus,
  purchaseAdministratorSlot,
  type BillingStatusDto,
} from "../api/billingApi.js";
import { checkCheckoutConfirmation } from "../billing/checkoutConfirmation.js";
import type { CheckoutConfirmationOutcome } from "../billing/checkoutConfirmation.js";
import { usePollUntilCheckoutSettled } from "../billing/usePollUntilCheckoutSettled.js";
import { isValidSeatCount } from "./billingValidation.js";
import { formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Dialog } from "../components/Dialog.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** `13-04`: this screen's own gate - `13-02`/`13-03`'s checkout/cancel/seat-change endpoints, and the
 * `13-04`-added `GET .../billing/status` read, are all gated server-side on the identical permission
 * (`Ago.Chat.Domain.Permission.SiteConfigure`), the same category `5-08` already put "site
 * configuration" screens under (`WidgetConfigPage`/`OfflineAutoReplyPage`/`AdminConversationsPage`'s
 * own precedent). Client-side, this is UX only - it hides the form the same way those screens hide
 * theirs; the real gate is the server's own check on every call. */
export const BILLING_PERMISSION = "site:configure";

const CHECKOUT_POLL_INTERVAL_MS = 3_000;

/** `25-23`: the stepper's own floor. One is the smallest purchase that means anything, and the
 * control starts there rather than at the site's current seat count - the whole point of the change
 * from a direct-edit field is that the number being typed is a *quantity being bought*, not a total
 * being overwritten. */
const MIN_SEATS_TO_ADD = 1;

type SeatChangeSuccess = { amountRub: number; tier: string; seats: number };

/** `25-96`: no `tier` field - unlike a seat change, an Administrator purchase never moves the site
 * between tiers, so there is nothing here to echo back beyond what was charged and the new count. */
type AdminPurchaseSuccess = { amountRub: number; count: number };

/** `25-23`: `₽NNN.00`, the identical formatting `OwnerPricingPage` already uses for the same
 * catalog-sourced amounts - so a price shown to a tenant here and to the owner there cannot render
 * differently from one another. */
function rub(amount: number): string {
  return `₽${amount.toFixed(2)}`;
}

/**
 * `13-04`: `/settings/billing` - current tier, seats used vs. seat limit, and the full subscription
 * lifecycle surface `13-03`'s policy unblocked: upgrade (a seat-count input, `13-02`'s
 * checkout-session endpoint, ЮKassa's hosted redirect), downgrade and cancellation (`13-03`'s own
 * seat-change/cancel endpoints). See this item's own report for the explicit scope decision and why
 * downgrade/cancellation are included now that `13-03` answered the policy questions the original
 * backlog item was blocked on.
 *
 * ## The honest pending-then-confirmed mechanism
 *
 * `13-02`'s checkout-session creation never touches `Site.Tier`/`Site.SeatLimit` - only a verified
 * webhook does. This screen never claims success off ЮKassa's redirect return alone: on mount (and
 * after every refresh), it reads `latestSubscription.status` from the server's own
 * `GET .../billing/status`, and while that status is `"Pending"` it shows `billingPendingBody` and
 * polls (`usePollUntilCheckoutSettled`, the same ref-based interval shape `16-02`'s
 * `usePollUntilErased` already established for its own "poll until a real async job completes"
 * problem) until the status genuinely moves to `"Succeeded"` or `"Failed"` - never sooner. A mid-cycle
 * seat change and a cancellation need no such poll: both resolve synchronously (`ChangeSubscriptionSeatsHandler`'s
 * upgrade path charges and applies in the same request; a downgrade/cancellation is a single
 * synchronous write, `ago-chat`'s own `13-03` implementation), so this screen simply refetches status
 * after each and renders whatever comes back - the identical "never render success before the server
 * says so" discipline, just without a webhook in the loop to wait for.
 *
 * ## `25-23`: catching up to the Solo/Business grid
 *
 * This screen predated the tariff grid `ago-business` decisions `0011`/`0012` settled and showed
 * three things that were wrong about it. It rendered `status.tier` raw - the server's own enum
 * value, so a free site read "free" where the grid says **Solo**. It showed one undifferentiated
 * "Лимит мест", although `0011` counts Administrators separately from Operator seats against a limit
 * of their own. And its seat-count description hand-typed "От 2 до 100 мест" while
 * `SubscriptionTierBands.MaxSeats` is **5** - so the console advertised, and its own
 * `billingValidation.ts` locally accepted, seat counts `TryResolveTier` refuses outright.
 *
 * All three are now server facts: `tierDisplayName` (mapped server-side, `BillingStatusDto`'s own C#
 * remarks say why there), `adminLimit`/`adminsUsed`/`extraAdministratorsPurchased`, and the whole of
 * `seatPricing`. **Nothing on this screen is a second copy of the grid any more** - `25-20`'s
 * "sourced, not retyped" discipline, which is the only thing that would have caught the 100-vs-5
 * drift.
 *
 * ### The seat control: a quantity to add, not a total to overwrite
 *
 * The direct-edit field is gone. It let an owner type an absolute seat total over their current one,
 * which reads as "set my seats to N" and never says what is being *bought*; in its place is the
 * read-only current count plus an add-this-many spinner and one **Добавить** button, the
 * e-commerce quantity-plus-add shape the author asked for.
 *
 * **That button is wired to the real purchase path, not left a stub, and `25-23`'s own Scope asked
 * for a stub.** The Scope's reason was that "there is no ЮKassa integration yet (`23-86` is that
 * gap)"; re-checked against `ago-chat` on 2026-09-14, that premise no longer holds - ЮKassa is real
 * (`Ago.Chat.Infrastructure.YooKassa`, a signature-verified webhook, a stored payment method),
 * `23-86` is closed as done and was about the option-to-entitlement mapping rather than about
 * payments at all, and this very screen has been calling `createCheckoutSession`/
 * `changeSubscriptionSeats` in production since `13-02`/`13-03`. Replacing two working calls with a
 * deliberate no-op would have deleted shipped capability and left a button that lies in the other
 * direction. So the shape changed and the wiring did not: the same two endpoints, called with
 * `seatLimit + seatsToAdd` instead of a typed absolute, and `billingAddSeatsStartsCheckout` saying
 * out loud when pressing it will open ЮKassa.
 *
 * ## `25-96`: an Administrator-seat control, deliberately not a copy of the Operator one
 *
 * `25-23` gave the Administrator panel above facts and no way to change them; `25-41` had already
 * built and tested the purchase endpoint (`POST .../billing/subscriptions/{id}/administrators`), so
 * this item is the console half. The quantity-to-add shape is the same, and so is the discipline -
 * `purchaseAdministratorSlot` returns a real, synchronous, charged result and this screen never
 * shows it before that response comes back, then calls `load()` to refetch `extraAdministratorsPurchased`/
 * `adminLimit`/`adminsUsed` from the server rather than computing them locally.
 *
 * What is deliberately different: `PurchaseAdministratorSlotHandler` (`ago-chat`, read directly
 * rather than assumed) has no checkout-session branch at all - it 400s with
 * `Billing.SubscriptionNotActive` on anything but an already-`Succeeded` subscription, because
 * buying an extra Administrator charges a *stored payment method* that only exists once a real
 * subscription has succeeded once. So this control has no "starts a subscription" fallback the way
 * the Operator one does; instead it explains, in place of the form, that an Operator-seat purchase
 * above has to happen first. It also carries no `SubscriptionTierBands`-style min/max band - the
 * handler's own only guard is `Billing.AdministratorCountNotAnIncrease` ("must exceed what is
 * already bought"), which starting the quantity at `MIN_SEATS_TO_ADD` already guarantees - so there
 * is no Administrator analogue of `seatCountError`/`billingSeatMaximumReached` to compute or render.
 */
export function BillingPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<BillingStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // `25-23`: a quantity, so it has one fixed starting value and needs no seeding from the server at
  // all. The `prevSeedInputs` render-phase adjustment this component used to carry (re-seeding an
  // absolute seat field from `latestSubscription.requestedSeats` on every fresh status, but only
  // until the operator touched it) is deleted with the field it existed for - a background refresh
  // can no longer overwrite a half-typed total, because there is no total being typed.
  const [seatsToAdd, setSeatsToAdd] = useState(MIN_SEATS_TO_ADD);

  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [seatChangeSubmitting, setSeatChangeSubmitting] = useState(false);
  const [seatChangeError, setSeatChangeError] = useState<string | null>(null);
  const [seatChangeSuccess, setSeatChangeSuccess] = useState<SeatChangeSuccess | null>(null);

  // `25-96`: the identical "quantity to add, reset to the floor after every purchase" shape
  // `seatsToAdd` above uses, kept as its own state rather than shared with it - the two controls buy
  // against two different current counts (`seatLimit` vs `extraAdministratorsPurchased`) and submit
  // independently of one another.
  const [adminSlotsToAdd, setAdminSlotsToAdd] = useState(MIN_SEATS_TO_ADD);
  const [adminPurchaseSubmitting, setAdminPurchaseSubmitting] = useState(false);
  const [adminPurchaseError, setAdminPurchaseError] = useState<string | null>(null);
  const [adminPurchaseSuccess, setAdminPurchaseSuccess] = useState<AdminPurchaseSuccess | null>(null);

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
      .catch((err: unknown) => setLoadError(err instanceof ApiProblemError ? err.message : strings.billingLoadError));
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

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission(BILLING_PERMISSION)) {
    // `23-24`: shared `AccessRefusal`, replacing this screen's own copy of the block.
    return <AccessRefusal title={strings.billingTitle} message={strings.billingForbidden} strings={strings} />;
  }

  const pricing = status?.seatPricing ?? null;
  // `25-23`: what the purchase actually asks for. Both endpoints below take an absolute seat total
  // (`CreateCheckoutSessionRequest.RequestedSeats`/`ChangeSubscriptionSeatsRequest.RequestedSeats`),
  // so the quantity the owner chose is added to the seat count the *server* last reported - never to
  // a number this screen was holding on to.
  const seatsAfterPurchase = status === null ? 0 : status.seatLimit + seatsToAdd;
  const atSeatMaximum = status !== null && pricing !== null && status.seatLimit >= pricing.maxSeats;
  const seatsAddable = status !== null && pricing !== null ? pricing.maxSeats - status.seatLimit : 0;

  // `25-23`: derived during render, not kept in a second state variable synced by a submit handler.
  // The old field validated only on submit, which is why it could sit showing a stale error (or
  // none) while the value under it changed; this is the "you might not need an effect" shape the
  // seeding block above was already rewritten into by `23-96`, applied to the error too. The
  // practical consequence is that an over-range quantity says so the moment it is typed rather than
  // after a round trip - and the browser's own `min`/`max` constraint validation on the input below
  // independently refuses to submit it, so the message is what explains a refusal rather than being
  // the only thing preventing one.
  const seatCountError =
    pricing !== null && seatsToAdd >= MIN_SEATS_TO_ADD && !isValidSeatCount(seatsAfterPurchase, pricing.minSeats, pricing.maxSeats)
      ? `${strings.billingSeatCountOutOfRange} ${pricing.minSeats}-${pricing.maxSeats}.`
      : null;
  // A quantity below one buys nothing, so it is refused without a message of its own - the spinner's
  // own floor already says what the minimum is, and an error explaining "1 is the smallest number of
  // seats you can add" tells a reader nothing the control did not.
  const canSubmitPurchase = pricing !== null && seatsToAdd >= MIN_SEATS_TO_ADD && seatCountError === null;

  // `25-96`: what the Administrator purchase actually asks for - `status.extraAdministratorsPurchased`
  // plus the quantity chosen, the identical "add to the server's own last-reported count, never to a
  // number this screen was holding on to" shape `seatsAfterPurchase` uses above.
  const adminCountAfterPurchase = status === null ? 0 : status.extraAdministratorsPurchased + adminSlotsToAdd;
  // `PurchaseAdministratorSlotHandler` requires an already-`Succeeded` subscription with a stored
  // payment method and has no checkout-session branch of its own (unlike the Operator path above) -
  // so, unlike `canSubmitPurchase`, this also gates on `sub.status`. It carries no min/max band check:
  // `25-41`'s own contract enforces only "the requested count must exceed the current one"
  // (`Billing.AdministratorCountNotAnIncrease`), which `adminSlotsToAdd >= MIN_SEATS_TO_ADD` already
  // guarantees, so there is no analogue of `seatCountError` to compute here.
  const canPurchaseAdminSlot =
    status !== null &&
    status.adminExtraPriceRub !== null &&
    sub !== null &&
    sub.status === "Succeeded" &&
    adminSlotsToAdd >= MIN_SEATS_TO_ADD;

  const handleCheckoutSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitPurchase || !accessToken || !siteId) {
      return;
    }

    setCheckoutSubmitting(true);
    setCheckoutError(null);
    try {
      const { confirmationUrl } = await createCheckoutSession(accessToken, siteId, seatsAfterPurchase);
      // A real, full-page navigation to ЮKassa's hosted checkout - not an in-app state change. The
      // component unmounts here on success; `checkoutSubmitting` is only ever reset on the failure
      // path below.
      window.location.href = confirmationUrl;
    } catch (err) {
      setCheckoutError(err instanceof ApiProblemError ? err.message : strings.billingCheckoutError);
      setCheckoutSubmitting(false);
    }
  };

  const handleSeatChangeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitPurchase || !accessToken || !siteId || !sub) {
      return;
    }

    setSeatChangeSubmitting(true);
    setSeatChangeError(null);
    setSeatChangeSuccess(null);
    try {
      const response = await changeSubscriptionSeats(accessToken, siteId, sub.subscriptionId, seatsAfterPurchase);
      if ("proratedAmountRub" in response) {
        setSeatChangeSuccess({ amountRub: response.proratedAmountRub, tier: response.newTier, seats: response.newSeatCount });
      }
      // `25-23`: back to one, so the control never invites the same purchase twice by still showing
      // the quantity that was just bought.
      setSeatsToAdd(MIN_SEATS_TO_ADD);
      load();
    } catch (err) {
      setSeatChangeError(err instanceof ApiProblemError ? err.message : strings.billingSeatChangeError);
    } finally {
      setSeatChangeSubmitting(false);
    }
  };

  const handleAdminPurchaseSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canPurchaseAdminSlot || !accessToken || !siteId || !sub) {
      return;
    }

    setAdminPurchaseSubmitting(true);
    setAdminPurchaseError(null);
    setAdminPurchaseSuccess(null);
    try {
      const response = await purchaseAdministratorSlot(accessToken, siteId, sub.subscriptionId, adminCountAfterPurchase);
      setAdminPurchaseSuccess({ amountRub: response.proratedAmountRub, count: response.newExtraAdministratorCount });
      // `25-96`: back to one, the identical "never invites the same purchase twice" reasoning
      // `handleSeatChangeSubmit` already gives for its own reset.
      setAdminSlotsToAdd(MIN_SEATS_TO_ADD);
      // `25-96`'s own Done-when: the purchased count and the resulting limit refresh on the same
      // screen after a successful purchase - `load()` refetches `GET .../billing/status`, which is
      // what actually re-renders `extraAdministratorsPurchased`/`adminLimit`/`adminsUsed` below, the
      // identical refresh `handleSeatChangeSubmit` already performs for its own purchase.
      load();
    } catch (err) {
      setAdminPurchaseError(err instanceof ApiProblemError ? err.message : strings.billingAdminPurchaseError);
    } finally {
      setAdminPurchaseSubmitting(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!accessToken || !siteId || !sub) {
      return;
    }

    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await cancelSubscription(accessToken, siteId, sub.subscriptionId);
      setCancelConfirming(false);
      // Same reasoning as the downgrade path above: `load()` refreshes `cancelRequested`/
      // `currentPeriodEnd`, and the persistent `billingCancelRequestedBody` block already renders
      // that - no separate success message to keep in sync with it.
      load();
    } catch (err) {
      setCancelError(err instanceof ApiProblemError ? err.message : strings.billingCancelError);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const periodEndDate = sub?.currentPeriodEnd ? parseInstant(sub.currentPeriodEnd) : null;

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
        <div className="ago-stack">
          <Panel title={strings.billingPanelTitle}>
            <div className="ago-stack">
              <p>
                {/* `25-23`: the grid's own name for this tier, resolved server-side - never
                    `status.tier`, which is the raw enum value ("free"/"starter") the wire carries
                    for whatever already reads it literally. */}
                <strong>{strings.billingTierLabel}:</strong> {status.tierDisplayName}
              </p>

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
                <Alert tone="info" title={strings.billingCancelRequestedTitle}>
                  {strings.billingCancelRequestedBody} {periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}.
                </Alert>
              )}
              {sub?.pendingSeatCount !== null && sub?.pendingSeatCount !== undefined && (
                <Alert tone="info" title={strings.billingPendingDowngradeTitle}>
                  {strings.billingPendingDowngradeBody} {sub.pendingSeatCount} ({sub.pendingTier}).
                </Alert>
              )}
            </div>
          </Panel>

          {/* `25-23`: Operator seats and Administrator seats as two blocks against two limits -
              `ago-business 0011`'s own separation, which the single "Лимит мест" line this replaced
              collapsed. Each names its free allowance apart from what is bought beyond it. */}
          <Panel title={strings.billingOperatorSeatsHeading}>
            <div className="ago-stack">
              <p>
                <strong>{strings.billingSeatsUsedLabel}:</strong> {status.seatsUsed}
              </p>
              <p>
                <strong>{strings.billingSeatLimitLabel}:</strong> {status.seatLimit}
              </p>
              <p>
                <strong>{strings.billingFreeSeatsIncludedLabel}:</strong> {pricing.freeSeatsIncluded}
              </p>
              <p>
                <strong>{strings.billingPurchasableSeatsLabel}:</strong> {pricing.minSeats}-{pricing.maxSeats}
              </p>
              <p>
                <strong>{strings.billingBaseSeatPriceLabel}:</strong> {rub(pricing.baseSeatPriceRub)}
              </p>
              <p>
                <strong>{strings.billingBaseSeatsCoveredLabel}:</strong> {pricing.baseSeats}
              </p>
              <p>
                <strong>{strings.billingExtraSeatPriceLabel}:</strong> {rub(pricing.pricePerExtraSeatRub)}
              </p>
              <p>
                <strong>{strings.billingBillingPeriodDaysLabel}:</strong> {pricing.billingPeriodDays}
              </p>
            </div>
          </Panel>

          <Panel title={strings.billingAdminSeatsHeading} description={strings.billingAdminSeatsNote}>
            <div className="ago-stack">
              <p>
                <strong>{strings.billingSeatsUsedLabel}:</strong> {status.adminsUsed}
              </p>
              <p>
                <strong>{strings.billingSeatLimitLabel}:</strong> {status.adminLimit}
              </p>
              <p>
                {/* `Site.ActivateSubscription` builds `AdminLimit` as exactly
                    `ResolveAdminLimit(tier) + ExtraAdministratorsPurchased`, so this difference is
                    that first term rather than an estimate of it - and the second term below is the
                    persisted field itself (`25-41`), never inferred. */}
                <strong>{strings.billingAdminsIncludedLabel}:</strong> {status.adminLimit - status.extraAdministratorsPurchased}
              </p>
              <p>
                <strong>{strings.billingAdminsPurchasedLabel}:</strong> {status.extraAdministratorsPurchased}
              </p>
              <p>
                <strong>{strings.billingAdminExtraPriceLabel}:</strong>{" "}
                {status.adminExtraPriceRub === null ? strings.billingAdminExtraNotPriced : rub(status.adminExtraPriceRub)}
              </p>
            </div>
          </Panel>

          {/* `25-23`: one control for both directions of the same purchase - a site with no active
              paid subscription starts a checkout, one with a `Succeeded` subscription changes its
              seat count in place. Both take the same absolute total, so the stepper's quantity is
              the only thing that differs between them. Withheld while a payment is still pending or
              retrying, exactly as the field it replaced was. */}
          {!isPending && sub?.status !== "PastDue" && (
            <Panel title={strings.billingAddSeatsHeading}>
              {atSeatMaximum ? (
                <p>{strings.billingSeatMaximumReached}</p>
              ) : (
                <form
                  className="ago-stack"
                  onSubmit={(e) => void (sub?.status === "Succeeded" ? handleSeatChangeSubmit(e) : handleCheckoutSubmit(e))}
                >
                  <p>
                    {/* The read-only half of the control `25-23` asked for: what you have now is
                        stated, not offered as something to overwrite. */}
                    <strong>{strings.billingCurrentSeatCountLabel}:</strong> {status.seatLimit}
                  </p>

                  <Field
                    label={strings.billingAddSeatsFieldLabel}
                    description={`${strings.billingNewSeatCountLabel}: ${seatsAfterPurchase}`}
                    error={seatCountError}
                  >
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        type="number"
                        min={MIN_SEATS_TO_ADD}
                        max={seatsAddable}
                        value={seatsToAdd}
                        onChange={(e) => setSeatsToAdd(Number(e.target.value))}
                        disabled={checkoutSubmitting || seatChangeSubmitting}
                      />
                    )}
                  </Field>

                  {sub?.status !== "Succeeded" && <p>{strings.billingAddSeatsStartsCheckout}</p>}

                  {checkoutError && <Alert tone="danger">{checkoutError}</Alert>}
                  {seatChangeError && <Alert tone="danger">{seatChangeError}</Alert>}
                  {seatChangeSuccess && (
                    <Alert tone="success" title={strings.billingUpgradeSuccessTitle}>
                      {strings.billingUpgradeSuccessBody} ₽{seatChangeSuccess.amountRub.toFixed(2)} · {seatChangeSuccess.tier},{" "}
                      {seatChangeSuccess.seats}.
                    </Alert>
                  )}

                  <div className="ago-row">
                    {sub?.status === "Succeeded" ? (
                      <Button type="submit" variant="primary" disabled={seatChangeSubmitting || !canSubmitPurchase}>
                        {seatChangeSubmitting ? strings.billingChangingSeatsButton : strings.billingAddSeatsButton}
                      </Button>
                    ) : (
                      <Button type="submit" variant="primary" disabled={checkoutSubmitting || !canSubmitPurchase}>
                        {checkoutSubmitting ? strings.billingSubscribingButton : strings.billingAddSeatsButton}
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </Panel>
          )}

          {/* `25-96`: the Administrator-seat purchase control this screen has been missing since
              `25-23` made the Administrator panel above display-only. Deliberately not the same
              two-branch shape as the Operator panel immediately above: `25-41`'s own
              `PurchaseAdministratorSlotHandler` has no checkout-session path at all, only an
              immediate charge against an already-`Succeeded` subscription's stored payment method -
              so, rather than starting a checkout of its own, this panel explains what is missing and
              points at the Operator control above when there is no such subscription yet. */}
          <Panel title={strings.billingAddAdminSeatsHeading}>
            {status.adminExtraPriceRub === null ? (
              <p>{strings.billingAddAdminSeatsNotForSale}</p>
            ) : sub === null || sub.status !== "Succeeded" ? (
              <p>{strings.billingAddAdminSeatsNeedsSubscription}</p>
            ) : (
              <form className="ago-stack" onSubmit={(e) => void handleAdminPurchaseSubmit(e)}>
                <p>
                  <strong>{strings.billingCurrentAdminCountLabel}:</strong> {status.extraAdministratorsPurchased}
                </p>

                <Field
                  label={strings.billingAddAdminSeatsFieldLabel}
                  description={`${strings.billingNewAdminCountLabel}: ${adminCountAfterPurchase}`}
                >
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      type="number"
                      min={MIN_SEATS_TO_ADD}
                      value={adminSlotsToAdd}
                      onChange={(e) => setAdminSlotsToAdd(Number(e.target.value))}
                      disabled={adminPurchaseSubmitting}
                    />
                  )}
                </Field>

                <p>{strings.billingAddAdminSeatsChargesImmediately}</p>

                {adminPurchaseError && <Alert tone="danger">{adminPurchaseError}</Alert>}
                {adminPurchaseSuccess && (
                  <Alert tone="success" title={strings.billingAdminPurchaseSuccessTitle}>
                    {strings.billingAdminPurchaseSuccessBody} ₽{adminPurchaseSuccess.amountRub.toFixed(2)} ·{" "}
                    {adminPurchaseSuccess.count}.
                  </Alert>
                )}

                <div className="ago-row">
                  <Button type="submit" variant="primary" disabled={adminPurchaseSubmitting || !canPurchaseAdminSlot}>
                    {adminPurchaseSubmitting ? strings.billingAdminPurchaseSubmittingButton : strings.billingAddAdminSeatsButton}
                  </Button>
                </div>
              </form>
            )}
          </Panel>

          {(sub?.status === "Succeeded" || sub?.status === "PastDue") && !sub.cancelRequested && (
            <Panel quiet>
              {cancelError && <Alert tone="danger">{cancelError}</Alert>}
              <div className="ago-row">
                <Button variant="danger" onClick={() => setCancelConfirming(true)}>
                  {strings.billingCancelButton}
                </Button>
              </div>
            </Panel>
          )}
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
        <p>{strings.billingCancelDialogBody}</p>
      </Dialog>
    </>
  );
}
