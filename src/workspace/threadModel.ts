import type { MessageDto } from "../realtime/protocol/types.js";
import { dayKey, parseInstant } from "../time/format.js";

/**
 * `11-06`: turns a flat list of messages into the thing an operator reads - days, then groups of
 * consecutive messages from one author, then messages.
 *
 * Pure, and separate from the component that renders it, because the two rules here are exactly the
 * kind that break silently: what counts as "the same day" (a zone question, not a UTC one) and what
 * counts as "the same author speaking again".
 *
 * **Ordering is by `sequence`, never by time.** `date-and-time.md` rule 6, and it is not theoretical
 * here: messages reach `ConversationPage` from three places - the join page, a reconnect's delta,
 * and live pushes - and only the server-assigned `sequence` is guaranteed to agree between them.
 * Sorting by `createdAt` would put two messages written in the same second in whichever order two
 * clocks happened to disagree about.
 */

export interface ThreadDaySeparator {
  kind: "day";
  /** `YYYY-MM-DD` in the rendering zone - also the React key, and unique by construction. */
  key: string;
  /** The first instant on that day in this thread, for the renderer to format a label from. */
  at: Date;
}

export interface ThreadMessageItem {
  kind: "message";
  message: MessageDto;
  /** First message of a run by the same author on the same day - the only one that repeats the
   * author's name. The rest are visually attached to it. */
  startsGroup: boolean;
  /** `null` when the wire timestamp is missing or unparseable, which the renderer shows as an
   * absent timestamp rather than as the literal text "Invalid Date". */
  at: Date | null;
}

export type ThreadItem = ThreadDaySeparator | ThreadMessageItem;

/** Two messages belong to the same group when the same participant sent both. `authorId` is checked
 * as well as `authorKind` because two operators can appear in one thread once a conversation has
 * been reassigned - rare today, and cheap to be right about. */
function sameAuthor(a: MessageDto, b: MessageDto): boolean {
  return a.authorKind === b.authorKind && a.authorId === b.authorId;
}

export function buildThread(messages: readonly MessageDto[], timeZone: string | null): ThreadItem[] {
  const ordered = [...messages].sort((a, b) => a.sequence - b.sequence);
  const items: ThreadItem[] = [];

  let previous: MessageDto | null = null;
  let previousDayKey: string | null = null;

  for (const message of ordered) {
    const at = parseInstant(message.createdAt);
    // A message with no usable timestamp cannot open a day, and must not close the previous one
    // either - it simply joins whatever day is currently open.
    const key = at === null ? previousDayKey : dayKey(at, timeZone);

    if (at !== null && key !== null && key !== previousDayKey) {
      items.push({ kind: "day", key, at });
      previousDayKey = key;
      previous = null; // A day separator always breaks the group, even for the same author.
    }

    items.push({ kind: "message", message, startsGroup: previous === null || !sameAuthor(previous, message), at });
    previous = message;
  }

  return items;
}
