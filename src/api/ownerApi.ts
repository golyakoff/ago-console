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
  /** `23-103`: a stable per-row id, not derivable from `moduleKey` - `adr/0155`: a revoke-then-re-grant
   * leaves two rows for one (site, module) pair, both returned here, and this is what tells them apart
   * (a React list key, and which row an action is about). */
  id: string;
  moduleKey: string;
  triggerWords: string[];
  entryPoint: string;
  /** `true` when the platform owner granted this module rather than the tenant enabling it
   * themselves - the wire-visible half of `22-17`'s audit distinction. */
  grantedByOwner: boolean;
  /** `null` for a grant that does not expire - rendered as an explicit "no end date", never as a
   * blank cell (this item's own Done-when). Still present after `23-103` even when `status` is
   * `"Revoked"` - a grant can be both expired and revoked. */
  expiresAt: string | null;
  /** `23-103`: `null` for a grant that has never been revoked, otherwise when the platform owner
   * revoked it - the same "the row says when" shape `expiresAt` already gives its own end date. */
  revokedAt: string | null;
  /** `23-103`: one of `"Active"`, `"Expired"` or `"Revoked"` - what this grant actually is right now,
   * computed once server-side from the identical row this whole object is projected from
   * (`Ago.Chat.Contracts.OwnerSiteModuleDto.Status`'s own remarks). Rendered directly, never
   * re-derived here by comparing `expiresAt`/`revokedAt` against the browser's own clock. Replaces the
   * old `isActive` boolean this field carried before `23-103` - that boolean cannot distinguish
   * "revoked" from "expired", and the server stopped sending it. */
  status: string;
  /** `23-66`: this module's own granted countable quantity - the calendar add-on's "N masters" is the
   * first real instance, opaque here exactly like `moduleKey` itself. `null` when no quantity was
   * ever granted for this module, distinct from `0` (a quantity explicitly granted as zero, a tenant
   * with the module and no workers yet) - the two must never render the same
   * (`Ago.Chat.Contracts.OwnerSiteModuleDto.Quantity`'s own remarks state the identical distinction on
   * the server side this field is sourced from). */
  quantity: number | null;
}

/**
 * `23-68`: one operator on this tenant, as the platform owner's detail screen sees it - mirrors
 * `Ago.Chat.Contracts.OwnerSiteOperatorDto` field for field, the same reasoning `OwnerSiteModule`'s own
 * remarks give for tracking `OwnerSiteModuleDto`.
 */
export interface OwnerSiteOperator {
  operatorId: string;
  displayName: string | null;
  email: string | null;
  /** `false` is the locked-out candidate this item exists for - the console offers "Restore seat"
   * exactly for a row where this is `false`. */
  holdsSeat: boolean;
  /** Every role this operator currently holds. An empty list is the "stripped their own last role"
   * case `23-68`'s own scope names but does not fix - shown plainly, not hidden, so restoring a seat
   * is never mistaken for restoring a role. */
  roleNames: string[];
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
  /** `23-48`: this tenant's own `Site.AllowedOrigins`, added so the owner's detail screen - the only
   * place any of it may now be edited - has something to show and edit without a second round trip.
   * Every entry is already in normalized form (no path, no trailing slash) - the server refuses
   * anything else at write time (`updateOwnerSiteAllowedOrigins` below). */
  allowedOrigins: string[];
  /** `23-68`: every non-removed operator this site currently has - added so the owner's detail screen
   * can name a locked-out operator to restore a seat for without a second round trip. */
  operators: OwnerSiteOperator[];
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
 * `23-48`: the outcome of asking the server to replace a tenant's allowed origins - the same
 * three-state shape `OwnerSiteDetailOutcome` uses, plus `"invalid"` for a value the server refused
 * (naming what is wrong with it, `Site.InvalidOrigin`'s own message) rather than a generic thrown
 * error, since this is the one outcome the screen must show inline next to the field rather than as a
 * page-level failure.
 */
export type UpdateOwnerSiteAllowedOriginsOutcome =
  | { status: "ok"; allowedOrigins: string[] }
  | { status: "not-authorized" }
  | { status: "not-found" }
  | { status: "invalid"; message: string };

/**
 * `23-48`: `PUT /api/v1/owner/sites/{siteId}/allowed-origins` - the platform owner's own write, the
 * only place a chat tenant's allowed origins can be changed at all (`docs/backlog/23-46-*.md`'s own
 * finding: no such editor has ever existed). `allowedOrigins` is the complete replacement list, not a
 * single value to add or remove - matching `Ago.Chat.Domain.Site.UpdateAllowedOrigins`'s own shape.
 */
export async function updateOwnerSiteAllowedOrigins(
  accessToken: string,
  siteId: string,
  allowedOrigins: string[],
): Promise<UpdateOwnerSiteAllowedOriginsOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites/${siteId}/allowed-origins`);

  const response = await fetch(url, {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ allowedOrigins }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (response.status === 400) {
    // `Ago.Chat.Api.Http.ErrorExtensions`' own problem-details shape - `detail` is the server's own
    // message naming what is wrong with the value (`Site.InvalidOrigin`), the same field every other
    // 400 this console renders inline already reads.
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "This value was refused." };
  }

  if (!response.ok) {
    throw new Error(`Failed to update allowed origins: ${response.status}`);
  }

  const body = (await response.json()) as { allowedOrigins: string[] };
  return { status: "ok", allowedOrigins: body.allowedOrigins };
}

/**
 * `23-65`/`adr/0150`: the body `PUT /api/v1/owner/sites/{siteId}/modules` takes - mirrors
 * `Ago.Chat.Api.Owner.OwnerModuleEndpoints.GrantModuleRequest` field for field, minus
 * `provisioningSecret`. That field is gone from the server's own shape, not merely unset here:
 * `adr/0150` moved it into `Ago.Chat.Api`'s own configuration, so there is nothing left for a caller -
 * this console included - to hold or send.
 *
 * `23-92`/`adr/0154` removes `entryPoint` the identical way: the module's own address is now resolved
 * server-side from `ModuleEntryPoints:<key>`, so there is nothing left for this form to collect or
 * this draft to carry - not merely left blank, gone from the shape entirely.
 *
 * `expiresAt` is `string | null`, never optional - the same "decide, don't default" the server itself
 * enforces (a body that omits the key is refused before this handler runs). The form that builds this
 * draft must ask which one the platform owner meant, never assume either.
 */
export interface GrantOwnerModuleDraft {
  moduleKey: string;
  triggerWords: string[];
  credential: string;
  expiresAt: string | null;
}

/**
 * `23-65`: the outcome of granting a module as the platform owner. `"invalid"` covers every reason the
 * server can refuse the body itself (a malformed key or URL, a reserved or already-registered trigger
 * word, an expiry in the past or too far out) - one shape, because the field to render an error next
 * to is the same regardless of which of those it was, the same "one inline failure state" reasoning
 * `UpdateOwnerSiteAllowedOriginsOutcome`'s own `"invalid"` already uses. `"unavailable"` is the
 * different case entirely: nothing about what the platform owner typed is wrong, this deployment
 * itself is not ready to complete the call (`Module.RegistrationFailed` - the module deployment
 * refused or could not be reached; `Module.ProvisioningNotConfigured` - this deployment has not
 * configured its own copy of the provisioning secret yet, `IModuleProvisioningSecretProvider`'s own
 * remarks; `Module.EntryPointNotConfigured` - `23-92`/`adr/0154`, this deployment has not declared
 * where the named module lives, `IModuleEntryPointProvider`'s own remarks) - all `503`, all a
 * dependency of the request rather than a mistake in it.
 */
export type GrantOwnerModuleOutcome =
  | { status: "ok"; module: { moduleKey: string; triggerWords: string[]; expiresAt: string | null } }
  | { status: "not-authorized" }
  | { status: "not-found" }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string };

/**
 * `23-65`/`adr/0150`: `PUT /api/v1/owner/sites/{siteId}/modules` - the platform owner's own grant,
 * reached from `/owner`'s tenant detail screen rather than `module-grant-and-revoke.md`'s runbook. The
 * browser sends this exact body and nothing else; the provisioning secret this route used to require
 * never passes through here at all.
 */
export async function grantOwnerModule(
  accessToken: string,
  siteId: string,
  draft: GrantOwnerModuleDraft,
): Promise<GrantOwnerModuleOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites/${siteId}/modules`);

  const response = await fetch(url, {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(draft),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (response.status === 400) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "This value was refused." };
  }

  if (response.status === 503) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "unavailable", message: problem.detail ?? "This deployment cannot complete this request right now." };
  }

  if (!response.ok) {
    throw new Error(`Failed to grant the module: ${response.status}`);
  }

  const body = (await response.json()) as {
    moduleKey: string;
    triggerWords: string[];
    expiresAt: string | null;
  };
  return { status: "ok", module: body };
}

/**
 * `23-66`: the outcome of granting a module quantity as the platform owner - the same three-error-plus-ok
 * shape `GrantOwnerModuleOutcome` uses, minus `"unavailable"`: this write never calls a module over
 * HTTP (`GrantModuleQuantityAsOwnerHandler`'s own remarks - rule 8 forbids the calendar being asked
 * anything at write time), so there is no dependency for a `503` to name. `"invalid"` covers a
 * malformed module key or a negative quantity - the caller's own mistake to fix.
 */
export type GrantOwnerModuleQuantityOutcome =
  | { status: "ok"; moduleKey: string; quantity: number }
  | { status: "not-authorized" }
  | { status: "not-found" }
  | { status: "invalid"; message: string };

/**
 * `23-66`: `PUT /api/v1/owner/sites/{siteId}/modules/{moduleKey}/quantity` - the route this module's
 * countable quantity never had before this item. Never asks the module anything and carries no
 * provisioning secret (there is none to carry - `GrantOwnerModuleDraft`'s own remarks give the
 * identical reason for the sibling grant/revoke pair); `RequirePlatformOwner` on the route is the
 * whole access-control story, unchanged from every other `/owner/` write on this page.
 */
export async function grantOwnerModuleQuantity(
  accessToken: string,
  siteId: string,
  moduleKey: string,
  quantity: number,
): Promise<GrantOwnerModuleQuantityOutcome> {
  const url = new URL(
    `${config.apiBaseUrl}/api/v1/owner/sites/${siteId}/modules/${encodeURIComponent(moduleKey)}/quantity`,
  );

  const response = await fetch(url, {
    method: "PUT",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ quantity }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (response.status === 400) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "This value was refused." };
  }

  if (!response.ok) {
    throw new Error(`Failed to grant the module quantity: ${response.status}`);
  }

  const body = (await response.json()) as { moduleKey: string; quantity: number };
  return { status: "ok", moduleKey: body.moduleKey, quantity: body.quantity };
}

/**
 * `23-65`/`adr/0150`: the body `DELETE /api/v1/owner/sites/{siteId}/modules/{moduleKey}` takes -
 * mirrors `Ago.Chat.Api.Owner.OwnerModuleEndpoints.RevokeModuleAsOwnerRequest`, minus
 * `provisioningSecret`, the identical omission `GrantOwnerModuleDraft`'s own remarks explain.
 *
 * Omitting `force` (or setting it `false`) is never ambiguous - it unambiguously means "not forcing",
 * the always-safe reading (`adr/0118`'s own remarks on why this field, unlike `expiresAt`, carries no
 * required-nullable ceremony). `reason` only matters when `force` is `true`, and the server is the one
 * that decides whether it was needed - this console never tries to know in advance whether the row
 * being revoked is a grant or a purchase, it reads that off `OwnerSiteModule.grantedByOwner` and asks
 * for a reason before ever sending the request when it is not.
 */
export interface RevokeOwnerModuleDraft {
  force: boolean;
  reason: string | null;
}

/**
 * `23-65`: the outcome of revoking a module as the platform owner. `"requires-force"` is
 * `adr/0118`'s own asymmetry landing in the browser - a purchase, revoked without `force` - and it is
 * a distinct state from `"invalid"` because the remedy is not "fix what you typed", it is "state
 * plainly that you mean to override this and say why" (`Module.RevokePurchaseRequiresForce`, `409`).
 * `"invalid"` here covers the one remaining caller mistake this route can make: `force` set with a
 * blank or missing reason (`Module.RevokeReasonRequired`, `400`).
 */
export type RevokeOwnerModuleOutcome =
  | { status: "ok" }
  | { status: "not-authorized" }
  | { status: "not-found" }
  | { status: "requires-force"; message: string }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string };

/**
 * `23-65`/`adr/0150`: `DELETE /api/v1/owner/sites/{siteId}/modules/{moduleKey}` - the platform owner's
 * own revoke. `moduleKey` is a path segment, exactly like the server's own route; `fetch` does not
 * URL-encode it for you, so a module key containing a character that needs escaping would need one
 * here - not a real concern today (`Domain.ModuleKey`'s own charset is narrower than that), named so a
 * future module key format is not the thing that quietly breaks this call.
 */
export async function revokeOwnerModule(
  accessToken: string,
  siteId: string,
  moduleKey: string,
  draft: RevokeOwnerModuleDraft,
): Promise<RevokeOwnerModuleOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites/${siteId}/modules/${encodeURIComponent(moduleKey)}`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(draft),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (response.status === 409) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "requires-force", message: problem.detail ?? "This module was purchased by the tenant, not granted." };
  }

  if (response.status === 400) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "A reason is required." };
  }

  if (response.status === 503) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "unavailable", message: problem.detail ?? "This deployment cannot complete this request right now." };
  }

  if (!response.ok) {
    throw new Error(`Failed to revoke the module: ${response.status}`);
  }

  return { status: "ok" };
}

/**
 * `23-68`: the body `POST /api/v1/owner/sites/{siteId}/operators/{operatorId}/restore-seat` takes -
 * mirrors `Ago.Chat.Api.Owner.OwnerOperatorsEndpoints.RestoreOperatorSeatRequest`. `force`/`reason`
 * are the identical asymmetry `RevokeOwnerModuleDraft`'s own remarks describe for its sibling override:
 * omitting `force` (or setting it `false`) unambiguously means "not forcing" - the ordinary restore,
 * within the tenant's own seat limit, needs neither field. This console never tries to know in advance
 * whether a given restore will exceed the limit; it tries the ordinary call first and only asks for a
 * reason once the server says `"requires-force"` (`restoreOwnerOperatorSeat`'s own remarks).
 */
export interface RestoreOwnerOperatorSeatDraft {
  force: boolean;
  reason: string | null;
}

/**
 * `23-68`: what actually happened - mirrors `Ago.Chat.Api.Owner.OwnerOperatorsEndpoints.RestoreOperatorSeatResponse`.
 * `alreadyHeldSeat` lets the console say "nothing to do" rather than implying a change that did not
 * occur; `overrodeSeatLimit` lets it say the seat limit was knowingly exceeded.
 */
export interface RestoreOwnerOperatorSeatResult {
  alreadyHeldSeat: boolean;
  overrodeSeatLimit: boolean;
}

/**
 * `23-68`: the outcome of restoring an operator's seat as the platform owner - the identical
 * `"requires-force"`/`"invalid"` split `RevokeOwnerModuleOutcome`'s own remarks describe for its
 * sibling override, restated for this one. `"requires-force"` is the seat-limit override landing in
 * the browser (`Operator.SeatRestoreExceedsLimitRequiresForce`, `409`) - the remedy is not "fix what
 * you typed", it is "state plainly that you mean to override the seat limit and say why". `"invalid"`
 * covers the one remaining caller mistake this route can make: `force` set with a blank or missing
 * reason (`Operator.SeatRestoreReasonRequired`, `400`).
 */
export type RestoreOwnerOperatorSeatOutcome =
  | { status: "ok"; result: RestoreOwnerOperatorSeatResult }
  | { status: "not-authorized" }
  | { status: "not-found" }
  | { status: "requires-force"; message: string }
  | { status: "invalid"; message: string };

/**
 * `23-68`: `POST /api/v1/owner/sites/{siteId}/operators/{operatorId}/restore-seat` - the platform
 * owner's own recovery write, reached from `/owner`'s tenant detail screen. Called first with
 * `force: false` for the ordinary case (this item's own headline scenario); a caller that gets back
 * `"requires-force"` collects a reason and calls again with `force: true` - the identical two-call
 * shape `OwnerSiteDetailPage`'s own revoke-a-purchase flow already uses for `revokeOwnerModule`.
 */
export async function restoreOwnerOperatorSeat(
  accessToken: string,
  siteId: string,
  operatorId: string,
  draft: RestoreOwnerOperatorSeatDraft,
): Promise<RestoreOwnerOperatorSeatOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/sites/${siteId}/operators/${operatorId}/restore-seat`);

  const response = await fetch(url, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(draft),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }

  if (response.status === 409) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "requires-force", message: problem.detail ?? "This would put the site over its seat limit." };
  }

  if (response.status === 400) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "A reason is required." };
  }

  if (!response.ok) {
    throw new Error(`Failed to restore the operator's seat: ${response.status}`);
  }

  const body = (await response.json()) as { alreadyHeldSeat: boolean; overrodeSeatLimit: boolean };
  return { status: "ok", result: { alreadyHeldSeat: body.alreadyHeldSeat, overrodeSeatLimit: body.overrodeSeatLimit } };
}

/**
 * `25-20`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerSeatTierDto`. `minSeats`
 * and `maxSeats` are inclusive, matching the server's own range check.
 */
export interface OwnerSeatTier {
  key: string;
  minSeats: number;
  maxSeats: number;
}

/**
 * `25-20`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerSeatPricingDto` - the
 * one billing mechanism in this product with a real, currently-charged number behind it. Every tier
 * in `tiers` charges the identical `pricePerSeatRub`; the price lives here, once, rather than
 * repeated unchanged on each tier row.
 */
export interface OwnerSeatPricing {
  pricePerSeatRub: number;
  billingPeriodDays: number;
  freeSeatsIncluded: number;
  tiers: OwnerSeatTier[];
}

/**
 * `25-20`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerBillingOptionDto`.
 * `priceRub` is `null` on every deployment this product can describe today - see `OwnerPricingPage`'s
 * own remarks for why an empty `billingOptions` list (never populated with an invented number) is the
 * honest rendering of this shape rather than a gap in it.
 */
export interface OwnerBillingOption {
  optionKey: string;
  moduleKey: string | null;
  priceRub: number | null;
}

/**
 * `25-43`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerPricedResourceDto` -
 * one code-registered price key, whatever the server currently knows about it. `currentVersion`/
 * `currentAmountRub` are both `null` together, exactly when nothing has ever been published for this
 * key yet - `25-43`'s own second decision made visible here: "built, not yet for sale" is the
 * ordinary state, never rendered as an error.
 */
export interface OwnerPricedResource {
  key: string;
  label: string;
  currentVersion: string | null;
  currentAmountRub: number | null;
}

/**
 * `25-20`'s wire shape, mirrored field for field from `Ago.Chat.Contracts.OwnerPricingResponse`.
 *
 * `25-43`: `pricedResources` is new on this response - added within the version, never replacing
 * `seatPricing`/`billingOptions` (`api-design.md`: "add within a version, never remove or rename").
 * It is the list `publishPriceVersion` below picks a key from; nothing on this page may invent one.
 */
export interface OwnerPricing {
  seatPricing: OwnerSeatPricing;
  billingOptions: OwnerBillingOption[];
  pricedResources: OwnerPricedResource[];
}

/** The outcome of asking `25-20`'s endpoint for the price list - the identical `"not-authorized"`
 * shape `OwnerSitesOutcome`'s own remarks establish, reused here for the identical reason: a
 * `401`/`403` is the `RequirePlatformOwner` policy's own answer, not an exception. */
export type OwnerPricingOutcome =
  | { status: "ok"; pricing: OwnerPricing }
  | { status: "not-authorized" };

/**
 * `25-20`: `GET /api/v1/owner/pricing` - every currently-paid capability's price, read from the same
 * configuration the billing code itself charges from. Read-only, no parameters: one deployment has
 * exactly one price list.
 */
export async function fetchOwnerPricing(accessToken: string): Promise<OwnerPricingOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/pricing`);

  const response = await fetch(url, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (!response.ok) {
    throw new Error(`Failed to load the platform price list: ${response.status}`);
  }

  return { status: "ok", pricing: (await response.json()) as OwnerPricing };
}

/**
 * `25-43`: the outcome of publishing a new price version - the same `not-authorized`/`invalid`
 * two-status shape `GrantOwnerModuleQuantityOutcome` already establishes, plus `"conflict"` for the
 * one failure mode unique to this write: a concurrent publish for the identical key already won
 * (`PublishPriceVersionHandler`'s own bounded retry loop exhausted, `409`) - a caller that resubmits
 * the identical form should simply succeed against the fresher row, so this is named separately from
 * `"invalid"` rather than folded into it.
 */
export type PublishPriceVersionOutcome =
  | { status: "ok"; version: string; sequence: number; amountRub: number; publishedAt: string }
  | { status: "not-authorized" }
  | { status: "invalid"; message: string }
  | { status: "conflict"; message: string };

/**
 * `25-43`: `POST /api/v1/owner/prices/{key}/versions` - publishes a new version for an
 * already-registered key. `key` must be one of `OwnerPricing.pricedResources`' own keys; the server
 * refuses (`"invalid"`, `400`) anything else - this function never lets a caller invent one, the same
 * "the owner only ever sets or changes the Rouble figure for a key that already exists" boundary
 * `25-43`'s own first decision draws.
 */
export async function publishPriceVersion(
  accessToken: string,
  key: string,
  amountRub: number,
): Promise<PublishPriceVersionOutcome> {
  const url = new URL(`${config.apiBaseUrl}/api/v1/owner/prices/${encodeURIComponent(key)}/versions`);

  const response = await fetch(url, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ amountRub }),
  });

  if (response.status === 401 || response.status === 403) {
    return { status: "not-authorized" };
  }

  if (response.status === 400) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "invalid", message: problem.detail ?? "This price could not be published." };
  }

  if (response.status === 409) {
    const problem = (await response.json()) as { detail?: string };
    return { status: "conflict", message: problem.detail ?? "Another publish for this key won the race - try again." };
  }

  if (!response.ok) {
    throw new Error(`Failed to publish the price version: ${response.status}`);
  }

  const body = (await response.json()) as { key: string; version: string; sequence: number; amountRub: number; publishedAt: string };
  return { status: "ok", version: body.version, sequence: body.sequence, amountRub: body.amountRub, publishedAt: body.publishedAt };
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
