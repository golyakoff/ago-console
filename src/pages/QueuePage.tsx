import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import { fetchOperatorQueue } from "../api/conversationsApi.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";

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
 */
export function QueuePage() {
  const { user, logout } = useAuth();
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
    <div>
      <p>
        Signed in as {user?.profile.preferred_username ?? user?.profile.sub} - <button onClick={() => void logout()}>Sign out</button>
      </p>
      <p>Operator hub: {connectionState}</p>
      {error && <p role="alert">{error}</p>}

      <h2>Assigned to me</h2>
      {queue === null ? (
        <p>Loading…</p>
      ) : queue.assignedToMe.length === 0 ? (
        <p>Nothing assigned yet.</p>
      ) : (
        <ul>
          {queue.assignedToMe.map((c) => (
            <li key={c.conversationId}>
              <Link to={`/conversations/${c.conversationId}`}>
                Visitor {c.visitorId.slice(0, 8)} - since {new Date(c.createdAt).toLocaleTimeString()}
                {c.operatorUnreadCount > 0 && ` (${c.operatorUnreadCount} unread)`}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Waiting</h2>
      {/* Read-only by design - see this file's own doc comment on why there is no claim action here. */}
      {queue === null ? (
        <p>Loading…</p>
      ) : queue.waiting.length === 0 ? (
        <p>Nothing waiting.</p>
      ) : (
        <ul>
          {queue.waiting.map((c) => (
            <li key={c.conversationId}>
              Visitor {c.visitorId.slice(0, 8)} - waiting since {new Date(c.createdAt).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
