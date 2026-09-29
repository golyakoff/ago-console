import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  type BillingSubscriptionSummaryDto,
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
import { Badge, type BadgeTone } from "../components/Badge.js";
import { Dialog } from "../components/Dialog.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { shapeMismatchMessage } from "./apiErrorMessage.js";

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

/** `25-95`: the reduce control's own floor - the smallest quantity a decrease request can name, the
 * identical "one is the smallest change that means anything" reasoning `MIN_SEATS_TO_ADD` already
 * gives, mirrored rather than shared because the two constants bound two different directions of the
 * same number and a single shared name would read as if zero were a valid quantity for either. */
const MIN_SEATS_TO_REMOVE = 1;

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

/** `26-294`: one row of the dense label/value grid every card below uses - `.ago-billing-facts`
 * (`index.css`) lays these out two-to-a-row on a wide viewport, one-per-row on narrow, replacing the
 * old `<p><strong>label</strong>: value</p>` this screen used to repeat about twenty times. `note` is
 * the small, second-order fact that used to be its own row ("Included free on Solo", "Purchased
 * beyond the tier") - folded under the primary value instead of given a row of its own. */
function FactRow({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="ago-billing-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <span className="ago-billing-fact__note">{note}</span>}
    </div>
  );
}

/** `26-294`: Card 1's status badge - `26-290`'s own Case 1 table ("Status badge ... rendered as
 * active / past-due / pending badges"). `Pending` and `Failed` reuse `billingPendingTitle`/
 * `billingFailedTitle` rather than a second translation of the identical word, since those are
 * already the exact word shown as that state's own `Alert` title just below. A `null` subscription
 * is the ordinary free-tier state, not an error - `tone: "neutral"`, not `"danger"`. */
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
 *
 * ## `25-95`: a decrease got a control of its own, not a sign flip on the add stepper
 *
 * `25-23`'s add-only stepper (`seatsToAdd`, floored at `MIN_SEATS_TO_ADD`) removed the one console
 * path that could ever request fewer seats than a site already holds - the backend side never moved:
 * `ChangeSubscriptionSeatsHandler` has always taken an absolute `RequestedSeats` and branched
 * internally (more than current: charge and apply now, `Upgraded`; less: `ScheduleDowngradeAsync`, no
 * charge, applied at the next renewal, `DowngradeScheduled`), and `billingPendingDowngradeBody`
 * already knew how to render the result. The gap this item closed was narrowly the input: nothing
 * could make `seatsAfterPurchase` compute below `status.seatLimit`.
 *
 * The two shapes on the table were letting the existing stepper go negative (turning "+N" into "±N",
 * reusing `handleSeatChangeSubmit` unchanged), or a second, explicit control. This screen took the
 * second: an increase and a decrease are not the same request wearing a different sign, they are two
 * differently-consequential actions (an immediate charge against a stored payment method versus a
 * deferred, uncharged schedule), and a single control that silently swaps between them the moment a
 * spinner crosses zero would make the more consequential of the two - the one that moves money - the
 * one an idle nudge past zero could trigger by accident. The `±N` alternative would also have
 * complicated the bound itself: the add direction's ceiling is `pricing.maxSeats - seatLimit` and the
 * remove direction's is `seatLimit - pricing.minSeats`, two different numbers a single `min`/`max`
 * pair cannot both express without recomputing them on every sign change. Splitting the control keeps
 * each one's own bound simple and keeps `MIN_SEATS_TO_ADD`'s "1 is the smallest change that means
 * anything" reading honest for both directions, rather than reusing it to also mean "zero is a valid
 * quantity to type." The new `handleSeatReductionSubmit` still calls the identical
 * `changeSubscriptionSeats` endpoint `handleSeatChangeSubmit` already calls - only the control offering
 * it, and the state it owns, are new - and it is shown only once a subscription is already `Succeeded`,
 * the one state `ChangeSubscriptionSeatsHandler`'s own top gate accepts a seat change of either
 * direction on at all.
 *
 * ## `26-294`: three cards, not six stacked panels
 *
 * `26-290`'s own design (`docs/backlog/26-290-console-billing-redesign.md`, slice 1) found this
 * screen reading as "empty and scrolly" not because it lacked data but because ~20 one-fact-per-line
 * rows and five stacked forms buried the two things a paying tenant actually came to check - what is
 * paid and until when, and what can be bought - under a wall of read-only pricing trivia. This item
 * is a pure regrouping of data **already on the wire**, never a backend change: **Current plan**
 * merges the old Subscription/Operator-seats/Administrator-seats panels into one dense
 * `.ago-billing-facts` grid (`FactRow` below) plus a status `Badge`; **Add to your plan** merges the
 * add-seats/add-administrator stepper panels into `.ago-billing-buy-row`s (name, unit price, and a
 * stepper-plus-button sharing one line via `Field`'s `adornment` slot) and demotes reduce-seats/cancel
 * - real money-relevant actions, but not *purchases* - into a `quiet` sub-panel and a small button
 * beneath the buy rows, per `26-290`'s own layout call; **Next renewal** is new, and deliberately
 * thin: it shows only `currentPeriodEnd` (already on the wire) and says renewal is automatic, never a
 * computed charge total - `26-290`'s own finding is that the recurring amount needs a channel-option
 * count this screen's `BillingStatusDto` does not carry yet, and `CLAUDE.md` bars inventing a number
 * to fill the gap in the meantime.
 *
 * **What this item deliberately does not add**: a connected-channel add-on purchase row. `26-290`'s
 * own premise-check found `billingApi.ts` has no `purchaseChannelAddOn` and `BillingStatusDto` has no
 * `channelAddOnPriceRub` - both are `26-290` slice 2's own addition, alongside the channel count and
 * the next-charge total. Building a row here would mean either fabricating a price or wiring a button
 * to an endpoint that does not exist; the seam is left in the Add-to-your-plan card's own code comment
 * instead.
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

  // `25-95`: the reduce-seats control's own state, kept apart from the add control's above for the
  // identical reason `adminSlotsToAdd`'s own comment already gives for staying apart from
  // `seatsToAdd` - two controls that submit independently of one another, this time against the same
  // current count but in opposite directions. No success state of its own: a scheduled, uncharged
  // downgrade is told entirely through the persistent `billingPendingDowngradeBody` block once
  // `load()` refetches it - the identical "no separate toast to keep in sync with persistent state"
  // reasoning `handleCancelConfirm` below already gives for its own success path.
  const [seatsToRemove, setSeatsToRemove] = useState(MIN_SEATS_TO_REMOVE);
  const [seatReductionSubmitting, setSeatReductionSubmitting] = useState(false);
  const [seatReductionError, setSeatReductionError] = useState<string | null>(null);

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

  // `25-95`: what the reduce-seats control actually asks for - `status.seatLimit` minus the quantity
  // chosen, the same "add to (here, subtract from) the server's own last-reported count" shape
  // `seatsAfterPurchase` above uses, never a number this screen was holding on to. Decrease is only
  // ever reachable on an already-`Succeeded` subscription (`ChangeSubscriptionSeatsHandler`'s own top
  // gate refuses anything else before it even looks at the direction), so - unlike the add control,
  // which also serves the "no subscription yet" checkout case - this one control covers exactly one
  // branch and needs no `sub?.status` fork of its own at render time; the panel below is withheld
  // entirely otherwise.
  const seatsRemovable = status !== null && pricing !== null ? status.seatLimit - pricing.minSeats : 0;
  const atSeatMinimum = status !== null && pricing !== null && status.seatLimit <= pricing.minSeats;
  const seatsAfterReduction = status === null ? 0 : status.seatLimit - seatsToRemove;
  const seatReductionCountError =
    pricing !== null && seatsToRemove >= MIN_SEATS_TO_REMOVE && !isValidSeatCount(seatsAfterReduction, pricing.minSeats, pricing.maxSeats)
      ? `${strings.billingSeatCountOutOfRange} ${pricing.minSeats}-${pricing.maxSeats}.`
      : null;
  const canSubmitReduction = pricing !== null && seatsToRemove >= MIN_SEATS_TO_REMOVE && seatReductionCountError === null;

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

  const handleSeatReductionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitReduction || !accessToken || !siteId || !sub) {
      return;
    }

    setSeatReductionSubmitting(true);
    setSeatReductionError(null);
    try {
      // `ChangeSubscriptionSeatsHandler` branches on the same endpoint by comparing this absolute
      // count to the subscription's own stored `RequestedSeats`: below it, `ScheduleDowngradeAsync`
      // runs - `subscription.PendingSeatCount`/`PendingTier` are recorded, no charge is made, and
      // nothing changes until the next renewal. The response is never inspected here: it carries no
      // `proratedAmountRub` field for this branch (`ChangeSubscriptionSeatsResponseDto`'s own remarks),
      // so there is nothing in it this screen would show that `load()`'s refetch does not already
      // provide through `billingPendingDowngradeBody` above.
      await changeSubscriptionSeats(accessToken, siteId, sub.subscriptionId, seatsAfterReduction);
      setSeatsToRemove(MIN_SEATS_TO_REMOVE);
      load();
    } catch (err) {
      setSeatReductionError(err instanceof ApiProblemError ? err.message : strings.billingSeatChangeError);
    } finally {
      setSeatReductionSubmitting(false);
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
        <div className="ago-billing-grid">
          {/* Card 1 - "what's paid now, and until when" (`26-290` Case 1). One dense fact grid
              replacing the old Subscription/Operator-seats/Administrator-seats panels; the
              status-carrying Alerts below it stay full-width (they are transient/actionable, with
              their own spinner or retry framing), but the cancel-requested/pending-downgrade
              notices are folded into small inline lines - `26-290`'s own call, since neither is an
              error needing an assertive live region. */}
          <Panel title={strings.billingPanelTitle}>
            <div className="ago-stack">
              <dl className="ago-billing-facts">
                {/* `25-23`: the grid's own name for this tier, resolved server-side - never
                    `status.tier`, which is the raw enum value ("free"/"starter") the wire carries. */}
                <FactRow label={strings.billingTierLabel} value={status.tierDisplayName} />
                <FactRow
                  label={strings.billingStatusLabel}
                  value={
                    <Badge tone={subscriptionStatusBadge(sub, strings).tone}>
                      {subscriptionStatusBadge(sub, strings).label}
                    </Badge>
                  }
                />
                {/* `25-23`: Operator and Administrator seats stay two separate facts against two
                    separate limits - `ago-business 0011`'s own separation, which a single "Лимит
                    мест" line would collapse. Each note names its allowance apart from what was
                    bought beyond it, the same split the old two-panel layout made, now a sub-line
                    instead of two rows of its own. */}
                <FactRow
                  label={strings.billingOperatorSeatsHeading}
                  value={`${status.seatsUsed} / ${status.seatLimit}`}
                  note={`${strings.billingFreeSeatsIncludedLabel}: ${pricing.freeSeatsIncluded}`}
                />
                <FactRow
                  label={strings.billingAdminSeatsHeading}
                  value={`${status.adminsUsed} / ${status.adminLimit}`}
                  note={`${strings.billingAdminsPurchasedLabel}: ${status.extraAdministratorsPurchased}`}
                />
                <FactRow
                  label={strings.billingPaidUntilLabel}
                  value={periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}
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
              {sub?.pendingSeatCount !== null && sub?.pendingSeatCount !== undefined && (
                <p className="ago-billing-note">
                  <strong>{strings.billingPendingDowngradeTitle}:</strong> {strings.billingPendingDowngradeBody}{" "}
                  {sub.pendingSeatCount} ({sub.pendingTier}).
                </p>
              )}
            </div>
          </Panel>

          {/* Card 2 - "what can I buy, and for how much" (`26-290` Case 2). Each buyable dimension
              is one `.ago-billing-buy-row` (name + unit price on the left, a stepper-plus-button on
              the right via `Field`'s `adornment` slot) instead of a stepper panel of its own.
              Reduce-seats and cancellation are demoted below the buy rows - `26-290`'s own call,
              since neither is a purchase and both would otherwise compete with the buy rows for
              attention. */}
          <Panel title={strings.billingAddToPlanHeading}>
            <div className="ago-stack">
              {/* `25-23`: one control for both directions of the same purchase - a site with no
                  active paid subscription starts a checkout, one with a `Succeeded` subscription
                  changes its seat count in place. Withheld while a payment is pending or retrying,
                  exactly as before. */}
              {!isPending && sub?.status !== "PastDue" && (
                <div className="ago-billing-buy-row">
                  <div className="ago-billing-buy-row__info">
                    <span className="ago-billing-buy-row__name">{strings.billingAddSeatsHeading}</span>
                    <span className="ago-billing-buy-row__price">
                      {strings.billingBaseSeatPriceLabel} {rub(pricing.baseSeatPriceRub)} ({strings.billingBaseSeatsCoveredLabel}:{" "}
                      {pricing.baseSeats}) · {strings.billingExtraSeatPriceLabel} {rub(pricing.pricePerExtraSeatRub)}
                    </span>
                    {/* `26-290` §4: pure reference pricing moves to its point of use rather than a
                        standalone fact nobody is about to act on - the purchasable range belongs
                        here, beside the control it bounds, not in Card 1. */}
                    <span className="ago-billing-buy-row__price">
                      {strings.billingPurchasableSeatsLabel}: {pricing.minSeats}-{pricing.maxSeats}
                    </span>
                    <span className="ago-billing-buy-row__price">
                      {strings.billingCurrentSeatCountLabel}: {status.seatLimit}
                    </span>
                  </div>

                  {atSeatMaximum ? (
                    <p>{strings.billingSeatMaximumReached}</p>
                  ) : (
                    <form
                      className="ago-billing-buy-row__controls"
                      onSubmit={(e) => void (sub?.status === "Succeeded" ? handleSeatChangeSubmit(e) : handleCheckoutSubmit(e))}
                    >
                      <Field
                        label={strings.billingAddSeatsFieldLabel}
                        description={`${strings.billingNewSeatCountLabel}: ${seatsAfterPurchase}`}
                        error={seatCountError}
                        adornment={
                          sub?.status === "Succeeded" ? (
                            <Button type="submit" variant="primary" disabled={seatChangeSubmitting || !canSubmitPurchase}>
                              {seatChangeSubmitting ? strings.billingChangingSeatsButton : strings.billingAddSeatsButton}
                            </Button>
                          ) : (
                            <Button type="submit" variant="primary" disabled={checkoutSubmitting || !canSubmitPurchase}>
                              {checkoutSubmitting ? strings.billingSubscribingButton : strings.billingAddSeatsButton}
                            </Button>
                          )
                        }
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
                    </form>
                  )}

                  {!atSeatMaximum && sub?.status !== "Succeeded" && (
                    <p className="ago-billing-note">{strings.billingAddSeatsStartsCheckout}</p>
                  )}
                  {checkoutError && <Alert tone="danger">{checkoutError}</Alert>}
                  {seatChangeError && <Alert tone="danger">{seatChangeError}</Alert>}
                  {seatChangeSuccess && (
                    <Alert tone="success" title={strings.billingUpgradeSuccessTitle}>
                      {strings.billingUpgradeSuccessBody} ₽{seatChangeSuccess.amountRub.toFixed(2)} · {seatChangeSuccess.tier},{" "}
                      {seatChangeSuccess.seats}.
                    </Alert>
                  )}
                </div>
              )}

              {/* `25-96`: the Administrator-seat purchase row. Deliberately not the same two-branch
                  shape as Operator seats above: `PurchaseAdministratorSlotHandler` has no
                  checkout-session path at all, only an immediate charge against an already-
                  `Succeeded` subscription's stored payment method - so this row explains what is
                  missing and points at the Operator row above when there is no such subscription
                  yet, rather than starting a checkout of its own.
                  `26-294`: this is the row a connected-channel add-on purchase would join next to,
                  once `26-290` slice 2 adds `channelAddOnPriceRub` to `BillingStatusDto` and a
                  `purchaseChannelAddOn` client function to `billingApi.ts` - neither exists yet, so
                  no channel row is built here (`26-290`'s own "leave a clean seam" call). */}
              <div className="ago-billing-buy-row">
                <div className="ago-billing-buy-row__info">
                  <span className="ago-billing-buy-row__name">{strings.billingAddAdminSeatsHeading}</span>
                  <span className="ago-billing-buy-row__price">
                    {strings.billingAdminExtraPriceLabel}:{" "}
                    {status.adminExtraPriceRub === null ? strings.billingAdminExtraNotPriced : rub(status.adminExtraPriceRub)}
                  </span>
                  <span className="ago-billing-buy-row__price">
                    {strings.billingCurrentAdminCountLabel}: {status.extraAdministratorsPurchased}
                  </span>
                </div>

                {status.adminExtraPriceRub === null ? (
                  <p>{strings.billingAddAdminSeatsNotForSale}</p>
                ) : sub === null || sub.status !== "Succeeded" ? (
                  <p>{strings.billingAddAdminSeatsNeedsSubscription}</p>
                ) : (
                  <form className="ago-billing-buy-row__controls" onSubmit={(e) => void handleAdminPurchaseSubmit(e)}>
                    <Field
                      label={strings.billingAddAdminSeatsFieldLabel}
                      description={`${strings.billingNewAdminCountLabel}: ${adminCountAfterPurchase}`}
                      adornment={
                        <Button type="submit" variant="primary" disabled={adminPurchaseSubmitting || !canPurchaseAdminSlot}>
                          {adminPurchaseSubmitting ? strings.billingAdminPurchaseSubmittingButton : strings.billingAddAdminSeatsButton}
                        </Button>
                      }
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
                  </form>
                )}

                {status.adminExtraPriceRub !== null && sub !== null && sub.status === "Succeeded" && (
                  <p className="ago-billing-note">{strings.billingAddAdminSeatsChargesImmediately}</p>
                )}
                {adminPurchaseError && <Alert tone="danger">{adminPurchaseError}</Alert>}
                {adminPurchaseSuccess && (
                  <Alert tone="success" title={strings.billingAdminPurchaseSuccessTitle}>
                    {strings.billingAdminPurchaseSuccessBody} ₽{adminPurchaseSuccess.amountRub.toFixed(2)} ·{" "}
                    {adminPurchaseSuccess.count}.
                  </Alert>
                )}
              </div>

              {/* `25-95`: the decrease direction, demoted into a `quiet` sub-panel below the buy
                  rows - a decrease is not a purchase (no charge, nothing applies until the next
                  renewal), so it should not visually compete with the two rows above that do charge
                  immediately. Shown only on an already-`Succeeded` subscription, unchanged from
                  before. */}
              {sub?.status === "Succeeded" && (
                <Panel quiet title={strings.billingReduceSeatsHeading}>
                  {atSeatMinimum ? (
                    <p>{strings.billingSeatMinimumReached}</p>
                  ) : (
                    <div className="ago-stack">
                      <form className="ago-billing-buy-row__controls" onSubmit={(e) => void handleSeatReductionSubmit(e)}>
                        <Field
                          label={strings.billingReduceSeatsFieldLabel}
                          description={`${strings.billingReduceSeatsNewCountLabel}: ${seatsAfterReduction}`}
                          error={seatReductionCountError}
                          adornment={
                            <Button type="submit" variant="secondary" disabled={seatReductionSubmitting || !canSubmitReduction}>
                              {seatReductionSubmitting ? strings.billingChangingSeatsButton : strings.billingReduceSeatsButton}
                            </Button>
                          }
                        >
                          {(controlProps) => (
                            <Input
                              {...controlProps}
                              type="number"
                              min={MIN_SEATS_TO_REMOVE}
                              max={seatsRemovable}
                              value={seatsToRemove}
                              onChange={(e) => setSeatsToRemove(Number(e.target.value))}
                              disabled={seatReductionSubmitting}
                            />
                          )}
                        </Field>
                      </form>

                      <p className="ago-billing-note">{strings.billingReduceSeatsSchedulesAtRenewal}</p>

                      {seatReductionError && <Alert tone="danger">{seatReductionError}</Alert>}
                    </div>
                  )}
                </Panel>
              )}

              {(sub?.status === "Succeeded" || sub?.status === "PastDue") && !sub.cancelRequested && (
                <div className="ago-row">
                  {cancelError && <Alert tone="danger">{cancelError}</Alert>}
                  <Button variant="danger" size="sm" onClick={() => setCancelConfirming(true)}>
                    {strings.billingCancelButton}
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {/* Card 3 - "next charge: how much, when, and pay-early" (`26-290` Case 3), display half
              only. Deliberately thin: `currentPeriodEnd` is already on the wire, but the recurring
              amount is not (it needs a channel-option count `BillingStatusDto` does not carry yet -
              `26-290` slice 2) and pay-early does not exist as a command at all (`26-290` slice 4).
              Showing only what is actually known, with an honest "not shown yet" for the rest, is
              the point - `CLAUDE.md` bars inventing a number to fill the gap. */}
          <Panel title={strings.billingNextRenewalHeading}>
            <div className="ago-stack">
              {sub === null ? (
                <p>{strings.billingNextRenewalNoSubscription}</p>
              ) : isPending || sub.status === "Failed" ? (
                <p>{strings.billingNextRenewalPending}</p>
              ) : sub.cancelRequested ? (
                <p>
                  {strings.billingCancelRequestedBody} {periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}.
                </p>
              ) : (
                <>
                  <dl className="ago-billing-facts">
                    <FactRow
                      label={strings.billingNextRenewalDateLabel}
                      value={periodEndDate ? formatDateStamp(periodEndDate, timeZone, strings) : "—"}
                    />
                    <FactRow label={strings.billingNextRenewalAmountLabel} value={strings.billingNextRenewalAmountPending} />
                    {/* `26-290` §4: the period length is reference pricing too - moved here, next to
                        the renewal date it explains, rather than left in a standalone panel. */}
                    <FactRow label={strings.billingBillingPeriodDaysLabel} value={pricing.billingPeriodDays} />
                  </dl>
                  <p className="ago-billing-note">{strings.billingNextRenewalAutomaticNote}</p>
                </>
              )}
            </div>
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
        <p>{strings.billingCancelDialogBody}</p>
      </Dialog>
    </>
  );
}
