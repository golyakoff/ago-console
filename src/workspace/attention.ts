/**
 * `11-06`: what needs the operator's attention, and how loudly.
 *
 * ## The honest problem with `operatorUnreadCount`
 *
 * `11-06`'s scope says "real unread badges in the list (the data already exists as
 * `operatorUnreadCount`)". The field exists, but implementing the badge from it alone produces a
 * badge that never goes away, because **nothing in `ago-chat` ever clears it**:
 * `Conversation.IncrementUnreadCount` (`2-05`'s unread-counter consumer) only ever increments, and
 * there is no mark-read command, endpoint or handler anywhere in the repository. The number an
 * operator sees is therefore "every visitor message this conversation has ever contained", not
 * "messages you have not read" - and a badge reading `12 unread` on a conversation the operator is
 * looking at right now is a worse defect than no badge at all.
 *
 * Adding the server-side clear is a backend change, which this stage excludes by name ("anything
 * more is a backend change and belongs in its own item"). So this module does what a client can do
 * honestly on its own, and states the seam rather than hiding it:
 *
 * - A conversation the operator has **opened in this session** is read. Its count is whatever has
 *   arrived *since* they last had it open - which the console genuinely knows, because it sees every
 *   `MessageReceived` push for every conversation it is assigned (`OperatorConnection.onAnyMessage`,
 *   added by this item for exactly this purpose).
 * - A conversation the operator has **not opened in this session** falls back to the server's count,
 *   because on a fresh page load that is the only evidence available about what happened while they
 *   were away.
 *
 * The limitation that leaves, stated plainly rather than buried: after a hard reload, a conversation
 * the operator had already read will show the server's total again, and over-report. That is the
 * exact shape of the gap a `conversation:mark-read` backend item would close, and it is written up
 * in the `11-06` backlog entry's Outcome rather than left for the next reader to rediscover.
 *
 * Everything here is a pure function of state the caller holds, so the badge arithmetic and the
 * document title are testable without a DOM, a clock or a hub connection.
 */

import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

/** What the console has learned about one conversation since the page loaded. */
export interface LocalReadState {
  /** Opened in this session - the operator has actually seen its thread on screen. */
  opened: boolean;
  /** Visitor messages pushed for it while it was *not* the conversation on screen. */
  arrivedSinceOpen: number;
  /** Assigned to this operator during this session and not yet opened - `4-02`'s engine handed it
   * over while they were sitting here. Drives the "New" marker; see `WorkspaceLayout` for why an
   * arrival is announced rather than acted on. */
  newlyAssigned: boolean;
}

export type ReadStateMap = Readonly<Record<string, LocalReadState>>;

const UNSEEN: LocalReadState = { opened: false, arrivedSinceOpen: 0, newlyAssigned: false };

function stateFor(states: ReadStateMap, conversationId: string): LocalReadState {
  return states[conversationId] ?? UNSEEN;
}

/**
 * The number the badge shows for one conversation - see this module's own doc comment for why the
 * server's count is a *fallback* rather than the source.
 */
export function unreadCountFor(conversation: ConversationSummaryDto, states: ReadStateMap): number {
  const local = stateFor(states, conversation.conversationId);
  if (local.opened) {
    return local.arrivedSinceOpen;
  }

  return conversation.operatorUnreadCount + local.arrivedSinceOpen;
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
  const local = stateFor(states, conversation.conversationId);
  return local.newlyAssigned && !local.opened;
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
 * The reducer behind the map above. Kept as one exported function over a plain object rather than a
 * class with mutable fields, so React state updates stay ordinary immutable updates and the whole
 * thing is trivially testable.
 */
export type AttentionEvent =
  /** The operator opened (or is looking at) this conversation. */
  | { kind: "opened"; conversationId: string }
  /** A visitor message was pushed for this conversation while it was not the one on screen. */
  | { kind: "incoming"; conversationId: string }
  /** `4-02`'s engine assigned this conversation during this session. */
  | { kind: "assigned"; conversationId: string };

export function applyAttentionEvent(states: ReadStateMap, event: AttentionEvent): ReadStateMap {
  const current = stateFor(states, event.conversationId);

  switch (event.kind) {
    case "opened":
      // Opening is the only thing that clears attention - and it clears all of it, including a count
      // that arrived from the server. Re-opening an already-open conversation is a no-op by
      // construction, which matters because the caller fires this from an effect that re-runs.
      if (current.opened && current.arrivedSinceOpen === 0 && !current.newlyAssigned) {
        return states;
      }

      return {
        ...states,
        [event.conversationId]: { opened: true, arrivedSinceOpen: 0, newlyAssigned: false },
      };

    case "incoming":
      return {
        ...states,
        [event.conversationId]: { ...current, arrivedSinceOpen: current.arrivedSinceOpen + 1 },
      };

    case "assigned":
      // An assignment for a conversation already open on screen is not "new" to the operator -
      // they are looking at it. Anything else is.
      if (current.opened) {
        return states;
      }

      return { ...states, [event.conversationId]: { ...current, newlyAssigned: true } };
  }
}
