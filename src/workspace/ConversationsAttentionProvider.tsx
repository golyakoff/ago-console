import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { fetchOperatorQueue } from "../api/conversationsApi.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";
import { applyAttentionEvent, totalUnread, type AttentionEvent, type ReadStateMap } from "./attention.js";
import { ConversationsAttentionContext, type ConversationsAttentionContextValue } from "./ConversationsAttentionContext.js";

/** Matches `WorkspaceLayout`'s own `WAITING_REFRESH_INTERVAL_MS` - the same cadence, deliberately: a
 * reader comparing the two should see one fallback-reconciliation rhythm for "conversations", not two
 * unexplained numbers. */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * `25-51`: the single source of truth for "how many unread messages does this operator have,
 * total" - read by `OperatorShell` for the Диалоги nav badge, and fed live updates by `WorkspaceLayout`
 * (the one place a message arrives or a conversation is marked read) so the two never disagree.
 *
 * **Why a provider, not two independent trackers.** `OperatorShell` (the nav, a parent in the
 * component tree) and `WorkspaceLayout` (the rail, a descendant reached through `<Outlet />`) both
 * need this number, and "reading a conversation clears its badge" (this item's own Done-when) has to
 * be visible in the *parent's* nav the instant the mark-read call in the *descendant* succeeds - a
 * fact that can only flow between the two through shared state one of them owns, not by each computing
 * its own independently and hoping they agree. React context is the tool for exactly this; lifting
 * `WorkspaceLayout`'s entire `attention` state up here outright was the other candidate and was
 * rejected because `WorkspaceLayout`'s own effects are already carefully sequenced around React's
 * `react-hooks/set-state-in-effect`/`refs` rules (`WorkspaceLayout.tsx`'s own `23-96` remarks) -
 * moving them would have re-opened everything those comments already settled, for a plumbing change
 * that does not need it. This provider instead owns a *second*, independent, always-unfiltered queue
 * fetch and the identical `attention.ts` reducer, and `WorkspaceLayout` forwards it the same events it
 * already applies to its own local copy (`reportAttentionEvent`, that file's own remarks).
 *
 * **Its own poll, not `WorkspaceLayout`'s.** `WorkspaceLayout`'s own `refreshQueue` can be narrowed by
 * a tag filter (`ConversationsAttentionContextValue.unreadTotal`'s own doc comment) - reusing that
 * fetch for the nav total would make the badge quietly shrink whenever an operator filters their own
 * rail, which is not what "how many unread messages, total" is supposed to mean. This provider's own
 * poll is always called with no tag filter at all, matching `OperatorShell`'s "the whole nav, not one
 * filtered view of it" vantage point. That also means `"refetched"` (the reset that retires a locally-
 * counted arrival once a fresh snapshot has caught up, `attention.ts`'s own doc comment) is fired only
 * from *this* provider's own poll, never forwarded from `WorkspaceLayout`'s - a `"refetched"` built from
 * a filtered snapshot would wrongly reset freshness for conversations that fetch never actually re-read.
 *
 * Split from `ConversationsAttentionContext.tsx` (context object plus the `useConversationsAttention`
 * hook) rather than one file, the identical shape `OperatorConnectionContext.tsx`/
 * `OperatorConnectionProvider.tsx` and `CalendarConnectionContext.tsx`/
 * `CalendarOperatorConnectionProvider.tsx` already use in this codebase - `react-refresh/only-export-
 * components` flags a file that exports both a component and a plain function, and every existing
 * provider/hook pair here is already split for that reason rather than a new one.
 */
export function ConversationsAttentionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accessToken = user?.access_token;
  const [queue, setQueue] = useState<OperatorQueueResponse | null>(null);
  const [attention, setAttention] = useState<ReadStateMap>({});

  const applyEvent = useCallback((event: AttentionEvent) => {
    setAttention((prev) => applyAttentionEvent(prev, event));
  }, []);

  const refresh = useCallback(() => {
    if (!accessToken) {
      return;
    }

    fetchOperatorQueue(accessToken)
      .then((next) => {
        setQueue(next);
        applyEvent({ kind: "refetched" });
      })
      .catch((err: unknown) => {
        // Never surfaced to the operator - the same "a stale nav badge is a cosmetic defect the next
        // poll corrects" posture `usePendingBookingsBadge`'s own identical catch takes.
        console.warn("Failed to refresh the unread-conversations nav badge", err);
      });
  }, [accessToken, applyEvent]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const unreadTotal = queue === null ? 0 : totalUnread(queue.assignedToMe, attention);

  const value: ConversationsAttentionContextValue = { unreadTotal, applyEvent };

  return <ConversationsAttentionContext.Provider value={value}>{children}</ConversationsAttentionContext.Provider>;
}
