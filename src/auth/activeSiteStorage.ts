import type { TenancyDto } from "../api/tenanciesApi.js";

/**
 * `13-07`/`adr/0068`: the pure, storage-touching half of `PermissionsProvider`'s new bootstrap step -
 * split into its own file (not exported alongside the component) because a file mixing a component
 * export with plain function exports breaks Vite's Fast Refresh
 * (`react-refresh/only-export-components`), the identical reason `OperatorConnectionProvider.tsx`/
 * `OperatorConnectionContext.tsx` and `PermissionsProvider.tsx`/`PermissionsContext.tsx` are already
 * split this way.
 */

/** Where the switcher's choice survives a reload - keyed clearly, per the backlog item's own naming
 * instruction, and namespaced (`ago-console:`) the way this project's own per-origin client storage
 * already is (`ago-widget`'s session storage, this item's own Scope). */
export const ACTIVE_SITE_STORAGE_KEY = "ago-console:active-site";

export function readStoredActiveSite(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
  } catch {
    // Private-browsing/storage-disabled - treated as "no stored choice", never a crash.
    return null;
  }
}

export function writeStoredActiveSite(siteId: string): void {
  try {
    localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
  } catch {
    // Same fail-soft as readStoredActiveSite - losing the persisted choice costs nothing worse than
    // the switcher defaulting to the first tenancy (or asking again) on the next load, which
    // `adr/0068`'s own Consequences names as an acceptable cost of this being client-side-only state.
  }
}

/** Which tenancy to make active once the full list is known - the persisted choice if it is still
 * one of this identity's real tenancies, otherwise the first (alphabetically, per
 * `ListMyTenanciesHandler`'s own ordering, `ago-chat`). A small pure function, tested on its own -
 * the same shape this codebase already uses for `closeOutcome.ts` and its siblings. */
export function resolveActiveSite(tenancies: TenancyDto[]): string | null {
  if (tenancies.length === 0) {
    return null;
  }

  if (tenancies.length === 1) {
    // `13-07`'s own Scope: sending the header is fine even with exactly one tenancy - simpler than
    // branching, and the resolver's own fallback already treats "one real tenancy" identically
    // whether or not the header is present, so this cannot change what the call resolves to.
    return tenancies[0].siteId;
  }

  const stored = readStoredActiveSite();
  const resolved = stored && tenancies.some((t) => t.siteId === stored) ? stored : tenancies[0].siteId;
  writeStoredActiveSite(resolved);
  return resolved;
}
