import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { fetchOperatorQueue } from "../api/conversationsApi.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";
import { ConnectionStateBadge } from "../realtime/ConnectionStateBadge.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Skeleton } from "../components/Spinner.js";

/** Refetch interval for the read-only "waiting" list - see this file's own remarks below on why a
 * periodic REST refresh, not a live push, is the deliberate (and stated) shape for that half of the
 * view. */
const WAITING_REFRESH_INTERVAL_MS = 15_000;

/**
 * `5-07`: the queue/dashboard view - conversations currently waiting for this operator's site, and
 * conversations already assigned to this operator (`docs/vision.md`'s automatic-assignment model:
 * `4-02`'s engine is the only thing that ever moves a conversation from one list to the other, so
 * this view has no "claim" button - clicking a waiting row would have nothing correct to do).
 *
 * Two different freshness guarantees, stated rather than papered over: "assigned to me" is genuinely
 * live (`OperatorConnection.onConversationAssigned`, `4-02`'s own real-time notification, refetches
 * the whole queue on receipt - see that handler for why a targeted merge was not worth the extra
 * complexity for a list this small). "Waiting" only refreshes on this page's own poll interval and
 * on initial load - nothing today broadcasts "a new conversation started waiting" to every operator
 * of a site (only the operator it eventually gets assigned to ever hears about it, via the same
 * `ConversationAssigned` push), and the waiting list is read-only situational awareness, never
 * something an operator acts on directly, so a short poll is a reasonable, deliberately limited
 * answer rather than a reason to build a new broadcast-on-conversation-start feature this item was
 * never scoped to need.
 *
 * `11-05` restyled this screen and moved two things off it, both presentation-only. The "Signed in
 * as … Sign out" sentence and the permission-gated links to `/admin` and `/settings/widget` are now
 * the shell's header (`OperatorShell`), which gates them through the identical `usePermissions()`
 * call this page used to make - the same client-side hide with the same caveat, in a place every
 * route can see it from. Nothing else moved: both lists, both refresh mechanisms and the
 * `leaveConversation()` cleanup are untouched.
 */
export function QueuePage() {
  const { user } = useAuth();
  const { connection, connectionState } = useOperatorConnection();
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!user?.access_token) {
      return;
    }

    fetchOperatorQueue(user.access_token)
      .then(setQueue)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load the queue."));
  }, [user?.access_token]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, WAITING_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    connection.onConversationAssigned(() => refresh());
  }, [connection, refresh]);

  // Leaving a conversation view lands back here - make sure incoming pushes for the conversation
  // just left are not still being routed to a listener the previous page installed.
  useEffect(() => {
    connection.leaveConversation();
  }, [connection]);

  return (
    <>
      <PageHead
        title="Queue"
        description="Conversations assigned to you, and everything currently waiting for this site."
        aside={<ConnectionStateBadge state={connectionState} />}
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Panel title="Assigned to me" description="Live - a new assignment appears here without a refresh.">
        {queue === null ? (
          <Skeleton lines={3} label="Loading your assigned conversations…" />
        ) : queue.assignedToMe.length === 0 ? (
          <p className="ago-empty">Nothing assigned yet. New conversations arrive here automatically.</p>
        ) : (
          <ul className="ago-queue">
            {queue.assignedToMe.map((c) => (
              <li key={c.conversationId}>
                <Link className="ago-queue__row" to={`/conversations/${c.conversationId}`}>
                  <span className="ago-queue__row-main">
                    <Badge tone="brand" mono>
                      {c.visitorId.slice(0, 8)}
                    </Badge>
                    <span className="ago-meta">since {new Date(c.createdAt).toLocaleTimeString()}</span>
                  </span>
                  {c.operatorUnreadCount > 0 && <Badge tone="danger">{c.operatorUnreadCount} unread</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Read-only by design - see this file's own doc comment on why there is no claim action here.
          `11-05` makes that visible rather than only documented: these rows are plain rows with no
          hover affordance and no link, next to a list whose rows are entirely clickable. */}
      <Panel title="Waiting" description={`Read-only. Refreshed every ${WAITING_REFRESH_INTERVAL_MS / 1000} seconds.`}>
        {queue === null ? (
          <Skeleton lines={2} label="Loading the waiting list…" />
        ) : queue.waiting.length === 0 ? (
          <p className="ago-empty">Nothing waiting.</p>
        ) : (
          <ul className="ago-queue">
            {queue.waiting.map((c) => (
              <li key={c.conversationId} className="ago-queue__row ago-queue__row--static">
                <span className="ago-queue__row-main">
                  <Badge tone="neutral" mono>
                    {c.visitorId.slice(0, 8)}
                  </Badge>
                  <span className="ago-meta">waiting since {new Date(c.createdAt).toLocaleTimeString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
