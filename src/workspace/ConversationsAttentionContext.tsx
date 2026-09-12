import { createContext, useContext } from "react";
import type { AttentionEvent } from "./attention.js";

export interface ConversationsAttentionContextValue {
  /** Summed unread count across every conversation assigned to this operator - `totalUnread` applied
   * to `ConversationsAttentionProvider`'s own, always-unfiltered queue fetch. **Always unfiltered**,
   * deliberately: this is the number the left-nav badge shows (`OperatorShell`), and `WorkspaceLayout`'s
   * own rail can be narrowed by a tag filter (`fetchOperatorQueue`'s own `tagIds`) that must never
   * quietly shrink what the nav claims is unread - the two questions ("what am I looking at" vs. "how
   * much is there in total") stay answered from two independent fetches for exactly that reason. */
  unreadTotal: number;
  /** Lets a caller that already knows about a per-conversation attention event (`WorkspaceLayout`,
   * the only place any of these actually happen - a hub push or a confirmed mark-read) feed it into
   * `ConversationsAttentionProvider`'s own copy of the same reducer `attention.ts` already defines, so
   * the nav badge reflects it without waiting for the provider's own next poll. `WorkspaceLayout` keeps
   * its own, separate `attention` state fully intact and unchanged (this call is additive, not a
   * replacement) - see that file's own remarks on `reportAttentionEvent` for why forwarding rather than
   * sharing state outright was the safer shape here. A `"refetched"` event is deliberately never
   * forwarded - see `ConversationsAttentionProvider.tsx`'s own doc comment for why its fetch and
   * `WorkspaceLayout`'s own are not the same snapshot. */
  applyEvent: (event: AttentionEvent) => void;
}

const noop = () => {};

/** `OperatorShell` and `WorkspaceLayout` both call `useConversationsAttention()` unconditionally -
 * `OperatorShell` renders on every route, including inside unit-test harnesses
 * (`WorkspaceLayout.test.tsx` and its siblings - `usePendingBookingsBadge.ts`'s own doc comment names
 * the same list for the calendar side) that inject `AuthContext`/`PermissionsContext`/
 * `OperatorConnectionContext` directly rather than mounting `ConversationsAttentionProvider`, since
 * nothing they exercise today reads it. For those callers, "no provider was mounted" is not a wiring
 * bug to fail loudly on the way `useAuth()`/`useCalendarConnection()` do - it is "this render has no
 * unread total to offer yet", which is exactly what a badge showing nothing already means. A stable,
 * module-level constant (not rebuilt per render) so a caller that gets it does not see its own
 * dependencies change identity on every render for no reason. */
const FALLBACK: ConversationsAttentionContextValue = { unreadTotal: 0, applyEvent: noop };

export const ConversationsAttentionContext = createContext<ConversationsAttentionContextValue | null>(null);

/**
 * `25-51`: reads directly via `useContext`, not the throw-outside-provider shape `useAuth`/
 * `useOperatorConnection`/`useCalendarConnection` use - see `FALLBACK`'s own doc comment just above for
 * why an absent provider is a real, safe answer here ("nothing to show yet") rather than a wiring bug.
 */
export function useConversationsAttention(): ConversationsAttentionContextValue {
  return useContext(ConversationsAttentionContext) ?? FALLBACK;
}
