import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOwnerSites, type OwnerSiteSummary } from "../api/ownerApi.js";
import { en } from "../i18n/en.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavItems } from "../shell/consoleNav.js";
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
 */
export function OwnerSitesPage() {
  const { user, logout } = useAuth();
  const { siteId, hasPermission } = usePermissions();
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

  useEffect(() => {
    if (!accessToken) {
      // `RequireAuth` guarantees a signed-in user by the time this renders - same "reaching here is
      // a wiring bug" reasoning the other pages state.
      return;
    }

    let cancelled = false;
    // Reset to the loading state on every new search, not only on mount - a stale page from the
    // previous query must not sit on screen while a new one loads (`sites: null` is what
    // `Skeleton`/table branch below treats as "loading").
    setSites(null);
    setError(null);
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
          setError(err instanceof Error ? err.message : "Failed to load platform sites.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeQuery]);

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
        setError(err instanceof Error ? err.message : "Failed to load more platform sites.");
      })
      .finally(() => setLoadingMore(false));
  }, [accessToken, nextBefore, activeQuery]);

  const columns = useMemo(
    () => (recentWindowDays === null ? [] : buildColumns(recentWindowDays, timeZone)),
    [recentWindowDays, timeZone],
  );

  return (
    <AppShell
      // `4-06`(console): the same flat nav `OperatorShell` builds - Conversations and, once
      // `site:configure` says so, the site-scoped screens - only when this caller demonstrably holds
      // an operator seat as well (a `siteId` came back from `GET /api/v1/operators/me`). A platform
      // owner without one has nowhere else in the console to go, and a "Conversations" link that
      // landed on the operator workspace's hub connection would fail there rather than here - so
      // that whole block is absent, not merely unreachable, for that identity. "Platform sites" is
      // always last and always present: this page is itself what that link points at, so it renders
      // with the active state the console uses everywhere else for "you are here".
      // `11-11`: `en` explicitly, never `useStrings()` - this page is deliberately English-only
      // regardless of any tenant this identity also administers (confirmed with the author, `11-11`'s
      // own backlog item: `/owner` is not scoped to one tenant, so it never follows one's language).
      nav={[
        ...(siteId ? buildTenantNavItems(hasPermission, en) : []),
        { to: "/owner", label: en.navPlatformSites, end: true },
      ]}
      // `12-04`: narrowed only once `12-02`'s endpoint has actually accepted this caller. While the
      // answer is still `"unknown"`, and on a refusal, the reader is not demonstrably the owner, and
      // the stricter shared-login wording is the true thing to say to them.
      demoNoticeAudience={access === "granted" ? "platform-owner" : "shared-login"}
      // Found live, 2026-08-27: this page's own content is a site table, the same "not prose" case
      // `OperatorShell`'s tenant-management tabs already settled - the reading-width cap left the
      // identical unexplained gap here that it did on those.
      wide
      // Found live: even an identity that also holds an operator seat should read "platform owner
      // console" while it is on this page specifically - the header names the tab, not the person.
      tagline={en.consoleTaglineOwner}
      identity={
        <ShellIdentity
          operator={operatorDisplayName(user)}
          siteId={siteId}
          onSignOut={() => void logout()}
        />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening the platform operations view…" />}

      {access === "refused" && (
        <>
          <PageHead title="Platform operations" />
          {/* `Alert tone="danger"` carries `role="alert"`, the same assertive live region every
              refusal branch in this console uses. No table, no skeleton, no partial row: the server
              refused before any site data existed in this browser. */}
          <Alert tone="danger" title="Not authorized">
            This view is restricted to the platform owner. The server refused the request, so no site
            data was loaded.
          </Alert>
          {/* `4-06`(console): no separate "back" link here any more - the nav bar above already
              offers "Conversations" whenever `siteId` says this identity has somewhere to go back
              to, the same nav every other console screen shows. A second, differently-worded way to
              say the same thing is exactly the inconsistency this item's redesign removes. */}
        </>
      )}

      {error !== null && access !== "refused" && (
        <>
          {access === "unknown" && <PageHead title="Platform operations" />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && (
        <>
          <PageHead
            title="Platform sites"
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
                ? "Every site on this deployment, as the platform owner sees it. Read-only - this screen shows numbers, it changes nothing."
                : `Every site on this deployment, as the platform owner sees it. Read-only - this screen shows numbers, it changes nothing. Message volume and last activity cover ${describeRecentWindow(recentWindowDays)} - the window the API itself reports; seats, conversations and stored bytes are all-time.`
            }
          />

          {/* `23-14`: the search field - a name/id substring, submitted on Enter/click rather than
              per keystroke (the same form-submit shape `SearchConversationsPage` already uses), since
              this is the one deliberately cross-tenant read in the codebase and a per-keystroke fetch
              would spam it. Rendered above the table in every loading/empty/loaded state below, so the
              owner can adjust a search while the previous result is still loading. */}
          <form className="ago-row" onSubmit={handleSearchSubmit}>
            <Field label="Find a site by name or id">
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Part of a site's name, or part of its id"
                />
              )}
            </Field>
            <Button type="submit">Search</Button>
            {activeQuery !== undefined && (
              <Button type="button" onClick={handleClearSearch}>
                Clear
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
            <Skeleton lines={4} label="Loading platform sites…" />
          ) : sites.length === 0 ? (
            <p className="ago-empty">
              {activeQuery === undefined
                ? "No sites yet."
                : // `23-14`'s own guard: still says how many of how many, even at zero matches -
                  // never just "no results", which would read like the search itself failed rather
                  // than like a real, complete answer.
                  `No sites match "${activeQuery}". ${matchingSites !== null && totalSites !== null ? formatMatchSummary(matchingSites, totalSites) : ""}`}
            </p>
          ) : (
            <>
              {/* `23-14`: only while a search is active - an unfiltered "41 of 41 sites match" says
                  nothing the row count below does not already say plainer. */}
              {activeQuery !== undefined && matchingSites !== null && totalSites !== null && (
                <p className="ago-meta">{formatMatchSummary(matchingSites, totalSites)}</p>
              )}
              <Table
                // Not "newest first": `12-02` pages by site id descending, which is a stable
                // cursor order and not a chronological or a usage ranking. Saying so is the point
                // - a caption claiming an order the data does not have is how a reader ends up
                // believing the top row matters most.
                caption="Every site on this deployment, in the API's own cursor order (site id, descending) - not ranked by size or activity."
                columns={columns}
                rows={sites}
                rowKey={(site) => site.siteId}
              />
              <div className="ago-row">
                <span className="ago-meta">
                  Showing {formatCount(sites.length)} {sites.length === 1 ? "site" : "sites"}
                  {nextBefore === null ? "." : " so far."}
                </span>
                {nextBefore !== null && (
                  <Button onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
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
 */
function buildColumns(recentWindowDays: number, timeZone: string | null): TableColumn<OwnerSiteSummary>[] {
  return [
    {
      key: "site",
      header: "Site",
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
            <span className="ago-meta">Unnamed</span>
          )}
          <Badge tone="neutral" mono>
            {site.siteId.slice(0, 8)}
          </Badge>
        </Link>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      // Rendered exactly as the server sent it. `12-02` is explicit that `"free"` is the only tier
      // that exists today and is not a placeholder - so there is no mapping table here, no icon and
      // no "upgrade" affordance implying a richer plan system that does not exist yet.
      render: (site) => <Badge tone="neutral">{site.tier}</Badge>,
    },
    { key: "seats", header: "Seats", align: "end", render: (site) => formatCount(site.seatCount) },
    {
      key: "conversations",
      header: "Conversations",
      align: "end",
      render: (site) => formatCount(site.conversationCount),
    },
    {
      key: "messages",
      header: formatRecentMessagesHeader(recentWindowDays),
      align: "end",
      render: (site) => formatCount(site.recentMessageCount),
    },
    {
      key: "attachments",
      header: "Attachments",
      align: "end",
      // The exact byte count stays one hover away - `formatByteSize` rounds towards zero, and the
      // rounded figure is for comparing rows, not for quoting.
      render: (site) => <span title={`${formatCount(site.attachmentBytes)} bytes`}>{formatByteSize(site.attachmentBytes)}</span>,
    },
    {
      key: "created",
      header: "Created",
      render: (site) => {
        const created = parseInstant(site.createdAt);
        if (created === null) {
          // `12-02`: sites predating `sites.created_at` were never backfilled, because the system
          // genuinely does not know when they were created. Printing today, the epoch, or an em
          // dash that reads as zero would each be a fabricated fact; this says what is true. (An
          // unparseable value lands here too - there is nothing truthful to render from it either.)
          return (
            <span className="ago-meta" title="This site predates the platform recording creation dates, so its creation date is genuinely unknown.">
              Not recorded
            </span>
          );
        }

        // `343`: no `strings` argument, on purpose - this page never calls `useStrings()` (see this
        // file's own remarks above), so there is no locale value to pass, and `formatAbsolute`/
        // `formatDateStamp`'s `= en` default renders exactly the fixed English this screen already
        // committed to.
        return <span title={formatAbsolute(created, timeZone)}>{formatDateStamp(created, timeZone)}</span>;
      },
    },
    {
      key: "activity",
      header: "Last activity",
      render: (site) => {
        const lastMessage = parseInstant(site.lastMessageAt);
        if (lastMessage === null) {
          // Never "Never". The API's value is windowed, so silence here means "nothing inside the
          // window", which a long-dormant tenant and a brand-new empty one both produce.
          return (
            <span
              className="ago-meta"
              title={`This is the most recent message within ${describeRecentWindow(recentWindowDays)} only. An older message may exist; the API does not report one, deliberately.`}
            >
              {formatNoRecentActivity(recentWindowDays)}
            </span>
          );
        }

        return <span title={formatAbsolute(lastMessage, timeZone)}>{formatDateStamp(lastMessage, timeZone)}</span>;
      },
    },
  ];
}
