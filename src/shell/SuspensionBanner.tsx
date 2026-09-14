import type { SiteSuspensionStatusDto } from "../api/siteSuspensionApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `25-70`: `docs/backlog/22-08-*.md`'s own Scope, built at last - "the console says the account is
 * suspended, since when, until when, and what to do about it." Rendered in the same full-bleed band
 * `PublicDemoNotice` already occupies (`AppShell.tsx`), for the identical reason: a standing fact about
 * the whole session, not one page's content, so it must survive navigation and sit outside `<main>`'s
 * `wide`/`fixed` layout modes rather than push into whichever screen happens to be open.
 *
 * `status === null` - not yet loaded, or `isSuspended === false` - renders nothing. There is no
 * "recently unsuspended" state this banner shows either: `TenantSuspensionStatus`'s own remarks on the
 * server side are explicit that a lifted or expired suspension leaves nothing to report, and this
 * component takes that at face value rather than remembering a previous answer.
 *
 * **Read-only, deliberately** - `docs/backlog/25-70-*.md`'s own Out of scope: no button here can lift
 * or extend the account's own suspension. That stays the platform owner's act alone
 * (`OwnerSuspensionsPage.tsx`), unchanged by this item.
 *
 * **"Contact AGO", no address** - the same no-link, no-address idiom `productsContactNote`/
 * `installOriginPanelDescription` already use for "the honest next step is a conversation, never a
 * button (or address) this repository cannot verify is real or monitored" (`productsContactNote`'s
 * own doc comment states the reasoning in full; this item found no different, more specific channel to
 * name anywhere in this codebase or in `ago-business`, so it reuses the existing answer rather than
 * inventing a new one).
 */
export function SuspensionBanner({ status }: { status: SiteSuspensionStatusDto | null }) {
  const strings = useStrings();
  const timeZone = resolveTimeZone();

  if (status === null || !status.isSuspended) {
    return null;
  }

  const since = parseInstant(status.since);
  const until = parseInstant(status.until);

  return (
    <div className="ago-suspension-banner" role="alert">
      <span className="ago-suspension-banner__title">{strings.suspensionBannerTitle}</span>
      <span className="ago-suspension-banner__detail">
        {since && `${strings.suspensionBannerSinceLabel} ${formatAbsolute(since, timeZone, strings)}. `}
        {until && `${strings.suspensionBannerUntilLabel} ${formatAbsolute(until, timeZone, strings)}. `}
        {strings.suspensionBannerContact}
      </span>
    </div>
  );
}
