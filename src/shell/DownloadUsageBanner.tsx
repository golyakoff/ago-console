import { useState } from "react";
import type { DownloadUsageStatusDto } from "../api/downloadUsageApi.js";
import { useStrings } from "../i18n/StringsContext.js";

/**
 * `25-83`: `docs/backlog/25-83-*.md`'s own Done-when - "crossing the soft threshold... shows a
 * non-dismissable, warning-toned console banner." The identical full-bleed shell band shape
 * `SuspensionBanner.tsx` already establishes (that component's own doc comment explains the layout
 * choice in full - a standing fact about the whole session, rendered outside `<main>` so it survives
 * navigation), reused here rather than reinvented.
 *
 * **Two tones, one component.** Below the soft threshold this renders nothing (`status === null`
 * covers "not yet loaded" the same way `SuspensionBanner`'s own remarks explain). At or past the soft
 * threshold it renders the warning-toned variant; once the hard threshold is actually reached
 * (`isHardCrossed`) it switches to the stronger, danger-toned `--blocked` modifier - the same
 * underlying fact (this account is over its allowance) at two different severities, not two
 * unrelated banners a reader would have to learn apart.
 *
 * **`25-84`: one control, and only in the one state where it can actually do something.** This
 * component was deliberately read-only under `25-83` ("no button here can change a threshold or grant
 * an exemption, both of which stay the platform owner's own act"), and that is still true of
 * everything `25-83` owns. What `25-84` adds is not a control over a limit - it is the tenant paying
 * for the egress they have already used, which is their own decision to make. It renders only when
 * all four of these hold, and each exclusion matters:
 *
 * - `isHardCrossed` - below the block there is nothing to unblock.
 * - `billingMode === "Manual"` - an auto-billed tenant is never blocked by this in the first place,
 *   so a pay button would be an action with no effect.
 * - `!isAtAutoBillCap` - the one blocked state a purchase cannot lift (the platform owner's own
 *   monthly ceiling). Offering a button the server would refuse is worse than explaining why there is
 *   none, so this state gets a sentence instead.
 * - `outstandingOverageRub !== null` and `onPay` supplied - no published price, or no handler (every
 *   shell but the operator one), means there is nothing to buy here.
 *
 * **The amount is the server's own figure, rendered, never computed.** `25-23`'s "a real, sourced
 * figure on the wire, never invented client-side" - the number on this button is the number the
 * charge is made for, because it is literally the same number.
 */
export function DownloadUsageBanner({
  status,
  onPay,
}: {
  status: DownloadUsageStatusDto | null;
  onPay?: () => Promise<void>;
}) {
  const strings = useStrings();
  const [payState, setPayState] = useState<"idle" | "pending" | "failed">("idle");

  if (status === null || !status.isSoftCrossed) {
    return null;
  }

  const title = status.isHardCrossed ? strings.downloadUsageBannerBlockedTitle : strings.downloadUsageBannerSoftTitle;
  const className = status.isHardCrossed
    ? "ago-download-usage-banner ago-download-usage-banner--blocked"
    : "ago-download-usage-banner";

  // Narrowed through a local rather than a boolean, so the two facts the button needs - that there is
  // a handler and that there is an amount - survive into the JSX as non-null without an assertion.
  const payableAmountRub =
    status.isHardCrossed && status.billingMode === "Manual" && !status.isAtAutoBillCap && onPay !== undefined
      ? status.outstandingOverageRub
      : null;

  async function handlePay(pay: () => Promise<void>) {
    setPayState("pending");
    try {
      await pay();
      // Deliberately left "pending" on success: the browser is on its way to the hosted checkout page,
      // and flipping back to an enabled button in the instant before navigation invites a second
      // click and a second payment.
    } catch {
      // The provider's own message is neither localised nor written for an end user - see
      // `downloadUsageBannerPayFailed`.
      setPayState("failed");
    }
  }

  return (
    <div className={className} role="alert">
      <span className="ago-download-usage-banner__title">{title}</span>
      {status.isHardCrossed && status.isAtAutoBillCap ? (
        <span className="ago-download-usage-banner__detail">{strings.downloadUsageBannerAtCap}</span>
      ) : (
        <span className="ago-download-usage-banner__detail">{strings.downloadUsageBannerContact}</span>
      )}
      {payableAmountRub !== null && onPay !== undefined && (
        <button
          type="button"
          className="ago-download-usage-banner__pay"
          disabled={payState === "pending"}
          onClick={() => void handlePay(onPay)}
        >
          {payState === "pending"
            ? strings.downloadUsageBannerPayPending
            : strings.downloadUsageBannerPayLabel(formatRub(payableAmountRub))}
        </button>
      )}
      {payState === "failed" && (
        <span className="ago-download-usage-banner__detail">{strings.downloadUsageBannerPayFailed}</span>
      )}
    </div>
  );
}

/** Two decimals, always - a price with a trailing kopeck that renders as `340.5` reads like a typo,
 * and one that renders as `340` hides that the charge is `340.07`. No locale grouping: the string is
 * embedded in a translated sentence whose own separator conventions differ. */
function formatRub(amountRub: number): string {
  return amountRub.toFixed(2);
}
