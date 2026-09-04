import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `12-02`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerSiteSummaryDto`.
 *
 * Two fields are nullable for reasons the server states explicitly, and both are rendered as what
 * they actually mean rather than as a convenient default (`OwnerSitesPage`):
 *
 * - `createdAt` is `null` for sites that predate `12-02` adding `sites.created_at`. Those rows were
 *   never backfilled because the system genuinely does not know when they were created. Null means
 *   "not recorded", never "just now" - so it must never be rendered as a date.
 * - `lastMessageAt` is the most recent message **inside the response's `recentWindowDays` window**,
 *   `null` when there was none. A long-quiet tenant and a brand-new empty one are indistinguishable
 *   here, which is why the UI says "none in the last N days" and never "never".
 */
export interface OwnerSiteSummary {
  siteId: string;
  name: string;
  /** The literal `"free"` today - `12-02`'s own contract is explicit that this is the only tier that
   * exists, not a placeholder computation. Rendered plainly, with nothing implying a richer tier
   * system is already there. */
  tier: string;
  createdAt: string | null;
  seatCount: number;
  conversationCount: number;
  recentMessageCount: number;
  lastMessageAt: string | null;
  attachmentBytes: number;
}

export interface OwnerSitesPage {
  sites: OwnerSiteSummary[];
  /** The `?before=` value for the next page, `null` once the last site has been reached. `12-02`
   * uses the "a full page implies there may be more" rule, so this can hand back one cursor that
   * yields an empty final page - the caller must cope with a page of zero rows. */
  nextBefore: string | null;
  /** How many days `recentMessageCount`/`lastMessageAt` cover. Returned by the server precisely so
   * no client hardcodes an assumed window and starts lying the day the server's window changes; every
   * label in this screen that names a number of days takes it from here. */
  recentWindowDays: number;
  /** `23-14`: how many sites, across the whole deployment, matched whatever search was sent - not how
   * many rows are in `sites` on this one page. Equal to `totalSites` when no search was sent. Always
   * present, searched or not - the console must never compute "how many matched" from `sites.length`,
   * since that is only the current page. */
  matchingSites: number;
  /** `23-14`: how many sites exist on the deployment, ignoring any search - the fixed denominator
   * `OwnerSitesPage.tsx` renders "N of M sites match" against. Present on every response, so a search
   * can never make the true total disappear from what the screen has to say. */
  totalSites: number;
}

/**
 * The outcome of asking `12-02`'s endpoint for a page.
 *
 * `"not-authorized"` is a real, expected answer rather than an exception, and it is *the* answer
 * this screen is gated on: `12-01`'s `RequirePlatformOwner` policy on
 * `GET /api/v1/owner/sites` is the only thing that decides whether a caller may see cross-tenant
 * data, and its `401`/`403` is that decision arriving in the browser. The console does not re-derive
 * it - see `useOwnerEligibility` for the same reasoning applied to the navigation link, and `10-03`'s
 * `resolveOperatorState` for the precedent this shape copies (a server policy's own refusal reused as
 * a client-side state, rather than a claims inspection guessing at it).
 */
export type OwnerSitesOutcome =
  | { status: "ok"; page: OwnerSitesPage }
  | { status: "not-authorized" };

/**
 * `12-02`: `GET /api/v1/owner/sites?query=&before=&limit=` - one of the two cross-tenant reads in the
 * product (`23-14`'s per-tenant detail, `fetchOwnerSiteDetail` below, is the other). Keyset-paginated
 * on the server's own cursor (`nextBefore`), never a client-side slice of a full result set; `limit`
 * is deliberately left unset so the server's own default page size applies.
 *
 * `23-14`: `query` is an optional name/id search - blank or omitted means "no filter", the same
 * "empty means absent" the server itself applies (`ListSitesForOwnerHandler`). Sent verbatim as
 * `?query=`; the server, not this function, decides what counts as a match.
 *
 * A `401`/`403` is returned, not thrown: it is the authorization answer this screen expects to have
 * to render for an ineligible caller. Anything else (a 500, a network failure) throws, because
 * "the database did not respond" and "you may not see this" are different states and collapsing them
 * would tell the owner their own view is forbidden whenever the API has a bad day.
 */
export async function fetchOwnerSites(
  accessToken: string,
  before?: string,
  query?: string,
): Promise<OwnerSitesOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites`);
  if (before) {
    url.searchParams.set("before", before);
  }
  if (query && query.trim().length > 0) {
    url.searchParams.set("query", query.trim());
  }

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (!response.ok) {
    throw new Error(`Failed to load platform sites: ${response.status}`);
  }

  return { status: "ok", page: (await response.json()) as OwnerSitesPage };
}

/**
 * `23-14`: one module as the platform owner's per-tenant detail read sees it - mirrors
 * `Ago.Chat.Contracts.OwnerSiteModuleDto` field for field, the same reasoning `OwnerSiteSummary`'s own
 * remarks give for tracking `OwnerSiteSummaryDto`.
 */
export interface OwnerSiteModule {
  moduleKey: string;
  triggerWords: string[];
  entryPoint: string;
  /** `true` when the platform owner granted this module rather than the tenant enabling it
   * themselves - the wire-visible half of `22-17`'s audit distinction. */
  grantedByOwner: boolean;
  /** `null` for a grant that does not expire - rendered as an explicit "no end date", never as a
   * blank cell (this item's own Done-when). */
  expiresAt: string | null;
  /** `false` once `expiresAt` has passed. Computed server-side, by the same live comparison the
   * production read path uses to decide whether chat still offers this module - rendered directly,
   * never recomputed here by comparing `expiresAt` against the browser's own clock (this item's own
   * Done-when: "matching what the live read-store query already decides rather than re-deriving it in
   * the console"). */
  isActive: boolean;
}

/** `23-14`: `GET /api/v1/owner/sites/{siteId}`'s response body - mirrors
 * `Ago.Chat.Contracts.OwnerSiteDetailResponse`. The same eight aggregate fields `OwnerSiteSummary`
 * carries, for exactly one tenant, plus `modules`. */
export interface OwnerSiteDetail {
  siteId: string;
  name: string;
  tier: string;
  createdAt: string | null;
  seatCount: number;
  conversationCount: number;
  recentMessageCount: number;
  lastMessageAt: string | null;
  attachmentBytes: number;
  recentWindowDays: number;
  /** Every module this site has ever had enabled, expired grants included - deliberately not
   * `modulesApi.ts`'s "currently active only" shape. A support agent repairing a tenant needs to see
   * a lapsed trial, not just its absence. */
  modules: OwnerSiteModule[];
}

/**
 * The outcome of asking `23-14`'s endpoint for one tenant's detail - the identical three-state shape
 * `OwnerSitesOutcome` already establishes, plus `"not-found"` for a site id that does not (or no
 * longer) exists: a real 404, not the info-hiding "wrong tenant reads like no row" shape a
 * tenant-scoped route would use, because the platform owner may legitimately name any site
 * (`GetSiteForOwnerHandler`'s own remarks).
 */
export type OwnerSiteDetailOutcome =
  | { status: "ok"; site: OwnerSiteDetail }
  | { status: "not-authorized" }
  | { status: "not-found" };

/**
 * `23-14`: `GET /api/v1/owner/sites/{siteId}` - the platform owner's per-tenant detail read, the
 * companion `fetchOwnerSites` above's list rows drill into.
 */
export async function fetchOwnerSiteDetail(accessToken: string, siteId: string): Promise<OwnerSiteDetailOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites/${siteId}`);

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (!response.ok) {
    throw new Error(`Failed to load site detail: ${response.status}`);
  }

  return { status: "ok", site: (await response.json()) as OwnerSiteDetail };
}

/**
 * What the console *believes* about whether the signed-in caller may reach the owner screen.
 * `"unknown"` covers both "not asked yet" and "asked, and the answer was neither a yes nor a
 * refusal" (a network error, a 500) - which is treated exactly like a no everywhere it is used,
 * because a navigation link that leads to a refusal is worse than a missing one.
 */
export type OwnerEligibility = "unknown" | "eligible" | "ineligible";

/**
 * Asks the server whether this token may call `12-02`'s endpoint, by calling it - the smallest page
 * it will serve (`limit=1`).
 *
 * **This is the console's entire client-side eligibility signal, and it is deliberately not a
 * client-side decision.** `12-03`'s scope forbids re-deriving `12-01`'s authorization: inspecting
 * the JWT's `realm_access.roles` for `platform-owner` and trusting that as the source of truth for
 * what is *allowed* would be a second, weaker copy of `RequirePlatformOwner`, drifting from the real
 * one the moment either changes - the same argument `ListSitesForOwnerHandler` makes server-side for
 * why it performs no second check of its own. What this function returns is the server's own policy
 * decision, already made, reused to decide one thing only: whether the navigation link is drawn.
 *
 * It cannot leak anything to an ineligible caller - a refused request carries no body - and if it is
 * ever wrong in the other direction (a link drawn for someone the server then refuses), the screen
 * behind it renders its ordinary "not authorized" state, because that screen re-asks the same
 * endpoint and never trusts this answer.
 *
 * `limit=1` rather than a HEAD or a dedicated "may I?" endpoint: `12-02` provides neither, and
 * inventing one server-side to answer a question the real endpoint already answers would be a new
 * contract for no gain. One request per signed-in session (`useOwnerEligibility`).
 */
export async function probeOwnerEligibility(accessToken: string): Promise<OwnerEligibility> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return "eligible";
  }

  if (response.status === 401 || response.status === 403) {
    return "ineligible";
  }

  return "unknown";
}
