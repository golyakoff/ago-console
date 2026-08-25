import { useOutletContext } from "react-router-dom";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

/**
 * `11-06`: what the workspace layout hands down to whichever conversation is open.
 *
 * A router outlet context rather than a fourth React provider: the only consumer is the element the
 * layout route already renders through its own `<Outlet />`, and `useOutletContext` is exactly the
 * mechanism React Router provides for that parent-to-outlet direction. A context provider would work
 * too and would be one more thing mounted for every route, including the two (`/admin`,
 * `/settings/widget`) that are not in the workspace at all.
 *
 * Kept in a `.ts` of its own rather than exported from `WorkspaceLayout.tsx`, following the split
 * `AuthContext`/`AuthProvider` and `OperatorConnectionContext`/`OperatorConnectionProvider` already
 * use in this repository: a module exporting both a component and a plain function breaks Vite's
 * Fast Refresh for that component (`react-refresh/only-export-components`).
 */
export interface WorkspaceOutletContext {
  /** The queue row for the conversation currently open, when the queue has been loaded and contains
   * it. `null` while the first fetch is in flight, and also for a conversation reached by direct URL
   * that is not (or is no longer) assigned to this operator - the thread itself still loads from the
   * hub in that case, so this is context, never a gate. */
  conversation: ConversationSummaryDto | null;
  /** The workspace's shared, ticking `now` - one timer for the whole screen (`useNow`). */
  now: Date;
  /** The operator's IANA zone, resolved once by the layout (`time/format.ts`). `null` means "not
   * known", which every renderer turns into UTC *labelled* as UTC. */
  timeZone: string | null;
  /** Re-reads `GET /api/v1/conversations/queue`. The conversation view calls it after a send, so the
   * rail's own row stops looking stale the moment the operator answers. */
  refreshQueue: () => void;
  /** `5-15`: tells the server the operator has read this conversation up to `upToSequence` - the
   * newest message actually on screen - and clears the rail's badge for it.
   *
   * Lives here rather than in the conversation view because the *badge* is the layout's business
   * while the *sequence* is only known where the thread is: the view supplies the number, the layout
   * owns the call and the resulting state. Fire-and-forget by design: a failed mark-read leaves the
   * count as it was, which is the safe direction to be wrong in, and the next open re-issues it -
   * there is nothing here worth interrupting an operator about. */
  markRead: (conversationId: string, upToSequence: number) => void;
}

export function useWorkspace(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}
