import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `25-70`: the tenant's own read of its own account's suspension state -
 * `GET /api/v1/sites/{siteId}/suspension`, `Ago.Chat.Api.Sites.SiteSuspensionEndpoints`'s exact wire
 * shape. The tenant-scoped sibling of `ownerApi.ts`'s `OwnerSuspension` (which spans every currently-
 * suspended site, for the platform owner's own screen): this one is scoped to the caller's own site,
 * the same "own file, own DTO" split `modulesApi.ts` already sets for the identical
 * owner-wide-vs-tenant-scoped distinction on the modules read.
 *
 * `since`/`until` are both `null` exactly when `isSuspended` is `false` - the wire contract
 * `Ago.Chat.Application.Abstractions.TenantSuspensionStatus`'s own remarks state, restated here rather
 * than re-derived: this DTO carries no "was suspended, is not any more" fact, only the present tense.
 */
export interface SiteSuspensionStatusDto {
  isSuspended: boolean;
  since: string | null;
  until: string | null;
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/suspension`;
}

/**
 * `23-118`/`23-99`: the runtime shape the suspension read promises. All three fields are
 * present-but-nullable (none is `?`), so all three are required keys. `isSuspended` is the
 * load-bearing one: dropped, it reads as `false` and the shell banner treats a suspended account as
 * not-suspended - the false-negative the `23-99` bound names for a status object whose absent boolean
 * silently reads as "not-X". Thrown as a plain `ShapeMismatchError` for the same reason
 * `downloadUsageApi.ts` gives: `useSiteSuspensionStatus` swallows every rejection into a `console.warn`
 * and never renders `err.message`, so there is no localized-surfacing path a `shape.mismatch` code
 * would feed.
 */
const siteSuspensionRequiredKeys = requiredKeysOf<SiteSuspensionStatusDto>({
  isSuspended: true,
  since: true,
  until: true,
});

/**
 * `null` on any failure (a non-2xx response, or a network error) - deliberately, not a thrown error.
 * This banner is a courtesy notice, not a gate (the read-only scope `docs/backlog/25-70-*.md` states):
 * an operator who cannot reach this endpoint for any reason should see the console they already see
 * today, not a broken shell - the same "never surfaced here" posture
 * `usePendingBookingsBadge.ts`'s own `refresh` already takes for its nav badge, restated for a banner
 * instead of a badge. The caller (`useSiteSuspensionStatus.ts`) still `console.warn`s so the failure is
 * not silently lost, just not shown to the operator.
 */
export async function fetchSiteSuspensionStatus(accessToken: string, siteId: string): Promise<SiteSuspensionStatusDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load this site's suspension state: ${response.status}`);
  }

  const body: unknown = await response.json();
  assertHasKeys<SiteSuspensionStatusDto>(body, siteSuspensionRequiredKeys, "GET /api/v1/sites/{siteId}/suspension");
  return body;
}
