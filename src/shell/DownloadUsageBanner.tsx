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
 * **Read-only, deliberately** - the same posture `SuspensionBanner.tsx`'s own remarks state for
 * itself: no button here can change a threshold or grant an exemption, both of which stay the
 * platform owner's own act (`docs/backlog/25-83-*.md`'s own Out of scope). "Contact AGO" is the
 * honest next step, the identical no-address idiom that component already reuses.
 */
export function DownloadUsageBanner({ status }: { status: DownloadUsageStatusDto | null }) {
  const strings = useStrings();

  if (status === null || !status.isSoftCrossed) {
    return null;
  }

  const title = status.isHardCrossed ? strings.downloadUsageBannerBlockedTitle : strings.downloadUsageBannerSoftTitle;
  const className = status.isHardCrossed
    ? "ago-download-usage-banner ago-download-usage-banner--blocked"
    : "ago-download-usage-banner";

  return (
    <div className={className} role="alert">
      <span className="ago-download-usage-banner__title">{title}</span>
      <span className="ago-download-usage-banner__detail">{strings.downloadUsageBannerContact}</span>
    </div>
  );
}
