import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOwnerSites, type OwnerSiteSummary } from "../api/ownerApi.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavSections } from "../shell/consoleNav.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatMatchSummary,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
} from "./ownerSites.js";

/** What the server has said so far about this caller's access to `12-02`'s endpoint. `"unknown"` is
 * the pre-answer state, and it renders as neither the table nor a refusal - showing either before
 * the server has spoken would be the console guessing at an authorization decision that is not
 * its to make. */
type OwnerAccess = "unknown" | "granted" | "refused";

/**
 * `12-03`: the platform owner's cross-tenant operations view - every site on the deployment with its
 * tier, seats, conversation and message volume, stored bytes and activity dates, from `12-02`'s
 * `GET /api/v1/owner/sites`.
 *
 * **Read-only, deliberately and completely.** No suspend, no edit, no "grant a bonus feature" -
 * `12-03`'s Out of scope stops this surface at visibility, and a write path behind
 * `RequirePlatformOwner` is a materially bigger authorization decision than a table.
 *
 * **No verdicts either.** Nothing here colours, ranks, sorts or flags a row: `12-02` deliberately
 * returns raw signals and no abuse score, and inventing a client-side threshold ("red above N
 * messages") would be exactly the invented number `CLAUDE.md` forbids and the computed verdict
 * `12-02`'s Out of scope rules out. The table shows real numbers in the order the API returns them;
 * the owner does the judging.
 *
 * **Structurally separate from `5-08`'s `/admin` view**, as `12-03` requires: a different route with
 * no shared segment, a different endpoint, a different gate (a Keycloak realm role checked by
 * `RequirePlatformOwner`, not a site-scoped `site:configure` permission), and no shared component or
 * data-fetching tree - the only things in common are the design-system components every screen uses.
 * The word "admin" appears nowhere in this screen's route, title or navigation label, because in this
 * product it means a *tenant's own* supervisor.
 *
 * **Mounted outside the operator layout** (`App.tsx`): the platform owner is an identity Keycloak
 * grants, not an operator seat, so nothing here may assume an `operators` row exists. The operator
 * layout's `OperatorConnectionProvider` would open a per-operator SignalR hub connection this screen
 * has no use for and a non-operator owner's token could not sustain. `PermissionsProvider` *is*
 * kept - it fails soft (its fetch 403s and leaves `siteId` null, logged), and it is what lets the
 * header offer a way back into the console for the ordinary case where the owner also holds an
 * operator seat, without offering a dead link to someone who does not.
 *
 * **`25-89`: no longer English-only.** `11-11`'s original call - restated here for years as "`en`
 * explicitly, never `useStrings()` ... `/owner` is not scoped to one tenant, so it never follows one's
 * language" - is superseded: the owner panel now reads `useStrings()` like every other console page,
 * wrapped in its own `OwnerStringsProvider` (`App.tsx`'s five `/owner/*` routes) rather than a
 * tenant's. The reasoning that survives is narrower than it reads above: there is genuinely no
 * *tenant* locale for a cross-tenant screen to follow, which is exactly why this page does not read
 * `StringsContext`'s bare default (still `en`, and still `/owner`'s own safety net for a route nobody
 * wires to a provider by mistake - `StringsContext.tsx`'s own doc comment) and instead wraps itself in
 * an explicit Russian provider, the identical shape `23-28` built for `/callback`/`/signup`/
 * `/onboarding`/`/redeem-invite` for the same underlying reason: no tenant to read from does not mean
 * no answer - it means Russian, chosen rather than defaulted to.
 */
export function OwnerSitesPage() {
  const { user, logout } = useAuth();
  const { siteId, hasPermission, enabledModules } = usePermissions();
  const strings = useStrings();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerAccess>("unknown");
  const [sites, setSites] = useState<OwnerSiteSummary[] | null>(null);
  const [recentWindowDays, setRecentWindowDays] = useState<number | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // `23-14`: `queryInput` is the text box's own uncommitted value; `activeQuery` is what was actually
  // submitted and is what the effect below re-fetches on. Kept apart deliberately - re-fetching on
  // every keystroke would spam the one deliberately cross-tenant read in the codebase, and the form's
  // own `onSubmit` (matching `SearchConversationsPage`'s precedent) is what commits one to the other.
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | undefined>(undefined);
  // `23-14`: reported by the server on every response, never derived from `sites.length` (only the
  // current page) - see `ownerSites.ts`'s own remarks on `formatMatchSummary` for why.
  const [matchingSites, setMatchingSites] = useState<number | null>(null);
  const [totalSites, setTotalSites] = useState<number | null>(null);

  const timeZone = useMemo(() => resolveTimeZone(), []);

  // `23-100`: adjusted during render, not in an effect - `react-hooks/set-state-in-effect` (v7) flags
  // a synchronous `setState` in an effect body (react.dev/learn/you-might-not-need-an-effect, "Adjusting
  // some state when a prop changes"). Reset to the loading state on every new search, not only on mount
  // - a stale page from the previous query must not sit on screen while a new one loads (`sites: null`
  // is what the `Skeleton`/table branch below treats as "loading"). Comparing against the previous
  // `activeQuery` here does the same reset one render earlier than the effect used to, with no commit
  // of the stale page in between - `VisitorHistoryPanel`'s identical `23-96` conversion is the
  // precedent.
  const [prevActiveQuery, setPrevActiveQuery] = useState(activeQuery);
  if (activeQuery !== prevActiveQuery) {
    setPrevActiveQuery(activeQuery);
    setSites(null);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time this renders - same "reaching here is
      // a wiring bug" reasoning the other pages state.
      return;
    }

    let cancelled = false;
    fetchOwnerSites(accessToken, undefined, activeQuery)
      .then((outcome) => {
        if (cancelled) {
          return;
        }

        if (outcome.status === "not-authorized") {
          // The server refused. That is the authoritative answer and the only one this screen acts
          // on - there is no partial state to render, because a refused response carries no body.
          setAccess("refused");
          return;
        }

        setAccess("granted");
        setSites(outcome.page.sites);
        setRecentWindowDays(outcome.page.recentWindowDays);
        setNextBefore(outcome.page.nextBefore);
        setMatchingSites(outcome.page.matchingSites);
        setTotalSites(outcome.page.totalSites);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Deliberately not folded into `refused`: "the API is broken" and "you may not see this"
          // are different facts, and telling the owner they lack access whenever the database is
          // down would send them looking for the wrong problem.
          setError(err instanceof Error ? err.message : strings.ownerSitesLoadFailed);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeQuery, strings]);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = queryInput.trim();
      // `undefined`, not `""`, once trimmed empty - `activeQuery === undefined` is this component's
      // own "no search" state, matching `fetchOwnerSites`'s own "blank means no filter" contract.
      setActiveQuery(trimmed.length > 0 ? trimmed : undefined);
    },
    [queryInput],
  );

  const handleClearSearch = useCallback(() => {
    setQueryInput("");
    setActiveQuery(undefined);
  }, []);

  const loadMore = useCallback(() => {
    if (!accessToken || nextBefore === null) {
      return;
    }

    setLoadingMore(true);
    // `activeQuery` rides along - a page two of a search must stay filtered by the same predicate,
    // never silently widen back to the unfiltered list.
    fetchOwnerSites(accessToken, nextBefore, activeQuery)
      .then((outcome) => {
        if (outcome.status === "not-authorized") {
          // The role can be revoked mid-session; the server re-checks every call, so page two is a
          // real opportunity for the answer to change. Fall back to the refusal state rather than
          // leaving a half-loaded table on screen.
          setAccess("refused");
          setSites(null);
          return;
        }

        // Appended, not replaced - keyset paging over `12-02`'s own cursor, never a client-side
        // slice of a full result set. `12-02`'s "a full page implies there may be more" rule means
        // the last cursor can legitimately yield zero rows, which this handles by simply appending
        // nothing and taking the `null` cursor that comes with it.
        setSites((current) => [...(current ?? []), ...outcome.page.sites]);
        setRecentWindowDays(outcome.page.recentWindowDays);
        setNextBefore(outcome.page.nextBefore);
        setMatchingSites(outcome.page.matchingSites);
        setTotalSites(outcome.page.totalSites);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : strings.ownerSitesLoadMoreFailed);
      })
      .finally(() => setLoadingMore(false));
  }, [accessToken, nextBefore, activeQuery, strings]);

  const columns = useMemo(
    () => (recentWindowDays === null ? [] : buildColumns(recentWindowDays, timeZone, strings)),
    [recentWindowDays, timeZone, strings],
  );

  return (
    <AppShell
      // `4-06`(console): the same tenant-scoped sections `OperatorShell` builds - only when this
      // caller demonstrably holds an operator seat as well (a `siteId` came back from
      // `GET /api/v1/operators/me`). A platform owner without one has nowhere else in the console to
      // go, and a link that landed on the operator workspace's hub connection would fail there rather
      // than here - so that whole structure is absent, not merely unreachable, for that identity.
      // "Platform sites" is always present, as `AppShell`'s own `pinnedItem` - this page is itself
      // what that link points at, so it renders with the active state the console uses everywhere
      // else for "you are here".
      // `25-89`: `strings` (from `useStrings()`), no longer the hardcoded `en` import - this call
      // used to be `/owner`'s one deliberate exception to "read the active locale"; it no longer is,
      // now that the owner panel has an explicit Russian provider of its own rather than none at all.
      sections={siteId ? buildTenantNavSections(hasPermission, strings, enabledModules ?? []) : []}
      // `23-43`: only once the server has actually accepted this caller, exactly as
      // `demoNoticeAudience` below already is. The demo console's operator login is published,
      // so anyone can sign in and type `/owner`; drawing a rail link to a view they were just
      // refused tells a stranger that a platform-operations view exists and where it lives.
      // "unknown" draws nothing either - a link that appears for a moment and then vanishes on
      // the refusal has already said it.
      pinnedItem={access === "granted" ? { to: "/owner", label: strings.navPlatformSites, end: true } : undefined}
      // `12-04`: narrowed only once `12-02`'s endpoint has actually accepted this caller. While the
      // answer is still `"unknown"`, and on a refusal, the reader is not demonstrably the owner, and
      // the stricter shared-login wording is the true thing to say to them.
      // `23-45`: the platform owner's own screens are reached by an account whose credentials are
      // published nowhere, and a refused caller is not identified at all - neither draws the band.
      credentialsArePublished={false}
      // Found live, 2026-08-27: this page's own content is a site table, the same "not prose" case
      // `OperatorShell`'s tenant-management tabs already settled - the reading-width cap left the
      // identical unexplained gap here that it did on those.
      wide
      identity={
        <ShellIdentity
          operator={operatorDisplayName(user)}
          siteId={siteId}
          onSignOut={() => void logout()}
        />
      }
    >
      {access === "unknown" && error === null && <Spinner label={strings.ownerSitesOpeningLabel} />}

      {access === "refused" && (
        <>
          <PageHead title={strings.ownerOperationsTitle} />
          {/* `Alert tone="danger"` carries `role="alert"`, the same assertive live region every
              refusal branch in this console uses. No table, no skeleton, no partial row: the server
              refused before any site data existed in this browser. */}
          {/* `23-43`: says that the caller was refused, and no longer says by what. "Restricted to
              the platform owner" told a reader who is not one that such a role exists on this
              deployment - which on a console whose operator login is published means telling
              anybody. Refusing without naming the thing refused is the smaller disclosure and is
              equally true; the reader who *is* the owner never sees this branch. */}
          <Alert tone="danger" title={strings.ownerNotAuthorizedTitle}>
            {strings.ownerSiteAccessRefusedBody}
          </Alert>
          {/* `4-06`(console): no separate "back" link here any more - the nav bar above already
              offers "Conversations" whenever `siteId` says this identity has somewhere to go back
              to, the same nav every other console screen shows. A second, differently-worded way to
              say the same thing is exactly the inconsistency this item's redesign removes. */}
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title={strings.ownerOperationsTitle} />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && (
        <>
          <PageHead
            title={strings.navPlatformSites}
            // `25-20`: the price list's own entry point - a plain in-page link rather than a second
            // `AppShell` `pinnedItem` (that slot holds exactly one entry, "Platform sites" itself,
            // and both owner screens already reuse it to point back here). `PageHead`'s own `aside`
            // slot is "status or secondary controls, rendered opposite the title" - exactly this,
            // and the other pages that already put something there (`CalendarBookingsPage`,
            // `CalendarContactsPage`) use `Button`, never a bare `Link` - carried over here by
            // applying `Button`'s own CSS classes to the `Link`, so this stays a real `<a>` (ctrl-click,
            // right-click "copy link", the browser's own status-bar preview all keep working, unlike
            // wrapping a `<button onClick={navigate(...)}>` would) while getting the identical
            // touch-target sizing - a bare `Link` here failed the UX gate's own minimum-interactive-
            // size check live in CI (63x22px against the enforced minimum).
            aside={
              <div className="ago-row">
                {/* `22-08`: the console's own "who is currently suspended" screen - reached from
                    here, not from a second pinned nav entry, the identical precedent this page's
                    own "Price list" link already sets for `OwnerPricingPage`. */}
                <Link to="/owner/suspensions" className="ago-btn ago-btn--secondary ago-btn--md">
                  {strings.ownerSitesAsideSuspended}
                </Link>
                <Link to="/owner/pricing" className="ago-btn ago-btn--secondary ago-btn--md">
                  {strings.ownerSitesAsidePricing}
                </Link>
                {/* `24-17`: the live tenant-isolation figures - the identical "reached from here,
                    not from a second pinned nav entry" precedent the two links above already set. */}
                <Link to="/owner/tenant-isolation" className="ago-btn ago-btn--secondary ago-btn--md">
                  {strings.ownerSitesAsideTenantIsolation}
                </Link>
              </div>
            }
            // Found live, 2026-08-28: the table below used to sit in its own titled `Panel` ("Sites"),
            // whose description carried the one fact `PageHead` did not already say - the time window
            // behind "message volume" and "last activity". That fact is real, not redundant (unlike
            // `AdminConversationsPage`'s titleless `Panel`, which repeated what its own `PageHead`
            // already said), so removing the `Panel` folds it in here rather than dropping it. The
            // `recentWindowDays === null` guard mirrors `Panel`'s own defensive check even though
            // `access` and `recentWindowDays` are set in the same state update and so become non-null
            // together in practice.
            description={
              recentWindowDays === null
                ? strings.ownerSitesDescriptionBase
                : `${strings.ownerSitesDescriptionBase}${strings.ownerSitesDescriptionWindowedMiddle}${describeRecentWindow(recentWindowDays, strings)}${strings.ownerSitesDescriptionWindowedSuffix}`
            }
          />

          {/* `23-14`: the search field - a name/id substring, submitted on Enter/click rather than
              per keystroke (the same form-submit shape `SearchConversationsPage` already uses), since
              this is the one deliberately cross-tenant read in the codebase and a per-keystroke fetch
              would spam it. Rendered above the table in every loading/empty/loaded state below, so the
              owner can adjust a search while the previous result is still loading. */}
          <form className="ago-row" onSubmit={handleSearchSubmit}>
            <Field label={strings.ownerSitesSearchLabel}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={strings.ownerSitesSearchPlaceholder}
                />
              )}
            </Field>
            <Button type="submit">{strings.ownerSitesSearchButton}</Button>
            {activeQuery !== undefined && (
              <Button type="button" onClick={handleClearSearch}>
                {strings.ownerSitesClearButton}
              </Button>
            )}
          </form>

          {/* No `Panel` wrapper any more - the identical fix `AdminConversationsPage` already got:
              `.ago-table-scroll` (which `Table` renders) already carries its own complete card
              (border, radius, background), the same treatment `.ago-panel` gives its own `<section>`.
              Nesting one inside the other was two cards, and the outer one's padding was the "extra
              white container" around the table that a titled `Panel` had nothing left to justify once
              its title and description moved to `PageHead` above. `Skeleton`/`.ago-empty` are equally
              self-contained (their own border/background), the same bare-block pattern
              `AdminConversationsPage` and the workspace's queue lists already use. */}
          {sites === null ? (
            <Skeleton lines={4} label={strings.ownerSitesSkeletonLabel} />
          ) : sites.length === 0 ? (
            <p className="ago-empty">
              {activeQuery === undefined
                ? strings.ownerSitesEmpty
                : // `23-14`'s own guard: still says how many of how many, even at zero matches -
                  // never just "no results", which would read like the search itself failed rather
                  // than like a real, complete answer.
                  `${strings.ownerSitesNoMatchPrefix}${activeQuery}${strings.ownerSitesNoMatchSuffix}${matchingSites !== null && totalSites !== null ? formatMatchSummary(matchingSites, totalSites, strings) : ""}`}
            </p>
          ) : (
            <>
              {/* `23-14`: only while a search is active - an unfiltered "41 of 41 sites match" says
                  nothing the row count below does not already say plainer. */}
              {activeQuery !== undefined && matchingSites !== null && totalSites !== null && (
                <p className="ago-meta">{formatMatchSummary(matchingSites, totalSites, strings)}</p>
              )}
              <Table
                // Not "newest first": `12-02` pages by site id descending, which is a stable
                // cursor order and not a chronological or a usage ranking. Saying so is the point
                // - a caption claiming an order the data does not have is how a reader ends up
                // believing the top row matters most.
                caption={strings.ownerSitesTableCaption}
                columns={columns}
                rows={sites}
                rowKey={(site) => site.siteId}
              />
              <div className="ago-row">
                <span className="ago-meta">
                  {strings.ownerSitesShowingPrefix}
                  {formatCount(sites.length)} {sites.length === 1 ? strings.ownerSiteWordOne : strings.ownerSiteWordOther}
                  {nextBefore === null ? strings.ownerSitesShowingPeriod : strings.ownerSitesShowingSoFar}
                </span>
                {nextBefore !== null && (
                  <Button onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? strings.ownerSitesLoadMoreLoading : strings.ownerSitesLoadMoreButton}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

/**
 * Built per response rather than declared as a constant (which is what `AdminConversationsPage` can
 * do, because its columns are fixed): the message-volume header names the server's own
 * `recentWindowDays`, so the columns cannot exist before the first response does. That is the whole
 * mechanism by which this screen cannot hardcode "30 days".
 *
 * `25-89`: takes `strings` now - every header and cell this builds is user-facing text.
 */
function buildColumns(recentWindowDays: number, timeZone: string | null, strings: ConsoleStrings): TableColumn<OwnerSiteSummary>[] {
  return [
    {
      key: "site",
      header: strings.ownerSitesColumnSite,
      render: (site) => (
        // `23-14`: the row link `ui-inventory.md` §8.1 recorded as absent - a plain in-page
        // navigation to the per-tenant detail read, not a new tab and not a button, the same
        // "a row that leads somewhere is a link" convention every other linked row in this console
        // uses. Wraps the whole cell (name-or-"Unnamed" plus the id badge) so either half is a
        // click target, not only the name text.
        <Link to={`/owner/sites/${site.siteId}`} className="ago-row ago-row--tight">
          {/* A site's name really can be the empty string - the seeded demo tenant's is, observed
              live against the local cluster, because it predates `10-02`'s registration flow (which
              does require one). A blank cell would read as a rendering bug; saying "Unnamed" states
              the fact, and the id beside it is what identifies the row either way. */}
          {site.name.trim().length > 0 ? (
            <strong>{site.name}</strong>
          ) : (
            <span className="ago-meta">{strings.ownerSitesUnnamedSiteShort}</span>
          )}
          <Badge tone="neutral" mono>
            {site.siteId.slice(0, 8)}
          </Badge>
        </Link>
      ),
    },
    {
      key: "tier",
      header: strings.ownerSitesColumnTier,
      // Rendered exactly as the server sent it. `12-02` is explicit that `"free"` is the only tier
      // that exists today and is not a placeholder - so there is no mapping table here, no icon and
      // no "upgrade" affordance implying a richer plan system that does not exist yet.
      render: (site) => <Badge tone="neutral">{site.tier}</Badge>,
    },
    { key: "seats", header: strings.ownerSitesColumnSeats, align: "end", render: (site) => formatCount(site.seatCount) },
    {
      key: "conversations",
      header: strings.ownerSitesColumnConversations,
      align: "end",
      render: (site) => formatCount(site.conversationCount),
    },
    {
      key: "messages",
      header: formatRecentMessagesHeader(recentWindowDays, strings),
      align: "end",
      render: (site) => formatCount(site.recentMessageCount),
    },
    {
      key: "attachments",
      header: strings.ownerSitesColumnAttachments,
      align: "end",
      // The exact byte count stays one hover away - `formatByteSize` rounds towards zero, and the
      // rounded figure is for comparing rows, not for quoting.
      render: (site) => <span title={`${formatCount(site.attachmentBytes)}${strings.ownerBytesSuffix}`}>{formatByteSize(site.attachmentBytes)}</span>,
    },
    {
      key: "created",
      header: strings.ownerSitesColumnCreated,
      render: (site) => {
        const created = parseInstant(site.createdAt);
        if (created === null) {
          // `12-02`: sites predating `sites.created_at` were never backfilled, because the system
          // genuinely does not know when they were created. Printing today, the epoch, or an em
          // dash that reads as zero would each be a fabricated fact; this says what is true. (An
          // unparseable value lands here too - there is nothing truthful to render from it either.)
          return (
            <span className="ago-meta" title={strings.ownerSitesNotRecordedTitle}>
              {strings.ownerSitesNotRecorded}
            </span>
          );
        }

        // `25-89`: `formatAbsolute`/`formatDateStamp` still take no `strings` at all - not a gap this
        // item leaves behind, but a pre-existing, documented one for the *whole* console
        // (`ux-gate/lib/i18nCompleteness.ts`'s own "What this deliberately does not exempt": weekday
        // and month names come from `time/format.ts`'s own fixed `DISPLAY_LOCALE`, out of `11-06`'s
        // scope, unrelated to whether the page around them calls `useStrings()`).
        return <span title={formatAbsolute(created, timeZone)}>{formatDateStamp(created, timeZone)}</span>;
      },
    },
    {
      key: "activity",
      header: strings.ownerSitesColumnLastActivity,
      render: (site) => {
        const lastMessage = parseInstant(site.lastMessageAt);
        if (lastMessage === null) {
          // Never "Never". The API's value is windowed, so silence here means "nothing inside the
          // window", which a long-dormant tenant and a brand-new empty one both produce.
          return (
            <span
              className="ago-meta"
              title={`${strings.ownerSitesLastActivityTitlePrefix}${describeRecentWindow(recentWindowDays, strings)}${strings.ownerSitesLastActivityTitleSuffix}`}
            >
              {formatNoRecentActivity(recentWindowDays, strings)}
            </span>
          );
        }

        return <span title={formatAbsolute(lastMessage, timeZone)}>{formatDateStamp(lastMessage, timeZone)}</span>;
      },
    },
  ];
}
