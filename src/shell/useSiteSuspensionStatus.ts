import { useCallback, useEffect, useState } from "react";
import { fetchSiteSuspensionStatus, type SiteSuspensionStatusDto } from "../api/siteSuspensionApi.js";

/**
 * `25-70`: the tenant's own suspension read, for the shell-wide banner - mount-fetch once per
 * `(accessToken, siteId)` pair, no periodic poll, matching `usePendingBookingsBadge.ts`'s own
 * documented precedent for a shell-level indicator with no push channel to drive it: this fact has no
 * `SignalR` event of its own (`22-08` never built one - the console learning about its own suspension
 * sooner than "the next page load" was never this item's scope), so the honest choice already made for
 * the identical situation is "correct on the next mount, not necessarily live within one session" -
 * not a fresh tradeoff decided for this hook alone.
 *
 * Returns `null` before the first answer arrives, after any failure, and whenever `accessToken`/
 * `siteId` are not yet known - `null` here means "do not render the banner", never "confirmed not
 * suspended" (`fetchSiteSuspensionStatus`'s own remarks on why a failure must not block the console,
 * only omit a courtesy notice from it).
 *
 * **The "not yet known" case is masked at the return statement, not reset inside the effect.**
 * `setStatus(null)` synchronously inside the effect body (the first thing tried) is exactly the
 * `react-hooks/set-state-in-effect` pattern the project's own lint config refuses - calling `setState`
 * straight from an effect's body, rather than from an async callback reacting to an external event,
 * is what that rule exists to catch. Masking the last-known `status` behind the current
 * `accessToken`/`siteId` at render time needs no such write: a fetch in flight for a *previous* site
 * that resolves after the caller has already switched away can only ever update `status` to a value
 * this hook is about to mask anyway, and `switchTenancy` (`PermissionsProvider`'s own remarks) reloads
 * the whole page on every real switch, so that stale-resolve race is not one this hook can actually
 * hit in practice - the masking is a belt-and-braces correctness statement, not a load-bearing fix for
 * an observed bug.
 */
export function useSiteSuspensionStatus(accessToken: string | undefined, siteId: string | null): SiteSuspensionStatusDto | null {
  const [status, setStatus] = useState<SiteSuspensionStatusDto | null>(null);

  const refresh = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchSiteSuspensionStatus(accessToken, siteId)
      .then((dto) => setStatus(dto))
      .catch((err: unknown) => {
        // Never surfaced to the operator - `fetchSiteSuspensionStatus`'s own remarks on why this
        // banner degrades to absent, not broken, on failure.
        console.warn("Failed to load this site's suspension state for the console banner", err);
      });
  }, [accessToken, siteId]);

  useEffect(() => {
    if (!accessToken || !siteId) {
      return;
    }

    refresh();
  }, [accessToken, siteId, refresh]);

  return accessToken && siteId ? status : null;
}
