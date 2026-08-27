/**
 * `13-07`/`adr/0068`: the console's own "which tenancy is active right now" signal, attached as
 * `X-Ago-Active-Site` to every authenticated REST call once known - the exact header name
 * `OperatorIdentityClaimsTransformation` (`ago-chat`) reads.
 *
 * A module-level singleton, not a value threaded through every `fetch` call's own signature. Every
 * `src/api/*.ts` module already builds its headers inline (no shared request helper exists in this
 * codebase - `PermissionsProvider.tsx`'s own remarks name this as the pattern found and extended), so
 * threading an `activeSiteId` parameter through would touch every exported function in every module
 * and every one of their call sites - a much larger, riskier change than this item's time-box affords
 * for what is, in the end, a UX convenience rather than a security boundary. That last part is not a
 * hand-wave: `adr/0068`'s own "Negative consequences" paragraph is explicit that this signal can only
 * ever *narrow* what a request resolves to on the server, never widen it - a stale read of this
 * module (a request that goes out carrying the previous tenancy's id, or none, for one tick during a
 * switch) costs at most a `403` that a retry after the switch's own reload clears up, never a
 * cross-tenant leak. A `useContext`-threaded value could not fail any more safely than that, so the
 * simpler shape is not a corner cut on the property that actually matters.
 *
 * Set once, by `PermissionsProvider` (the one place that resolves it), and read by every other
 * `src/api/*.ts` module and by `operatorConnection.ts` for the hub's own query-string equivalent.
 */
let activeSiteId: string | null = null;

export function setActiveSiteId(siteId: string | null): void {
  activeSiteId = siteId;
}

export function getActiveSiteId(): string | null {
  return activeSiteId;
}

export const ACTIVE_SITE_HEADER_NAME = "X-Ago-Active-Site";

/**
 * Every authenticated `fetch` call in this codebase builds a headers object starting with
 * `Authorization: Bearer ...` - this wraps that object and adds the active-site header on top,
 * exactly when one is known. Called from every `src/api/*.ts` module in place of building the plain
 * object inline, so a caller only has to change one line per fetch site to pick this up.
 */
export function withActiveSiteHeader(headers: Record<string, string>): Record<string, string> {
  return activeSiteId ? { ...headers, [ACTIVE_SITE_HEADER_NAME]: activeSiteId } : headers;
}
