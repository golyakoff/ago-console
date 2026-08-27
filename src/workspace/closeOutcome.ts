import { ApiProblemError } from "../api/problemDetails.js";
import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `11-09`: what an operator is told when closing a conversation does not work, and whether trying
 * again is a sensible thing to offer.
 *
 * A pure function of the server's own stable `type` code, so every branch below is a test rather
 * than a screenshot. `api-design.md`'s rule - clients branch on `type`, never on the message - is
 * what makes that possible, and this is the first call in the console that genuinely needs it: three
 * of the four failures below are things an operator can act on, and two of them are the same HTTP
 * status.
 */

export interface CloseOutcome {
  /** What the operator reads. Written for somebody who pressed a button, not for a log. */
  readonly message: string;
  /** Whether pressing it again could plausibly work. Drives whether a Retry action is offered -
   * offering one for "already closed" would be inviting the operator to fail twice. */
  readonly retryable: boolean;
  /** Whether the rail's own view of the world is now known to be stale. Every failure except a lost
   * race means the conversation is not what this tab thought it was, and the honest response is to
   * re-read the queue rather than to leave a row the operator can press again. */
  readonly refreshQueue: boolean;
}

/**
 * <b>`6-08`'s two conflict cases, and the one place the console has to infer rather than read.</b>
 *
 * `ago-chat`'s `CloseConversationHandler` produces four codes, and they do not partition the way a
 * reader expects:
 *
 * - **`Conversation.InvalidState`** (`409`) - `Conversation.Close()` refused on fresh data. In
 *   practice: somebody already closed it. Terminal, so no retry.
 * - **`Conversation.ConcurrencyConflict`** (`409`) - `6-08`'s own code, raised only after the handler
 *   already reloaded the row and retried once and a *third* writer landed inside that window. The
 *   server's own message says "retry the request", and it means it: nothing is wrong with the
 *   request, the row would not sit still. The only retryable case here.
 * - **`Conversation.NotFound`** (`404`) - gone entirely.
 * - **`Conversation.Forbidden`** (`403`) - <b>two different situations sharing one code.</b>
 *   `CloseConversationHandler` returns it for "this operator lacks `conversation:close`" *and* for
 *   "this operator is not assigned to this conversation", which is exactly what a reassignment
 *   underneath produces.
 *
 * That last one is the item's "reassigned underneath" case, and the console cannot read the
 * difference off the wire - `api-design.md` forbids branching on the message text, and there is only
 * one code. What it can use is a fact it already holds and the server does not send: <b>whether this
 * operator holds the permission at all</b>. The handler checks the permission *first* and the
 * assignment *second*, so a `403` reaching an operator who does hold `conversation:close` can only
 * be the assignment check - a conversation that is no longer theirs.
 *
 * <b>That inference is sound, and it is still an inference</b>, resting on a check order in another
 * repository that nothing here can enforce. It is written down rather than left implicit, and the
 * honest fix is a distinct error code server-side - which is an `ago-chat` change, out of `11-09`'s
 * lane, and is reported rather than made. If that code ever arrives, this function is the one place
 * that changes.
 */
/**
 * `11-12`: every sentence below moved into `ConsoleStrings`, and `strings` is a parameter defaulted
 * to `en` rather than a `useStrings()` call inside this function - because this function is not a
 * component. It runs from `CloseConversationButton`'s `attempt()`, an event handler, and hooks only
 * run during render; the caller (which *does* render, and *does* hold a `useStrings()` value) passes
 * its own strings through instead. Defaulting to `en` rather than requiring the argument everywhere
 * is what keeps `closeOutcome.test.ts`'s nine existing two-argument call sites - which assert the
 * English sentences on purpose - green without editing a test file this item has no reason to touch.
 */
export function closeOutcomeFor(reason: unknown, holdsClosePermission: boolean, strings: ConsoleStrings = en): CloseOutcome {
  if (!(reason instanceof ApiProblemError)) {
    // A network failure, or a CORS refusal a page is deliberately told nothing about. Nothing was
    // necessarily written, so retrying is honest - and the queue may be fine, so leave it alone.
    return {
      message: strings.closeOutcomeNetworkError,
      retryable: true,
      refreshQueue: false,
    };
  }

  switch (reason.code) {
    case "Conversation.InvalidState":
      return {
        message: strings.closeOutcomeAlreadyClosed,
        retryable: false,
        refreshQueue: true,
      };

    case "Conversation.ConcurrencyConflict":
      return {
        message: strings.closeOutcomeConcurrencyConflict,
        retryable: true,
        // Deliberately not refreshed: nothing about the conversation is known to have changed, and a
        // queue re-read on a lost race would make the rail flicker for a failure that is about
        // timing rather than about state.
        refreshQueue: false,
      };

    case "Conversation.NotFound":
      return {
        message: strings.closeOutcomeNotFound,
        retryable: false,
        refreshQueue: true,
      };

    case "Conversation.Forbidden":
      return holdsClosePermission
        ? {
            message: strings.closeOutcomeReassigned,
            retryable: false,
            refreshQueue: true,
          }
        : {
            // Reachable despite the button being hidden: the permission snapshot this console holds
            // is from sign-in, and a permission revoked since then is a `403` for a control the
            // operator can still see on their screen.
            message: strings.closeOutcomeNoPermission,
            retryable: false,
            refreshQueue: false,
          };

    default:
      // A code this console has never heard of. The server's own wording reaches the operator
      // unedited rather than being replaced by a generic sentence that loses what happened -
      // `api-design.md`'s corollary to "branch on type": a message you do not branch on is a message
      // you show. Never translated - it is not this console's sentence to translate.
      return { message: reason.message, retryable: true, refreshQueue: true };
  }
}
