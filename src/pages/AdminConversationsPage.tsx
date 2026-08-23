import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchAllConversationsForSite } from "../api/conversationsApi.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

/** Same poll interval `QueuePage` uses for its own read-only "waiting" list - see that page's own
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
 */
export function AdminConversationsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const [conversations, setConversations] = useState<ConversationSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!user?.access_token) {
      return;
    }

    fetchAllConversationsForSite(user.access_token)
      .then((page) => {
        setConversations(page.conversations);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load conversations."));
  }, [user?.access_token]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, hasPermission]);

  if (permissions === null) {
    return <p>Loading…</p>;
  }

  if (!hasPermission("site:configure")) {
    return (
      <div>
        <p role="alert">You do not have permission to view every conversation for this site.</p>
        <p>
          <Link to="/">Back to queue</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p>
        <Link to="/">Back to queue</Link>
      </p>
      <h2>All conversations for this site</h2>
      {error && <p role="alert">{error}</p>}
      {conversations === null ? (
        <p>Loading…</p>
      ) : conversations.length === 0 ? (
        <p>No conversations yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Visitor</th>
              <th>State</th>
              <th>Assigned operator</th>
              <th>Started</th>
              <th>Unread</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.conversationId}>
                <td>{c.visitorId.slice(0, 8)}</td>
                <td>{c.state}</td>
                <td>{c.operatorId ? c.operatorId.slice(0, 8) : "Unassigned"}</td>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
                <td>{c.operatorUnreadCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
