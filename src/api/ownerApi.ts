import { config } from "../config.js";

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
 * `12-02`: `GET /api/v1/owner/sites?before=&limit=` - the one cross-tenant read in the product.
 * Keyset-paginated on the server's own cursor (`nextBefore`), never a client-side slice of a full
 * result set; `limit` is deliberately left unset so the server's own default page size applies.
 *
 * A `401`/`403` is returned, not thrown: it is the authorization answer this screen expects to have
 * to render for an ineligible caller. Anything else (a 500, a network failure) throws, because
 * "the database did not respond" and "you may not see this" are different states and collapsing them
 * would tell the owner their own view is forbidden whenever the API has a bad day.
 */
export async function fetchOwnerSites(accessToken: string, before?: string): Promise<OwnerSitesOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites`);
  if (before) {
    url.searchParams.set("before", before);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.ok) {
    return "eligible";
  }

  if (response.status === 401 || response.status === 403) {
    return "ineligible";
  }

  return "unknown";
}
