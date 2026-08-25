import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { ConnectionStateBadge } from "../realtime/ConnectionStateBadge.js";
import { linkStatusOf } from "../realtime/linkStatus.js";
import { fetchOperatorQueue, markConversationRead } from "../api/conversationsApi.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";
import { Alert } from "../components/Alert.js";
import { resolveTimeZone } from "../time/format.js";
import { ConversationList } from "./ConversationList.js";
import { applyAttentionEvent, documentTitleFor, totalUnread, type ReadStateMap } from "./attention.js";
import { useNow } from "./useNow.js";
import type { WorkspaceOutletContext } from "./workspaceContext.js";

/** Carried over unchanged from `QueuePage` - see `ConversationList` for the reasoning this interval
 * belongs to, which `11-06` inherits rather than revisits. */
const WAITING_REFRESH_INTERVAL_MS = 15_000;

/** How often the elapsed-time labels re-render. See `useNow` for why this is coarser than a second
 * and finer than a minute. */
const ELAPSED_TICK_MS = 10_000;

/** How long the new-assignment banner stays before retiring itself. */
const ANNOUNCEMENT_LIFETIME_MS = 20_000;

/** Matches `index.html`'s own `<title>`, so the tab reads identically when nothing is unread. */
const BASE_DOCUMENT_TITLE = "AGO Chat operator console";

/**
 * `11-06`: the operator workspace - one screen an operator can work a shift in, replacing a queue
 * page and a separate full-page conversation route that made them lose their place on every answer.
 *
 * ## Shape
 *
 * A layout route with three regions: the conversation list (this file, via `ConversationList`), the
 * open thread, and the visitor context panel. The latter two come out of the `<Outlet />` - either
 * `ConversationPage` (which renders both) or `NoConversationSelected` (which renders only the
 * middle). They are direct grid children because a React fragment produces no DOM node of its own,
 * which is what lets one route element fill two grid areas without the layout having to know what is
 * in them.
 *
 * **`/conversations/:id` is still a real route.** The item is explicit: "the layout changes, the
 * routing contract does not". A conversation is still linkable, still reloadable, still restorable
 * from a bookmark - the difference is that the list stays on screen beside it instead of being a
 * page the operator navigated away from.
 *
 * ## Where `QueuePage` went
 *
 * `QueuePage.tsx` is deleted, and its two documented decisions moved rather than lapsed: the freshness
 * split (live assignments, polled waiting list) is the effect below plus the note in
 * `ConversationList`'s heading, and the "no claim button" reasoning is `ConversationList`'s own doc
 * comment, where the read-only rows it governs actually live. Its third behaviour - calling
 * `connection.leaveConversation()` on mount, so a push for the conversation just left was not routed
 * to a stale listener - is now unnecessary from here: `ConversationPage`'s own effect cleanup already
 * calls it on unmount, which is the same moment, and this layout never unmounts between the two.
 *
 * ## How a new assignment announces itself (the item's one discretionary decision)
 *
 * **Announced in place, never acted on for the operator.** Concretely, when `4-02`'s engine assigns a
 * conversation while the console is open:
 *
 * - the row appears in "Assigned to me" carrying a `New` badge that persists until it is opened;
 * - the unread count on it, and in the document title, goes up - so a backgrounded tab tells the
 *   truth without the operator switching to it;
 * - a polite live region (`role="status"`, the `Alert` component's own `info` semantics) says so
 *   once, so a screen-reader user hears the arrival rather than discovering it by luck;
 * - and **nothing else happens**: the open conversation stays open, focus stays where it was, the
 *   draft in the composer is untouched, and no route changes.
 *
 * The alternative - auto-opening the new conversation - is what a first-time reader expects, and it
 * is wrong here for a specific reason: an operator mid-sentence to visitor A would be teleported to
 * visitor B, losing their place in exactly the way this item exists to prevent. The other
 * alternative, a purely silent arrival, is defensible (the row does appear) and was rejected because
 * an assignment the operator does not notice is a visitor waiting on someone who does not know they
 * exist. Deliberate but non-interrupting is the middle the item asks for: the system decides *who*
 * (`4-02` owns that, and this item changes nothing about it), the operator decides *when*.
 *
 * Desktop notifications and sound - the loudest versions of the same idea - are named in the item's
 * own Out of scope list and are not here.
 */
export function WorkspaceLayout() {
  const { user } = useAuth();
  const { connection, connectionState, serverDraining } = useOperatorConnection();
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attention, setAttention] = useState<ReadStateMap>({});
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const now = useNow(ELAPSED_TICK_MS);

  // Resolved once per mount rather than per render: the operator's zone does not change while they
  // are looking at the screen, and `Intl.DateTimeFormat()` is not free.
  const timeZone = useMemo(() => resolveTimeZone(), []);

  const openConversationId = useMatch("/conversations/:conversationId")?.params.conversationId ?? null;
  // The push handlers below are installed once and must see the *current* open conversation without
  // being re-installed every time it changes (re-installing would be harmless here but hides a real
  // trap: `onAnyMessage` is a single-listener setter, so a stale closure would be the one running).
  const openConversationIdRef = useRef<string | null>(openConversationId);
  openConversationIdRef.current = openConversationId;

  const refreshQueue = useCallback(() => {
    if (!user?.access_token) {
      return;
    }

    fetchOperatorQueue(user.access_token)
      .then((next) => {
        setQueue(next);
        // `5-15`: the fresh snapshot already contains every arrival and every clear the overlay in
        // `attention.ts` was standing in for, so those adjustments retire here rather than being
        // added on top of a number that has caught up.
        setAttention((prev) => applyAttentionEvent(prev, { kind: "refetched" }));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load the queue."));
  }, [user?.access_token]);

  // `5-15`: the real server-side clear. Deliberately not followed by a `refreshQueue()` - the
  // `cleared` event above already tells the rail what the server just told us, and forcing a queue
  // round trip on every conversation open would be a request per open for a number we already have.
  const markRead = useCallback(
    (conversationId: string, upToSequence: number) => {
      if (!user?.access_token) {
        return;
      }

      markConversationRead(user.access_token, conversationId, upToSequence)
        .then(() => setAttention((prev) => applyAttentionEvent(prev, { kind: "cleared", conversationId })))
        .catch((err: unknown) => {
          // Never surfaced to the operator: a badge that failed to clear is a cosmetic staleness the
          // next open fixes, and an error banner for it would be worse than the defect.
          console.warn("Failed to mark the conversation read", err);
        });
    },
    [user?.access_token],
  );

  useEffect(() => {
    refreshQueue();
    const interval = setInterval(refreshQueue, WAITING_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  // `4-02`'s live assignment push. Still refetches the whole queue rather than merging one row in -
  // `5-07`'s own judgement for a list this small, unchanged - and additionally records the arrival
  // so the row can be marked `New` and announced (see this component's doc comment).
  useEffect(() => {
    connection.onConversationAssigned((dto) => {
      // An assignment for the conversation already on screen is not "new" to the operator - they are
      // looking at it. Checked here rather than inside the reducer (`5-15`) so `attention.ts` stays a
      // pure function of the events it is given and does not need to track what is open.
      if (dto.conversationId !== openConversationIdRef.current) {
        setAttention((prev) => applyAttentionEvent(prev, { kind: "assigned", conversationId: dto.conversationId }));
      }

      setAnnouncement("A new conversation was assigned to you.");
      refreshQueue();
    });
  }, [connection, refreshQueue]);

  // `11-06`'s addition to `OperatorConnection`: every message push, for every conversation this
  // operator is assigned - not only the one on screen. Without it the console cannot know that a
  // second conversation has a new visitor message, which is the whole substance of an unread badge.
  useEffect(() => {
    connection.onAnyMessage((message) => {
      // Only a visitor's message is unread *to an operator*; their own echoed-back send is not.
      if (message.authorKind !== "Visitor") {
        return;
      }

      // A server that predates `5-07`'s `conversationId` addition leaves this absent. Attributing
      // such a push to a guess would corrupt the count, so it is skipped rather than misfiled.
      const conversationId = message.conversationId;
      if (!conversationId || conversationId === openConversationIdRef.current) {
        return;
      }

      setAttention((prev) => applyAttentionEvent(prev, { kind: "incoming", conversationId }));
    });
  }, [connection]);

  // The announcement is an announcement, not a nag: it retires itself after a while, while the
  // `New` badge on the row stays until the conversation is actually opened. A banner that never
  // goes away is one an operator learns to ignore, which would defeat the point of announcing at
  // all - and the durable half of the signal is the badge, not this.
  useEffect(() => {
    if (announcement === null) {
      return;
    }

    const timer = setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  // Opening a conversation drops its "New" marker and any locally counted arrivals. The count itself
  // is cleared by `markRead` once the server confirms - `5-15`; see `attention.ts` for the split.
  useEffect(() => {
    if (openConversationId === null) {
      return;
    }

    setAttention((prev) => applyAttentionEvent(prev, { kind: "opened", conversationId: openConversationId }));
    setAnnouncement(null);
  }, [openConversationId]);

  const unread = queue === null ? 0 : totalUnread(queue.assignedToMe, attention);

  useEffect(() => {
    document.title = documentTitleFor(unread, BASE_DOCUMENT_TITLE);
    return () => {
      // Leaving the workspace for `/admin` or `/settings/widget` must not strand a count in the tab
      // title that nothing is updating any more.
      document.title = BASE_DOCUMENT_TITLE;
    };
  }, [unread]);

  const conversation =
    queue?.assignedToMe.find((c) => c.conversationId === openConversationId) ??
    queue?.waiting.find((c) => c.conversationId === openConversationId) ??
    null;

  const outletContext: WorkspaceOutletContext = useMemo(
    () => ({ conversation, now, timeZone, refreshQueue, markRead }),
    [conversation, now, timeZone, refreshQueue, markRead],
  );

  const link = linkStatusOf(connectionState, serverDraining);

  return (
    <div className={`ago-workspace${openConversationId === null ? "" : " ago-workspace--conversation"}`}>
      <h1 className="ago-visually-hidden">Operator workspace</h1>

      <aside className="ago-workspace__rail" aria-label="Conversations">
        <div className="ago-workspace__rail-head">
          <span className="ago-workspace__rail-title">Conversations</span>
          <ConnectionStateBadge state={connectionState} serverDraining={serverDraining} />
        </div>

        {/* The connection's own sentence, shown rather than hidden in a `title`, exactly when it is
            something the operator has to act on. A healthy link says nothing at all - a permanent
            "everything is fine" line is noise an operator learns to stop reading. */}
        {!link.healthy && (
          <Alert tone="danger" title={link.label}>
            {link.detail}
          </Alert>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {/* The new-assignment announcement. `Alert`'s `info` tone is `role="status"` - polite, so it
            is read after whatever the operator was already hearing rather than cutting into it. */}
        {announcement && <Alert tone="info">{announcement}</Alert>}

        <div className="ago-workspace__rail-scroll">
          <ConversationList
            queue={queue}
            attention={attention}
            now={now}
            timeZone={timeZone}
            waitingRefreshSeconds={WAITING_REFRESH_INTERVAL_MS / 1000}
          />
        </div>
      </aside>

      <Outlet context={outletContext} />
    </div>
  );
}
