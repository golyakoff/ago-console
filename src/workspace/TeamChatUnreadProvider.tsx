import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useOperatorConnection } from "../realtime/OperatorConnectionContext.js";
import type { TeamMessageDto } from "../realtime/protocol/types.js";
import { TeamChatUnreadContext, type TeamChatUnreadContextValue } from "./TeamChatUnreadContext.js";

/**
 * `25-163`: "Общение" carried no unread-count badge, unlike "Мои" - this is the first unread-count
 * source team chat has ever had, since `25-51`'s own `unreadCount`/`arrivedSinceFetch` plumbing
 * (`attention.ts`) is keyed by conversation id and answers "how many visitor messages, per assigned
 * conversation" - a question with no meaning for a single, tenant-wide team room, and per this item's
 * own Scope, only the *pattern* is reusable here, not the mechanism itself.
 *
 * **Why a whole provider, not a `useState` inside `OperatorShell`.** `OperatorConnection.onTeamMessage`
 * is a single-listener setter, and `TeamChatPage` already called it directly for its own transcript
 * before this item. A second, independent call to it from `OperatorShell` would silently replace
 * `TeamChatPage`'s own registration (or vice versa, depending on mount order) - exactly the "stale
 * closure" trap `WorkspaceLayout`'s own `onAnyMessage` comment warns about for a different reason. This
 * provider is the one place that ever calls `onTeamMessage`, and `TeamChatPage` now receives its own
 * copy of every message through `subscribe` instead (`TeamChatUnreadContext`'s own remarks) - one real
 * hub registration, fanned out to as many interested consumers as this console ever grows.
 *
 * **Mounted alongside `ConversationsAttentionProvider`, inside `OperatorConnectionProvider`** (`App.tsx`) -
 * unlike that provider, this one has a real, unavoidable dependency on the live hub connection (there is
 * no per-operator "how many unread team messages" endpoint to poll the way `ConversationsAttentionProvider`
 * polls `GET /api/v1/conversations/queue`; `23-32`'s own scope never built one, and this item's own Scope
 * stays console-only), so it cannot be lifted any higher than where `useOperatorConnection()` is legal.
 */
export function TeamChatUnreadProvider({ children }: { children: ReactNode }) {
  const { connection } = useOperatorConnection();
  const { operatorId } = usePermissions();
  const [unreadCount, setUnreadCount] = useState(0);

  // A ref, not state: read only inside the hub callback below, and reading it must never itself
  // trigger a re-render - the identical `openConversationIdRef` shape `WorkspaceLayout` already uses
  // for the analogous "is the thing this message is about currently on screen" question.
  const isOpenRef = useRef(false);
  const subscribersRef = useRef(new Set<(message: TeamMessageDto) => void>());

  useEffect(() => {
    connection.onTeamMessage((message) => {
      for (const listener of subscribersRef.current) {
        listener(message);
      }

      // `TeamChatPage` renders this message directly while it is open - the badge exists for every
      // *other* route, not this one.
      if (isOpenRef.current) {
        return;
      }

      // This operator's own sent message is echoed back through the identical push every other
      // operator's arrives through (`OperatorConnection.sendTeamMessage`'s own remarks: "the caller's
      // own tab learns the outcome through its own TeamMessageReceived push") - the same
      // "an author's own echoed-back send is not unread to them" exclusion `WorkspaceLayout`'s own
      // `onAnyMessage` applies for visitor conversations (there, by `authorKind`; here, by comparing
      // the message's own author against this operator's own id, team chat having only one author
      // kind - every participant is an operator).
      if (operatorId && message.authorOperatorId === operatorId) {
        return;
      }

      setUnreadCount((count) => count + 1);
    });
  }, [connection, operatorId]);

  const subscribe = useCallback((listener: (message: TeamMessageDto) => void) => {
    subscribersRef.current.add(listener);
    return () => {
      subscribersRef.current.delete(listener);
    };
  }, []);

  const notifyOpen = useCallback((open: boolean) => {
    isOpenRef.current = open;
    if (open) {
      setUnreadCount(0);
    }
  }, []);

  const value: TeamChatUnreadContextValue = { unreadCount, subscribe, notifyOpen };

  return <TeamChatUnreadContext.Provider value={value}>{children}</TeamChatUnreadContext.Provider>;
}
