import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  ApiProblemError,
  cancelSubscription,
  changeSubscriptionSeats,
  createCheckoutSession,
  fetchBillingStatus,
  type BillingStatusDto,
} from "../api/billingApi.js";
import { checkCheckoutConfirmation } from "../billing/checkoutConfirmation.js";
import type { CheckoutConfirmationOutcome } from "../billing/checkoutConfirmation.js";
import { usePollUntilCheckoutSettled } from "../billing/usePollUntilCheckoutSettled.js";
import { isValidSeatCount, MAX_SEATS, MIN_SEATS } from "./billingValidation.js";
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

type SeatChangeSuccess = { amountRub: number; tier: string; seats: number };

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
 */
export function BillingPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [status, setStatus] = useState<BillingStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [seatCountInput, setSeatCountInput] = useState(MIN_SEATS);
  const [seatCountTouched, setSeatCountTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [seatChangeSubmitting, setSeatChangeSubmitting] = useState(false);
  const [seatChangeError, setSeatChangeError] = useState<string | null>(null);
  const [seatChangeSuccess, setSeatChangeSuccess] = useState<SeatChangeSuccess | null>(null);

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

  // Seeds the seat-count input from the currently-active subscription (or `MIN_SEATS` for a free
  // site with none) every time a fresh `status` arrives - but only until the operator actually types
  // in the field, so a background refresh (the checkout poll, a post-write reload) never overwrites
  // input they are mid-edit on.
  useEffect(() => {
    if (status && !seatCountTouched) {
      setSeatCountInput(status.latestSubscription?.requestedSeats ?? MIN_SEATS);
    }
  }, [status, seatCountTouched]);

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

  const validateSeatCount = (): boolean => {
    if (!isValidSeatCount(seatCountInput)) {
      setValidationError(strings.billingSeatCountFieldDescription);
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleCheckoutSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateSeatCount() || !accessToken || !siteId) {
      return;
    }

    setCheckoutSubmitting(true);
    setCheckoutError(null);
    try {
      const { confirmationUrl } = await createCheckoutSession(accessToken, siteId, seatCountInput);
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
    if (!validateSeatCount() || !accessToken || !siteId || !sub) {
      return;
    }

    setSeatChangeSubmitting(true);
    setSeatChangeError(null);
    setSeatChangeSuccess(null);
    try {
      const response = await changeSubscriptionSeats(accessToken, siteId, sub.subscriptionId, seatCountInput);
      if ("proratedAmountRub" in response) {
        setSeatChangeSuccess({ amountRub: response.proratedAmountRub, tier: response.newTier, seats: response.newSeatCount });
      }
      // A downgrade needs no one-off toast - `load()` below refreshes `latestSubscription`, and the
      // `pendingSeatCount`/`pendingTier` it now carries renders through the persistent
      // `billingPendingDowngradeBody` block already in this screen, not a second, redundant message.
      load();
    } catch (err) {
      setSeatChangeError(err instanceof ApiProblemError ? err.message : strings.billingSeatChangeError);
    } finally {
      setSeatChangeSubmitting(false);
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

      {status === null && !loadError ? (
        <Panel>
          <Skeleton lines={3} label={strings.billingLoadingLabel} />
        </Panel>
      ) : status === null ? null : (
        <div className="ago-stack">
          <Panel title={strings.billingPanelTitle}>
            <div className="ago-stack">
              <p>
                <strong>{strings.billingTierLabel}:</strong> {status.tier}
              </p>
              <p>
                <strong>{strings.billingSeatsUsedLabel}:</strong> {status.seatsUsed}
              </p>
              <p>
                <strong>{strings.billingSeatLimitLabel}:</strong> {status.seatLimit}
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

          {/* Upgrade-or-subscribe form: no active paid subscription (never checked out, or the last
              attempt lapsed/failed) starts a brand-new checkout. An active `Succeeded` subscription
              changes its own seat count instead - `13-03`'s single endpoint handles both an immediate
              charged increase and a deferred, uncharged decrease, told apart entirely by comparing the
              new count against the current one (`ChangeSubscriptionSeatsHandler`'s own remarks), so
              this screen needs only one form for both directions. */}
          {!isPending && sub?.status !== "PastDue" && (
            <Panel title={sub?.status === "Succeeded" ? strings.billingChangeSeatsButton : strings.billingSubscribeButton}>
              <form
                className="ago-stack"
                onSubmit={(e) => void (sub?.status === "Succeeded" ? handleSeatChangeSubmit(e) : handleCheckoutSubmit(e))}
              >
                <Field label={strings.billingSeatCountFieldLabel} description={strings.billingSeatCountFieldDescription} error={validationError}>
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      type="number"
                      min={MIN_SEATS}
                      max={MAX_SEATS}
                      value={seatCountInput}
                      onChange={(e) => {
                        setSeatCountTouched(true);
                        setSeatCountInput(Number(e.target.value));
                      }}
                      disabled={checkoutSubmitting || seatChangeSubmitting}
                    />
                  )}
                </Field>

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
                    <Button type="submit" variant="primary" disabled={seatChangeSubmitting}>
                      {seatChangeSubmitting ? strings.billingChangingSeatsButton : strings.billingChangeSeatsButton}
                    </Button>
                  ) : (
                    <Button type="submit" variant="primary" disabled={checkoutSubmitting}>
                      {checkoutSubmitting ? strings.billingSubscribingButton : strings.billingSubscribeButton}
                    </Button>
                  )}
                </div>
              </form>
            </Panel>
          )}

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
