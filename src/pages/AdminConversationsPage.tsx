import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchAllConversationsForSite, eraseConversation, checkConversationErasure } from "../api/conversationsApi.js";
import { fetchTags, type TagDto } from "../api/tagsApi.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { formatAbsolute, parseInstant, resolveTimeZone } from "../time/format.js";
import { PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Select } from "../components/Select.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { EraseConversationButton, CONVERSATION_ERASE_PERMISSION } from "./EraseConversationButton.js";

/** The conversation lifecycle's three states, given the tones the palette reserves for them.
 * Declared outside the component so the mapping is a constant, not something rebuilt per render -
 * a CSS tone name is not language-bearing text, so it needs no `strings` and stays exactly as it was. */
const STATE_TONE: Record<ConversationSummaryDto["state"], "brand" | "success" | "neutral"> = {
  Waiting: "brand",
  Assigned: "success",
  Closed: "neutral",
};

/** `11-13`: the visible state word, reusing the three fields the operator workspace already has
 * (`queueWaitingTitle`, `conversationStateAssigned`, `conversationStateClosed`) rather than adding a
 * fourth trio that would only ever say the same three words - found live: this table rendered the raw
 * `ConversationSummaryDto["state"]` wire value (`"Waiting"`/`"Assigned"`/`"Closed"`) unchanged, so a
 * Russian tenant's admin table read three English words even on `ru.ts`. */
function stateLabel(state: ConversationSummaryDto["state"], strings: ConsoleStrings): string {
  switch (state) {
    case "Waiting":
      return strings.queueWaitingTitle;
    case "Assigned":
      return strings.conversationStateAssigned;
    case "Closed":
      return strings.conversationStateClosed;
  }
}

/** `11-13`: moved from a module-level constant into a function of `strings`, called from a `useMemo`
 * inside the component - the same "constant outside the component becomes a function of strings" move
 * `11-12` already made for `shortcutDescription`/`closeOutcomeFor`/`linkStatusOf`. A plain array
 * literal built at module scope cannot call `useStrings()`, and rebuilding it every render (skipping
 * the `useMemo`) would remake the identical five-element array on every poll tick for no reason - the
 * `useMemo`, keyed on `strings`, keeps the original "built once, not per render" property and only
 * rebuilds when the locale itself changes. */
/** `16-02`: `canErase`/`renderActions` add a sixth, row-actions column - but only when the caller
 * holds `conversation:erase`. Kept out of the array entirely rather than always present with the
 * cell's own `EraseConversationButton` returning `null` for every row: the button's own internal gate
 * (its own doc comment) already gets that half right per row, but an "Actions" header sitting over a
 * column of nothing for an operator who never holds the permission is still a dead column, the same
 * "hidden, not disabled" reasoning `CloseConversationButton`/this file's own permission gate already
 * apply at the level of a whole page - here it is one column instead. */
function buildColumns(
  strings: ConsoleStrings,
  timeZone: string | null,
  canErase: boolean,
  renderActions: (row: ConversationSummaryDto) => ReactNode,
): TableColumn<ConversationSummaryDto>[] {
  const columns: TableColumn<ConversationSummaryDto>[] = [
    {
      key: "visitor",
      header: strings.adminColumnVisitor,
      render: (c) => (
        <Badge tone="neutral" mono>
          {c.visitorId.slice(0, 8)}
        </Badge>
      ),
    },
    {
      key: "state",
      header: strings.adminColumnState,
      render: (c) => <Badge tone={STATE_TONE[c.state]}>{stateLabel(c.state, strings)}</Badge>,
    },
    {
      key: "operator",
      header: strings.adminColumnOperator,
      render: (c) =>
        c.operatorId ? (
          <span className="ago-mono">{c.operatorId.slice(0, 8)}</span>
        ) : (
          <span className="ago-meta">{strings.adminUnassigned}</span>
        ),
    },
    {
      key: "started",
      header: strings.adminColumnStarted,
      // `343`/`344`: was a bare `new Date(c.createdAt).toLocaleString()` - the one cell in this
      // screen set that bypassed `time/format.ts` entirely, so it rendered in whatever locale and
      // zone the runtime's own `Intl` default happened to be, with nothing on screen saying which
      // zone that was. `formatAbsolute` is the fix rather than `formatDateStamp`: this column shows
      // one instant with no adjoining time-of-day text anywhere else in the row (unlike
      // `VisitorHistoryPanel`'s date-stamp-plus-title pairing), so the full, always-zone-labelled
      // rendering belongs directly in the cell, not hidden in a `title` nobody hovers over a table of
      // rows for. `queueStartUnknown` reuses the queue's own identical "no instant to render" string
      // rather than adding a fourth phrasing of the same fact.
      render: (c) => {
        const startedAt = parseInstant(c.createdAt);
        return (
          <span className="ago-meta">
            {startedAt ? formatAbsolute(startedAt, timeZone, strings) : strings.queueStartUnknown}
          </span>
        );
      },
    },
    {
      key: "unread",
      header: strings.adminColumnUnread,
      align: "end",
      render: (c) => c.operatorUnreadCount,
    },
  ];

  if (canErase) {
    columns.push({
      key: "actions",
      header: strings.adminColumnActions,
      align: "end",
      render: renderActions,
    });
  }

  return columns;
}

/** Same poll interval the operator workspace uses for its own read-only "waiting" list (`11-06`'s
 * `WorkspaceLayout`, which is where `QueuePage`'s two lists moved) - see `ConversationList`'s own
 * doc comment for why a short poll, not a push, is the deliberate shape here too: nothing broadcasts
 * "a conversation changed" to every operator of a site, only to the one it gets assigned to. */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * `5-08`: the admin/supervisor role's distinguishing feature (`authorization.md`) - every
 * conversation for the site, not just this operator's own assigned ones. Gated on `site:configure`
 * (`GetAllConversationsForSiteHandler`'s own remarks) via `usePermissions()`, checked client-side only
 * for UI purposes - the server-side check in that handler is the real gate (`IPermissionChecker`, the
 * same mechanism every permission check in this project already uses); an operator who somehow
 * reached this route without the permission gets a 403 from the fetch and sees the same "forbidden"
 * message a network failure would show, not a crash.
 *
 * Deliberately read-only summary data, not a way to open an arbitrary conversation's message thread -
 * `GetAllConversationsForSiteHandler`'s own remarks explain why this item does not extend
 * `JoinConversationAsync`/`GetConversationHistoryHandler`'s participant checks to be site-wide: doing
 * so would be a materially bigger change than this backlog item scoped (and calling
 * `JoinConversationAsync` on a conversation assigned to someone else already fails loudly rather than
 * stealing it - `Conversation.AssignTo`'s own invariant - but the resulting error message is not one
 * this view should surface as if it were a bug). The attachment-delete action lives in the ordinary
 * `ConversationPage` message thread instead, for whichever conversations the signed-in operator can
 * actually open the normal way.
 *
 * `11-05`: restyled onto the shell and the `Table` component. The page's own "Back to queue" link is
 * gone from the success path only - the shell's navigation carries it on every route now, and two
 * routes to the same place a few pixels apart is worse than one. It is kept on the permission-refusal
 * branch, where it is the only way out and where the shell's own "All conversations" item is
 * (correctly) absent for exactly the operator who lands there.
 *
 * `16-02`: gains one write action after being read-only since `5-08` - erasing a conversation on the
 * visitor's own request, gated on the narrower `conversation:erase` (`EraseConversationButton.js`,
 * not this page's own `site:configure`). `erasedIds` is this component's own record of which rows a
 * poll has *actually confirmed* gone, kept separate from `conversations` (the last full re-fetch):
 * removing a row happens only once `EraseConversationButton`'s `onErased` fires, never on the
 * confirm click, matching the item's own "must not claim it is done before it is" rule. The next
 * `REFRESH_INTERVAL_MS` re-fetch naturally stops listing an erased row too, at which point its id in
 * `erasedIds` is simply inert - no code needs to clear it back out.
 */
export function AdminConversationsPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [conversations, setConversations] = useState<ConversationSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [erasedIds, setErasedIds] = useState<ReadonlySet<string>>(new Set());
  // `18-04`: the site's own tag vocabulary, fetched once for this page's filter dropdown - see
  // `workspaceContext.ts`'s own `tags` remarks for the identical "fetched once, empty on failure"
  // reasoning applied to a different screen.
  const [tags, setTags] = useState<TagDto[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const accessToken = user?.access_token;
  const canErase = hasPermission(CONVERSATION_ERASE_PERMISSION);
  // `343`/`344`: resolved once, the same `useState(() => resolveTimeZone())` shape every other
  // page-level (not nested-in-workspace) screen already uses, e.g. `BillingPage.tsx`.
  const [timeZone] = useState(() => resolveTimeZone());
  const columns = useMemo(
    () =>
      buildColumns(strings, timeZone, canErase, (row) =>
        accessToken ? (
          <EraseConversationButton
            onErase={() => eraseConversation(accessToken, row.conversationId)}
            checkErased={() => checkConversationErasure(accessToken, row.conversationId)}
            onErased={() => setErasedIds((prev) => new Set(prev).add(row.conversationId))}
          />
        ) : null,
      ),
    [strings, timeZone, canErase, accessToken],
  );

  const visibleConversations = useMemo(
    () => conversations?.filter((c) => !erasedIds.has(c.conversationId)) ?? null,
    [conversations, erasedIds],
  );

  const refresh = useCallback(() => {
    if (!user?.access_token) {
      return;
    }

    fetchAllConversationsForSite(user.access_token, undefined, tagFilter ?? undefined)
      .then((page) => {
        setConversations(page.conversations);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : strings.adminLoadError));
  }, [user?.access_token, strings, tagFilter]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, hasPermission]);

  useEffect(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId || !hasPermission("site:configure")) {
      return;
    }

    fetchTags(accessToken, siteId)
      .then(setTags)
      .catch((err: unknown) => console.warn("Failed to load tags", err));
  }, [user?.access_token, siteId, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navAllConversations} />
        {/* `Alert tone="danger"` renders `role="alert"` - the same assertive live region the bare
            `<p role="alert">` here had before `11-05`, which this item's accessibility floor
            requires be preserved rather than lost in the restyle. */}
        <Alert tone="danger">{strings.adminForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={strings.navAllConversations}
        description={`${strings.adminDescriptionPrefix} ${REFRESH_INTERVAL_MS / 1000} ${strings.adminDescriptionSuffix}`}
      />

      {/* `18-04`: the list's own tag filter - only rendered once a vocabulary exists. */}
      {tags.length > 0 && (
        <div className="ago-row">
          <Select
            aria-label={strings.workspaceTagFilterLabel}
            value={tagFilter ?? ""}
            onChange={(e) => setTagFilter(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">{strings.workspaceTagFilterAll}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {/* `16-02`: shown once at least one row has been *confirmed* erased by its own poll, never on
          the confirm click - `erasedIds` only ever grows from `EraseConversationButton`'s `onErased`.
          `role="status"` (`Alert tone="success"`), not `"alert"`: this is a background job's own
          confirmation arriving asynchronously, not a response to something the operator just did on
          this exact render. */}
      {erasedIds.size > 0 && <Alert tone="success">{strings.adminConversationErasedNotice}</Alert>}

      {/* No `Panel` wrapper any more - found live: `.ago-table-scroll` already carries its own
          complete card (border, radius, background), the identical treatment `.ago-panel` gives its
          own `<section>`. Nesting one inside the other was two cards, and the outer one's padding was
          the "extra white container" a titleless Panel had nothing left to justify - `PageHead` above
          already says what this is. `Skeleton`/`.ago-empty` are equally self-contained (their own
          border/background), the same bare-block pattern the workspace's queue lists already use. */}
      {visibleConversations === null ? (
        <Skeleton lines={4} label={strings.adminLoadingLabel} />
      ) : visibleConversations.length === 0 ? (
        <p className="ago-empty">{strings.adminEmpty}</p>
      ) : (
        <Table
          caption={strings.adminTableCaption}
          columns={columns}
          rows={visibleConversations}
          rowKey={(c) => c.conversationId}
        />
      )}
    </>
  );
}
