import { createContext, useContext } from "react";
import type { TeamMessageDto } from "../realtime/protocol/types.js";

/**
 * `25-163`: "Общение"'s own unread-count source - split from `TeamChatUnreadProvider.tsx` (context
 * object plus hook) the same shape `ConversationsAttentionContext.tsx`/`ConversationsAttentionProvider.tsx`
 * already use, for the identical reason (`react-refresh/only-export-components`).
 */
export interface TeamChatUnreadContextValue {
  /** How many team messages have arrived since "Общение" was last open, excluding this operator's
   * own sent messages. `0` once `TeamChatPage` reports itself open (`notifyOpen(true)`). */
  unreadCount: number;
  /**
   * `OperatorConnection.onTeamMessage` is a single-listener setter (`operatorConnection.ts`'s own
   * `teamMessageListener` field) - `TeamChatUnreadProvider` is the one place in this console that ever
   * calls it, so it can maintain the badge for every route, not only while "Общение" itself is
   * mounted. `TeamChatPage` receives its own live messages through this fan-out instead of registering
   * a second, conflicting listener of its own - registers `listener` and returns the function that
   * un-registers it, the ordinary `useEffect` cleanup shape.
   */
  subscribe: (listener: (message: TeamMessageDto) => void) => () => void;
  /** `TeamChatPage` calls this `true` on mount and `false` on unmount. While `true`, a live message
   * is presumed already seen (the page renders it directly) and never increments the count; the
   * transition to `true` also clears whatever was already counted - the same "opening it is what
   * reading it means" shape this item's own Scope asks for, since team chat has no per-operator
   * mark-read call of its own to wait for the way a visitor conversation's badge does (`5-15`). */
  notifyOpen: (open: boolean) => void;
}

export const TeamChatUnreadContext = createContext<TeamChatUnreadContextValue | null>(null);

/** Throws outside `TeamChatUnreadProvider`, the same "every route that needs this is already inside
 * the provider" reasoning `useOperatorConnection`/`useConversationsAttention` establish for
 * themselves - correct for `TeamChatPage`, a route reached only once the provider is known to be
 * mounted (`App.tsx`'s own layout route). */
export function useTeamChatUnread(): TeamChatUnreadContextValue {
  const value = useContext(TeamChatUnreadContext);
  if (value === null) {
    throw new Error("useTeamChatUnread() called outside <TeamChatUnreadProvider>.");
  }

  return value;
}

/**
 * `25-163`: the tolerant counterpart, for `OperatorShell` - which renders on every route, including
 * the several unit-test harnesses that wire up `AuthContext`/`PermissionsContext`/
 * `OperatorConnectionContext` directly and were never given a reason to also mount
 * `TeamChatUnreadProvider`, since nothing they exercise reads it. The identical "provider never
 * mounted" tolerance `usePendingBookingsBadge`'s own doc comment states for its own bare `useContext`
 * read of `CalendarConnectionContext`, for the identical reason: `0` (no badge) is the correct answer
 * to give a shell that never had a live team-chat connection to begin with, not a crash.
 */
export function useTeamChatUnreadBadge(): number {
  return useContext(TeamChatUnreadContext)?.unreadCount ?? 0;
}
