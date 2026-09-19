/**
 * `11-06`, rewritten by `5-15`: what needs the operator's attention, and how loudly.
 *
 * ## The server owns the number now
 *
 * `11-06` had to invent a session-local notion of "read", because `ago-chat`'s
 * `operatorUnreadCount` only ever went up - there was no mark-read command anywhere in the
 * repository, so a badge fed from that field alone never cleared, and a hard reload brought every
 * already-read conversation's historical total back. `5-15` added the missing write
 * (`POST /api/v1/conversations/{id}/read`, cleared up to the sequence the operator actually has),
 * so that whole fallback is gone: **`operatorUnreadCount` is the truth**, and it survives a reload
 * because it is a column, not a tab's memory.
 *
 * What is left here is not a parallel notion of read state - it is a *freshness* overlay, and only
 * for the window between queue fetches. `WorkspaceLayout` re-reads the queue every 15 seconds, so
 * without this the badge would lag a real arrival by up to that long, and lag a clear the operator
 * just performed by the length of one round trip:
 *
 * - **`incoming`** - a visitor message was pushed for a conversation that is not on screen
 *   (`OperatorConnection.onAnyMessage`). The count goes up straight away instead of at the next poll.
 * - **`cleared`** - a mark-read for this conversation has *succeeded on the server*. The snapshot
 *   the console is holding still has the old number in it, so it is ignored for that conversation
 *   until the next fetch replaces it.
 * - **`refetched`** - a new queue snapshot arrived and already contains everything above. Both
 *   adjustments reset, which is what stops them being applied twice on top of a number that has
 *   caught up. (`11-06` had no such reset, so a message counted locally *and* by the next poll was
 *   briefly counted twice.)
 *
 * `newlyAssigned` is the one genuinely session-local fact left, and stays: "assigned while you were
 * sitting here and you have not looked at it yet" is not something the server has an opinion about.
 *
 * A message pushed in the exact instant a queue fetch is in flight can be missed by both this
 * overlay and that snapshot. It corrects itself on the next poll, and it is not worth a
 * request-sequencing scheme to close - the server, not this module, is what the badge is ultimately
 * reading.
 *
 * Everything here is a pure function of state the caller holds, so the badge arithmetic and the
 * document title are testable without a DOM, a clock or a hub connection.
 */

import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

/** What the console knows that the queue snapshot in its hand does not, yet. */
export interface LocalReadState {
  /** Visitor messages pushed for this conversation since that snapshot, while it was not on screen. */
  arrivedSinceFetch: number;
  /** A mark-read succeeded on the server since that snapshot, so its count is known to be stale. */
  clearedSinceFetch: boolean;
  /** Assigned to this operator during this session and not yet opened - `4-02`'s engine handed it
   * over while they were sitting here. Drives the "New" marker; see `WorkspaceLayout` for why an
   * arrival is announced rather than acted on. */
  newlyAssigned: boolean;
  /** `25-162`: when a visitor message last arrived for this conversation, this session - the one
   * signal `mostRecentlyActiveFirst` sorts "Мои" by. `undefined` for a conversation with no
   * locally-observed activity yet (every conversation at page load, until its first live message) -
   * that function falls back to `ConversationSummaryDto.createdAt` for those, so the initial order is
   * unchanged from before this item until a real message actually reorders something. Caller-supplied
   * (the pushed message's own `createdAt`, a server-assigned timestamp - `date-and-time.md` rule 6),
   * never computed in here, the same "pure function of state the caller holds... testable without a
   * clock" discipline this module's own top-of-file doc comment already states. */
  lastActivityAt?: string;
}

export type ReadStateMap = Readonly<Record<string, LocalReadState>>;

const UNSEEN: LocalReadState = { arrivedSinceFetch: 0, clearedSinceFetch: false, newlyAssigned: false };

function stateFor(states: ReadStateMap, conversationId: string): LocalReadState {
  return states[conversationId] ?? UNSEEN;
}

/**
 * The number the badge shows for one conversation: the server's own count, adjusted only for what
 * has happened since it was fetched.
 */
export function unreadCountFor(conversation: ConversationSummaryDto, states: ReadStateMap): number {
  const local = stateFor(states, conversation.conversationId);
  const fromServer = local.clearedSinceFetch ? 0 : conversation.operatorUnreadCount;
  return fromServer + local.arrivedSinceFetch;
}

/** Total across everything assigned to this operator - the number that goes in the document title,
 * so a backgrounded tab still tells the truth. Waiting conversations are deliberately not counted:
 * they are not this operator's to answer (`4-02` decides that), and putting them in the title would
 * turn situational awareness into a demand. */
export function totalUnread(assigned: readonly ConversationSummaryDto[], states: ReadStateMap): number {
  return assigned.reduce((sum, conversation) => sum + unreadCountFor(conversation, states), 0);
}

/** Whether a conversation should wear the "New" marker: assigned during this session, still not
 * opened. It survives a queue refetch (which is why it lives here and not in a transient banner) and
 * disappears the moment the operator opens the conversation. */
export function isNewlyAssigned(conversation: ConversationSummaryDto, states: ReadStateMap): boolean {
  return stateFor(states, conversation.conversationId).newlyAssigned;
}

/**
 * `(3) AGO Chat operator console` - the browser tab as a status line.
 *
 * The count leads, because a tab title is truncated from the right in every browser; a title ending
 * in the count would be the half that gets cut off. Zero renders the plain title rather than `(0)`,
 * so "nothing waiting" reads as calm rather than as a counter that happens to be at zero.
 */
export function documentTitleFor(unread: number, base: string): string {
  return unread > 0 ? `(${unread}) ${base}` : base;
}

/** The list order the item asks for: oldest first, so the visitor who has waited longest is the one
 * at the top of the operator's eye line.
 *
 * Ordering by `createdAt` is ordering by a *server*-assigned timestamp, all rows minted by the same
 * clock - not by the browser's, and not the per-conversation message ordering that
 * `date-and-time.md` rule 6 reserves for `sequence`. Ties fall back to the conversation id purely so
 * the order is stable across refetches; two conversations created in the same millisecond otherwise
 * swap places on every poll. */
export function oldestFirst(conversations: readonly ConversationSummaryDto[]): ConversationSummaryDto[] {
  return [...conversations].sort((a, b) => {
    const byAge = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (byAge !== 0 && !Number.isNaN(byAge)) {
      return byAge;
    }

    return a.conversationId.localeCompare(b.conversationId);
  });
}

/**
 * `25-162`: "Мои" own order, most-recently-active first - genuinely different from `oldestFirst`'s
 * own `createdAt` (a conversation's age, which never changes once it is open) and deliberately not
 * reused for this list: an assigned conversation an operator answered an hour ago and one that just
 * got a fresh reply from the visitor should not sit in the same position just because they were
 * *opened* around the same time. `ConversationSummaryDto` carries no per-conversation activity
 * timestamp of its own (`ConversationList`'s own doc comment already states this honestly for a
 * different field), so this reads `LocalReadState.lastActivityAt` - a session-local fact this same
 * reducer already tracks for the unread badge (`unreadCountFor`'s own `arrivedSinceFetch` sibling), not
 * a new field invented for this one call site. A conversation with no observed activity this session
 * falls back to its own `createdAt`, so a freshly loaded page (nothing bumped yet) reads in the exact
 * same order it always has, and only starts reordering once a real message actually arrives.
 */
export function mostRecentlyActiveFirst(
  conversations: readonly ConversationSummaryDto[], states: ReadStateMap,
): ConversationSummaryDto[] {
  return [...conversations].sort((a, b) => {
    const byRecency = activityTimestamp(b, states) - activityTimestamp(a, states);
    if (byRecency !== 0 && !Number.isNaN(byRecency)) {
      return byRecency;
    }

    return a.conversationId.localeCompare(b.conversationId);
  });
}

function activityTimestamp(conversation: ConversationSummaryDto, states: ReadStateMap): number {
  const iso = stateFor(states, conversation.conversationId).lastActivityAt ?? conversation.createdAt;
  return Date.parse(iso);
}

/**
 * The reducer behind the map above. Kept as one exported function over a plain object rather than a
 * class with mutable fields, so React state updates stay ordinary immutable updates and the whole
 * thing is trivially testable.
 */
export type AttentionEvent =
  /** The operator opened this conversation. Local-only: it drops the "New" marker and any locally
   * counted arrivals. The actual clearing of the count is `cleared`, raised when the server says so. */
  | { kind: "opened"; conversationId: string }
  /** A visitor message was pushed for this conversation while it was not the one on screen.
   * `at`: `25-162`'s own addition - the pushed message's own `createdAt`, feeding
   * `LocalReadState.lastActivityAt` (that field's own remarks on why the caller supplies it). */
  | { kind: "incoming"; conversationId: string; at: string }
  /** `POST /api/v1/conversations/{id}/read` succeeded (`5-15`). */
  | { kind: "cleared"; conversationId: string }
  /** `4-02`'s engine assigned this conversation during this session. */
  | { kind: "assigned"; conversationId: string }
  /** A fresh queue snapshot arrived; every per-conversation adjustment above is now baked into it. */
  | { kind: "refetched" };

export function applyAttentionEvent(states: ReadStateMap, event: AttentionEvent): ReadStateMap {
  if (event.kind === "refetched") {
    // `newlyAssigned` deliberately survives: it is not something the snapshot carries, so a refetch
    // is not evidence against it. Only the two freshness adjustments reset.
    //
    // `25-162`: `lastActivityAt` survives for the identical reason - a fresh queue snapshot carries no
    // per-conversation activity timestamp of its own (`ConversationSummaryDto` still only has
    // `createdAt`), so a refetch is not evidence against a real message this session already observed.
    // Without this, the very message that is supposed to move a conversation to the top of "Мои" would
    // fall back to `createdAt` again at the next 15-second poll - the sort order would revert on its
    // own, rather than reflecting the operator's actual session.
    const next: Record<string, LocalReadState> = {};
    for (const [conversationId, state] of Object.entries(states)) {
      if (state.newlyAssigned || state.lastActivityAt !== undefined) {
        next[conversationId] = { ...UNSEEN, newlyAssigned: state.newlyAssigned, lastActivityAt: state.lastActivityAt };
      }
    }

    return next;
  }

  const current = stateFor(states, event.conversationId);

  switch (event.kind) {
    case "opened":
      // Re-opening an already-open conversation is a no-op by construction, which matters because
      // the caller fires this from an effect that re-runs.
      if (current.arrivedSinceFetch === 0 && !current.newlyAssigned) {
        return states;
      }

      return {
        ...states,
        [event.conversationId]: { ...current, arrivedSinceFetch: 0, newlyAssigned: false },
      };

    case "incoming":
      return {
        ...states,
        [event.conversationId]: { ...current, arrivedSinceFetch: current.arrivedSinceFetch + 1, lastActivityAt: event.at },
      };

    case "cleared":
      if (current.clearedSinceFetch && current.arrivedSinceFetch === 0) {
        return states;
      }

      return {
        ...states,
        [event.conversationId]: { ...current, clearedSinceFetch: true, arrivedSinceFetch: 0 },
      };

    case "assigned":
      return { ...states, [event.conversationId]: { ...current, newlyAssigned: true } };
  }
}
