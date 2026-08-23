/**
 * The sender's own connection receives its message twice by design: once as an immediate local
 * echo, once again when the real fan-out delivery completes (realtime.md's Fan-out path -
 * "the resulting duplicate push back to this same connection is accepted, not special-cased away
 * ... messaging.md's client-side dedupe-by-message-id already covers the duplicate the same way it
 * covers a redelivered broker message"). This is that dedupe, on the client that receives it.
 *
 * Identical shape to `ago-widget/src/protocol/dedup.ts`'s `SeenMessageIds` - the console is solving
 * the identical protocol problem independently, so it gets the identical, already-reviewed fix.
 * Bounded by a fixed capacity rather than growing forever - an operator can leave the console open
 * for a full shift, and nothing here needs to remember a message id from hours ago.
 */
export class SeenMessageIds {
  private readonly seen = new Set<string>();
  private readonly capacity: number;

  // Not a TS constructor-parameter-property (`constructor(private readonly capacity = 500)`) -
  // `tsconfig.app.json`'s `erasableSyntaxOnly` (5-06's scaffold) forbids that shorthand, since it
  // needs an actual emitted assignment, not just type erasure.
  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  /** Returns true the first time an id is seen, false on every repeat. */
  markSeen(id: string): boolean {
    if (this.seen.has(id)) {
      return false;
    }

    if (this.seen.size >= this.capacity) {
      const [oldest] = this.seen;
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }

    this.seen.add(id);
    return true;
  }
}

/**
 * `clientMessageId` per realtime.md's Client protocol section - a client-generated id attached to
 * every send, used for **echo suppression and retry deduplication**. Unlike `ago-widget`'s own
 * `newClientMessageId` (written when `VisitorHub.SendMessageAsync` did not accept one yet), this one
 * is a real, load-bearing id: `5-07`'s own companion `ago-chat` change wires it all the way through
 * `SendMessageAsync` -> `Conversation.AddOperatorMessage`'s in-memory dedup check, so a retried send
 * that reuses the same id genuinely cannot create a second message server-side, not just client-side.
 */
export function newClientMessageId(): string {
  return crypto.randomUUID();
}
