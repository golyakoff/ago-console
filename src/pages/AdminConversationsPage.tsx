import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchAllConversationsForSite } from "../api/conversationsApi.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Skeleton, Spinner } from "../components/Spinner.js";

/** The conversation lifecycle's three states, given the tones the palette reserves for them.
 * Declared outside the component so the mapping is a constant, not something rebuilt per render. */
const STATE_TONE: Record<ConversationSummaryDto["state"], "brand" | "success" | "neutral"> = {
  Waiting: "brand",
  Assigned: "success",
  Closed: "neutral",
};

const COLUMNS: TableColumn<ConversationSummaryDto>[] = [
  {
    key: "visitor",
    header: "Visitor",
    render: (c) => (
      <Badge tone="neutral" mono>
        {c.visitorId.slice(0, 8)}
      </Badge>
    ),
  },
  {
    key: "state",
    header: "State",
    render: (c) => <Badge tone={STATE_TONE[c.state]}>{c.state}</Badge>,
  },
  {
    key: "operator",
    header: "Assigned operator",
    render: (c) =>
      c.operatorId ? (
        <span className="ago-mono">{c.operatorId.slice(0, 8)}</span>
      ) : (
        <span className="ago-meta">Unassigned</span>
      ),
  },
  {
    key: "started",
    header: "Started",
    render: (c) => <span className="ago-meta">{new Date(c.createdAt).toLocaleString()}</span>,
  },
  {
    key: "unread",
    header: "Unread",
    align: "end",
    render: (c) => c.operatorUnreadCount,
  },
];

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
 *
 * `11-05`: restyled onto the shell and the `Table` component. The page's own "Back to queue" link is
 * gone from the success path only - the shell's navigation carries it on every route now, and two
 * routes to the same place a few pixels apart is worse than one. It is kept on the permission-refusal
 * branch, where it is the only way out and where the shell's own "All conversations" item is
 * (correctly) absent for exactly the operator who lands there.
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
    return <Spinner label="Checking your permissions…" />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title="All conversations" />
        {/* `Alert tone="danger"` renders `role="alert"` - the same assertive live region the bare
            `<p role="alert">` here had before `11-05`, which this item's accessibility floor
            requires be preserved rather than lost in the restyle. */}
        <Alert tone="danger">You do not have permission to view every conversation for this site.</Alert>
        <p>
          <Link to="/">Back to queue</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="All conversations"
        description="Every conversation for this site, not just the ones assigned to you. Read-only."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Panel title="Site conversations" description={`Refreshed every ${REFRESH_INTERVAL_MS / 1000} seconds.`}>
        {conversations === null ? (
          <Skeleton lines={4} label="Loading conversations…" />
        ) : conversations.length === 0 ? (
          <p className="ago-empty">No conversations yet.</p>
        ) : (
          <Table
            caption="Every conversation for this site, newest first."
            columns={COLUMNS}
            rows={conversations}
            rowKey={(c) => c.conversationId}
          />
        )}
      </Panel>
    </>
  );
}
