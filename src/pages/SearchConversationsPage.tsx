import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { searchConversations } from "../api/conversationsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type { ConversationSearchResultDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** `ConversationSearchResultDto.conversationState`'s three values, given the same tones
 * `AdminConversationsPage`'s `STATE_TONE` already picked for the identical wire values - one mapping,
 * kept local rather than imported, since sharing it across two files for three lines is not worth the
 * coupling (`AdminConversationsPage`'s own object literal is not exported). */
const STATE_TONE: Record<ConversationSearchResultDto["conversationState"], "brand" | "success" | "neutral"> = {
  Waiting: "brand",
  Assigned: "success",
  Closed: "neutral",
};

function stateLabel(state: ConversationSearchResultDto["conversationState"], strings: ConsoleStrings): string {
  switch (state) {
    case "Waiting":
      return strings.queueWaitingTitle;
    case "Assigned":
      return strings.conversationStateAssigned;
    case "Closed":
      return strings.conversationStateClosed;
  }
}

/** `MessageDto.authorKind`'s three values - restated rather than imported from `Thread.tsx`'s own
 * `authorLabel`, which is private to that file and not worth exporting for one more three-case
 * switch (the same call `VisitorHistoryPanel`'s `stateLabel` already makes for its own restatement). */
function authorLabel(kind: ConversationSearchResultDto["authorKind"], strings: ConsoleStrings): string {
  switch (kind) {
    case "Visitor":
      return strings.threadAuthorVisitor;
    case "Operator":
      return strings.threadAuthorOperator;
    case "System":
      return strings.threadAuthorSystem;
  }
}

/** A `<input type="date">` value (`"2026-08-29"`, the browser's own local calendar date, no time or
 * zone) turned into the start/end of that day *in the browser's own local time* - `new Date(iso)`
 * with no `Z`/offset suffix parses as local time per spec, which is exactly what an operator typing a
 * calendar date means by it. Not derived from `resolveTimeZone()`'s IANA name: `Date` has no
 * constructor that takes an arbitrary zone name directly, and going through `Intl` to build one would
 * be considerably more code for a distinction (this browser's zone vs. some other named zone) that
 * cannot arise here - the input and the reader are the same person on the same machine. */
function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

interface ResultRowProps {
  result: ConversationSearchResultDto;
  timeZone: string | null;
  strings: ConsoleStrings;
}

/**
 * One search hit. `Assigned` is the only state rendered as a real link - `searchConversations`'s own
 * doc comment has the full reasoning: `Waiting` would silently claim the conversation if opened this
 * way, and `Closed` can never be rejoined by anyone through the hub. Both get the identical row shape
 * (state, author, timestamp, the complete matched body) minus the link, plus one line explaining why
 * there is not one - context to recognise the conversation is not withheld just because opening it
 * is.
 */
function ResultRow({ result, timeZone, strings }: ResultRowProps) {
  const createdAt = parseInstant(result.createdAt);

  const meta = (
    <span className="ago-list__row-top">
      <Badge tone={STATE_TONE[result.conversationState]}>{stateLabel(result.conversationState, strings)}</Badge>
      <span className="ago-meta">{authorLabel(result.authorKind, strings)}</span>
      {createdAt && (
        <span className="ago-meta" title={formatAbsolute(createdAt, timeZone, strings)}>
          {formatDateStamp(createdAt, timeZone, strings)}
        </span>
      )}
    </span>
  );

  const body = <p className="ago-search-result__body">{result.matchedBody}</p>;

  if (result.conversationState === "Assigned") {
    return (
      <li>
        {/* `?at=<sequence>` is `ConversationPage`'s own cue to attempt real positioning - see that
            file's own doc comment on `?at`. A plain `<Link>`, not a button with a click handler: this
            is navigation to a real, linkable, reloadable route, the same as every other conversation
            link in this console. */}
        <Link className="ago-list__row" to={`/conversations/${result.conversationId}?at=${result.sequence}`}>
          {meta}
          {body}
          <span className="ago-search-result__note">{strings.searchOpenLabel}</span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div className="ago-list__row ago-list__row--static">
        {meta}
        {body}
        <span className="ago-search-result__note">
          {result.conversationState === "Waiting" ? strings.searchWaitingNote : strings.searchClosedNote}
        </span>
      </div>
    </li>
  );
}

/**
 * `18-01`: `/search` - site-wide full-text search across a site's conversations, gated on
 * `site:configure`.
 *
 * <b>Why a page, not a panel.</b> `18-07`'s `VisitorHistoryPanel` was the closest existing "list of
 * hits, click one, it opens" surface, and was considered - but a panel is anchored to whichever
 * conversation is already open (it renders inside `ConversationPage`'s aside, scoped to *that*
 * conversation's own visitor). This search has no such anchor: it is independent of anything
 * currently open, needs its own phrase/date-range form and its own pagination, and is gated on the
 * same site-wide oversight permission `AdminConversationsPage` (`/admin`) already is - the existing
 * precedent for "an admin/supervisor screen with its own room" in this codebase is a page, not a
 * panel, and this item follows it rather than forcing a full search experience into a sidebar. The
 * gating shape below (`permissions === null` → spinner, `!hasPermission` → forbidden alert with a
 * back link) is copied from `AdminConversationsPage`/`WidgetConfigPage` byte-for-byte on purpose - one
 * more screen that drifts from that convention is a worse outcome than one more screen that repeats
 * six lines of it.
 *
 * <b>The date-range form is UX-only.</b> Like `WidgetConfigPage`'s hex-colour check, the browser-side
 * `<input type="date">` handling here does not have to be authoritative - `SearchConversationsHandler`
 * is (`from >= to` is its own `400 Conversation.SearchInvalidQuery`), and this page always renders the
 * range the *response* echoes back (`searchedFrom`/`searchedTo`), never the raw values typed into the
 * two date fields - see this item's own Done-when ("the bound is visible, not silent").
 */
export function SearchConversationsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());

  const [phraseInput, setPhraseInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  // The phrase/range a search was actually run with - kept separate from the three fields above so
  // "Load more" keeps paging the search that is on screen even if the operator has since edited the
  // form without submitting it again.
  const [activeQuery, setActiveQuery] = useState<{ phrase: string; from?: string; to?: string } | null>(null);

  const [results, setResults] = useState<ConversationSearchResultDto[]>([]);
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState<string | null>(null);
  const [searchedFrom, setSearchedFrom] = useState<string | null>(null);
  const [searchedTo, setSearchedTo] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: { phrase: string; from?: string; to?: string }, beforeMessageId: string | undefined) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      if (beforeMessageId) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await searchConversations(accessToken, {
          phrase: query.phrase,
          from: query.from,
          to: query.to,
          beforeMessageId,
        });
        setResults((prev) => (beforeMessageId ? [...prev, ...response.results] : response.results));
        setNextBeforeMessageId(response.nextBeforeMessageId);
        setSearchedFrom(response.searchedFrom);
        setSearchedTo(response.searchedTo);
        setHasSearched(true);
      } catch (err) {
        if (err instanceof ApiProblemError && err.code === "Conversation.Forbidden") {
          setError(strings.searchForbiddenError);
        } else if (err instanceof ApiProblemError && err.code === "Conversation.SearchInvalidQuery") {
          setError(strings.searchInvalidQueryError);
        } else {
          setError(strings.searchLoadError);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.access_token, strings],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const phrase = phraseInput.trim();
    if (!phrase) {
      setError(strings.searchInvalidQueryError);
      return;
    }

    const query = {
      phrase,
      from: fromInput ? startOfDayIso(fromInput) : undefined,
      to: toInput ? endOfDayIso(toInput) : undefined,
    };
    setActiveQuery(query);
    setResults([]);
    setNextBeforeMessageId(null);
    void runSearch(query, undefined);
  };

  const handleLoadMore = () => {
    if (activeQuery === null || nextBeforeMessageId === null || loadingMore) {
      return;
    }
    void runSearch(activeQuery, nextBeforeMessageId);
  };

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navSearch} />
        <Alert tone="danger">{strings.searchForbiddenError}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const searchedFromAt = parseInstant(searchedFrom);
  const searchedToAt = parseInstant(searchedTo);

  return (
    <>
      <PageHead title={strings.navSearch} description={strings.searchPageDescription} />

      <p className="ago-search-result__note">{strings.searchArchiveNote}</p>

      <form className="ago-search-form" onSubmit={handleSubmit}>
        <div className="ago-search-form__phrase">
          <Field label={strings.searchPhraseFieldLabel}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="text"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder={strings.searchPhrasePlaceholder}
                disabled={loading}
              />
            )}
          </Field>
        </div>

        <Field label={strings.searchFromFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Field label={strings.searchToFieldLabel}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              disabled={loading}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" disabled={loading}>
          {strings.searchButton}
        </Button>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {hasSearched && searchedFromAt && searchedToAt && (
        <p className="ago-meta">
          {strings.searchRangeLabel} {formatDateStamp(searchedFromAt, timeZone, strings)} –{" "}
          {formatDateStamp(searchedToAt, timeZone, strings)}
        </p>
      )}

      {loading ? (
        <Skeleton lines={4} label={strings.searchLoadingLabel} />
      ) : hasSearched && results.length === 0 ? (
        <p className="ago-empty">{strings.searchEmpty}</p>
      ) : results.length > 0 ? (
        <ul className="ago-list">
          {results.map((result) => (
            <ResultRow key={result.messageId} result={result} timeZone={timeZone} strings={strings} />
          ))}
        </ul>
      ) : null}

      {nextBeforeMessageId !== null && (
        <div className="ago-row">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? strings.searchLoadingMoreLabel : strings.searchLoadMoreButton}
          </Button>
        </div>
      )}
    </>
  );
}
