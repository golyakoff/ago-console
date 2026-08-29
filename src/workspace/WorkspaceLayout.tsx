import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { ConnectionStateBadge } from "../realtime/ConnectionStateBadge.js";
import { linkStatusOf } from "../realtime/linkStatus.js";
import { fetchOperatorQueue, markConversationRead } from "../api/conversationsApi.js";
import { fetchCannedResponses, type CannedResponseDto } from "../api/cannedResponsesApi.js";
import { fetchTags, type TagDto } from "../api/tagsApi.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Select } from "../components/Select.js";
import { useStrings } from "../i18n/StringsContext.js";
import { resolveTimeZone } from "../time/format.js";
import { ConversationList } from "./ConversationList.js";
import { applyAttentionEvent, documentTitleFor, oldestFirst, totalUnread, type ReadStateMap } from "./attention.js";
import { AlertSettings } from "./AlertSettings.js";
import { ShortcutsDialog } from "./ShortcutsDialog.js";
import { conversationAfter } from "./shortcuts.js";
import { useAlerts } from "./useAlerts.js";
import { useShortcuts } from "./useShortcuts.js";
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
 * Desktop notifications and sound - the loudest versions of the same idea - were named in `11-06`'s
 * own Out of scope list and arrived in `18-05`, along with the keyboard shortcuts the same list
 * deferred. Both extend the model above rather than replacing it: the badge, the count, the title and
 * the live region are unchanged, and what `18-05` adds is the same information reaching an operator
 * who is not looking at this screen. `alerts.ts` owns the rule for when that is true; `shortcuts.ts`
 * owns the keyboard catalogue. Neither is decided in this file - what is here is the wiring.
 */
export function WorkspaceLayout() {
  const { user } = useAuth();
  const { siteId } = usePermissions();
  const { connection, connectionState, serverDraining } = useOperatorConnection();
  const strings = useStrings();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null);
  // `18-03`: fetched once, here, rather than by `ConversationPage`/`Composer` on every conversation
  // opened - `workspaceContext.ts`'s own remarks on `cannedResponses` explain why. Empty rather than
  // `null` before the fetch resolves and on a load failure alike: the composer's picker treats "not
  // loaded yet" and "nothing configured" identically, since either way it has nothing to offer.
  const [cannedResponses, setCannedResponses] = useState<CannedResponseDto[]>([]);
  // `18-04`: the site's tag vocabulary, fetched once - see `workspaceContext.ts`'s own remarks on
  // `tags`/`refreshTags`. `tagFilter` is this rail's own queue filter, `null` meaning unfiltered.
  const [tags, setTags] = useState<TagDto[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attention, setAttention] = useState<ReadStateMap>({});
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
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

  // `18-05`. The composer lives in the outlet (`ConversationPage` -> `Composer`), and the `C`
  // shortcut lives here - so the layout owns the ref and hands it down through the context it
  // already uses for the parent-to-outlet direction. The alternative, a `document.querySelector`
  // from the shortcut handler, would work and would make the layout depend on a class name in a
  // component it does not own.
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // The queue as the rail draws it, which is the order `J`/`K` have to walk: any other order would
  // move the selection somewhere the operator's eye is not.
  const assignedOrder = useMemo(
    () => (queue === null ? [] : oldestFirst(queue.assignedToMe).map((c) => c.conversationId)),
    [queue],
  );
  const assignedOrderRef = useRef<readonly string[]>(assignedOrder);
  assignedOrderRef.current = assignedOrder;

  const queueRef = useRef<OperatorQueueResponse | null>(queue);
  queueRef.current = queue;

  const alerts = useAlerts({
    openConversationId,
    onOpenConversation: (conversationId) => void navigate(`/conversations/${conversationId}`),
  });

  // Destructured, and the two hub effects below depend on *this* rather than on `alerts`. `fire` is
  // stable for the life of the component; the object around it is not, because it also carries the
  // settings and the permission, which change when the operator flips a switch. Depending on the
  // object would re-run both effects on every settings change - and, more to the point, would put a
  // value that changes identity into the dependency list of an effect whose whole design (see the
  // `openConversationIdRef` note above) is that it installs its handlers exactly once.
  const { fire } = alerts;

  const refreshQueue = useCallback(() => {
    if (!user?.access_token) {
      return;
    }

    fetchOperatorQueue(user.access_token, tagFilter ?? undefined)
      .then((next) => {
        setQueue(next);
        // `5-15`: the fresh snapshot already contains every arrival and every clear the overlay in
        // `attention.ts` was standing in for, so those adjustments retire here rather than being
        // added on top of a number that has caught up.
        setAttention((prev) => applyAttentionEvent(prev, { kind: "refetched" }));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : strings.workspaceQueueLoadError));
  }, [user?.access_token, strings, tagFilter]);

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

  // `18-03`: fetched once per mount, no refresh interval - unlike the queue, this list has no reason
  // to change while an operator is mid-shift, and `CannedResponsesPage`'s own save does not push a
  // live update here (`Site.UpdateCannedResponses`'s own remarks on why that write raises no event to
  // push). An operator who edits the library in one tab sees it on this screen after their next
  // reload, which is the same staleness window `GetWidgetConfigHandler`'s own admin-read precedent
  // already accepts for a low-frequency settings value.
  useEffect(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchCannedResponses(accessToken, siteId)
      .then(setCannedResponses)
      .catch((err: unknown) => {
        // Never surfaced here: a composer that cannot offer canned responses today is still a working
        // composer, and an error banner for a convenience feature would outweigh the defect. A real
        // load failure is still visible - on `/settings/canned-responses`, which does surface it.
        console.warn("Failed to load canned responses", err);
      });
  }, [user?.access_token, siteId]);

  // `18-04`: the tag vocabulary, fetched once - the identical shape and reasoning as the
  // canned-responses effect right above (`workspaceContext.ts`'s own remarks on `tags`).
  const refreshTags = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchTags(accessToken, siteId)
      .then(setTags)
      .catch((err: unknown) => {
        // Same "never surfaced here" posture as canned responses above - `/settings/tags` is where a
        // real load failure is shown.
        console.warn("Failed to load tags", err);
      });
  }, [user?.access_token, siteId]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

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

      setAnnouncement(strings.workspaceNewAssignmentAnnouncement);

      // `18-05`. Called unconditionally: whether anything is actually loud is `decideAlert`'s
      // decision, not this call site's, and duplicating the "is the operator looking at it" rule
      // here is how the two would eventually disagree.
      //
      // No visitor id, and that is the DTO rather than an omission - `ConversationAssignedDto`
      // carries the conversation, the operator and the time, and the queue row that knows the
      // visitor has not been fetched yet. `alertTextFor` renders "A visitor" for this case rather
      // than delaying the notification until after a round trip.
      fire("assigned", dto.conversationId, null);

      refreshQueue();
    });
  }, [connection, refreshQueue, fire, strings]);

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

      // `18-05`, and a deliberate widening of what the item literally asked for. Its Scope names
      // "desktop notifications for a newly assigned conversation"; its Goal is that an operator
      // "finds out that a new one arrived without watching the tab". Notifying only on assignment
      // would make the loudest signal in the console fire for the *least* urgent event - a
      // conversation nobody is waiting on yet - and stay silent when a visitor who has already been
      // answered replies. The suppression rule is identical for both, so this adds a trigger, not a
      // second idea of what needs attention.
      //
      // Note the early return above: a message for the conversation on screen never reaches here at
      // all. `decideAlert` would refuse it anyway, and the redundancy is `11-06`'s, not new.
      const visitorId =
        queueRef.current?.assignedToMe.find((c) => c.conversationId === conversationId)?.visitorId ?? null;
      fire("message", conversationId, visitorId);
    });
  }, [connection, fire]);

  // `18-05`: the keyboard. Every handler here is one line of navigation or one line of state - the
  // decisions (which key, whether the target is a text field, where J and K land) are `shortcuts.ts`
  // and are unit-tested without a DOM.
  useShortcuts({
    nextConversation: () => {
      const next = conversationAfter(assignedOrderRef.current, openConversationIdRef.current, 1);
      if (next !== null) {
        void navigate(`/conversations/${next}`);
      }
    },
    previousConversation: () => {
      const previous = conversationAfter(assignedOrderRef.current, openConversationIdRef.current, -1);
      if (previous !== null) {
        void navigate(`/conversations/${previous}`);
      }
    },
    focusComposer: () => composerRef.current?.focus(),
    closeThread: () => {
      // Only when there is a thread to close. Escape on the empty workspace must not navigate to the
      // route it is already on and push a history entry for it.
      if (openConversationIdRef.current !== null) {
        void navigate("/");
      }
    },
    showHelp: () => setShortcutsOpen(true),
  });

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
    () => ({ conversation, now, timeZone, refreshQueue, markRead, composerRef, cannedResponses, tags, refreshTags }),
    [conversation, now, timeZone, refreshQueue, markRead, cannedResponses, tags, refreshTags],
  );

  const link = linkStatusOf(connectionState, serverDraining, strings);

  return (
    <div className={`ago-workspace${openConversationId === null ? "" : " ago-workspace--conversation"}`}>
      <h1 className="ago-visually-hidden">{strings.workspaceHiddenHeading}</h1>

      <aside className="ago-workspace__rail" aria-label={strings.workspaceConversationsLabel}>
        <div className="ago-workspace__rail-head">
          <span className="ago-workspace__rail-title">{strings.workspaceConversationsLabel}</span>
          <ConnectionStateBadge state={connectionState} serverDraining={serverDraining} />
        </div>

        {/* `18-05`. Two buttons rather than a preferences page, and they live in the rail rather
            than in the shell header for a reason worth stating: both are properties of *this
            screen* - which conversation the keys move between, and what happens when one of them
            needs the operator. A shell-level settings page would also put them next to the
            site-wide settings, which they are not: these are this operator's, in this browser, and
            nothing about them reaches the server or another operator.

            The Shortcuts button is what makes `?` discoverable to somebody who has never pressed
            `?`, which is the point the item's own wording insists on. */}
        <div className="ago-workspace__rail-tools">
          <Button size="sm" variant="ghost" onClick={() => setAlertsOpen(true)}>
            {strings.workspaceAlertsLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShortcutsOpen(true)}>
            {strings.workspaceShortcutsButton}
          </Button>
        </div>

        {/* The connection's own sentence, shown rather than hidden in a `title`, exactly when it is
            something the operator has to act on. A healthy link says nothing at all - a permanent
            "everything is fine" line is noise an operator learns to stop reading. */}
        {!link.healthy && (
          <Alert tone="danger" title={link.label}>
            {link.detail}
          </Alert>
        )}

        {/* `18-04`: the queue's own tag filter - narrows both "Assigned to me" and "Waiting" to
            conversations carrying the chosen tag. Rendered only once a tag vocabulary exists; an
            empty `<select>` with nothing to pick would be a control that does nothing. */}
        {tags.length > 0 && (
          <div className="ago-workspace__rail-tools">
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

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Dialog
        open={alertsOpen}
        title={strings.workspaceAlertsLabel}
        onClose={() => setAlertsOpen(false)}
        footer={
          <Button variant="primary" onClick={() => setAlertsOpen(false)}>
            {strings.workspaceDoneButton}
          </Button>
        }
      >
        <AlertSettings alerts={alerts} />
      </Dialog>
    </div>
  );
}
