import { describe, expect, it } from "vitest";
import { ApiProblemError } from "../api/problemDetails.js";
import { closeOutcomeFor } from "./closeOutcome.js";

/**
 * `11-09`: **`6-08`'s conflict path, which is the part of this item most likely to be skipped.**
 *
 * The server produces four codes for a failed close and they do not partition the way a reader
 * expects: two of them are `409` and mean different things, and one code covers two different
 * situations. Every branch below is a sentence an operator reads, so every branch is a test - a
 * generic "could not close the conversation" would pass a typecheck, ship, and tell nobody anything.
 */
function failure(code: string, status: number, message = "server wording"): ApiProblemError {
  return new ApiProblemError(code, message, status);
}

describe("a conversation that was already closed", () => {
  it("says so, and does not invite the operator to try again", () => {
    // `Conversation.InvalidState` - `Conversation.Close()` refused on fresh data. Terminal: pressing
    // the button again produces the identical 409, so offering a retry would be inviting a second
    // failure.
    const outcome = closeOutcomeFor(failure("Conversation.InvalidState", 409), true);

    expect(outcome.message).toBe("This conversation has already been closed.");
    expect(outcome.retryable).toBe(false);
    // Somebody else closed it, so this tab's queue is stale.
    expect(outcome.refreshQueue).toBe(true);
  });
});

describe("a conversation reassigned underneath the operator", () => {
  it("says it is no longer theirs, rather than that they lack a permission", () => {
    // The item's own "reassigned underneath" case. `CloseConversationHandler` returns
    // `Conversation.Forbidden` for *both* "you lack conversation:close" and "you are not assigned to
    // this one" - so the console distinguishes them by the one fact it holds and the server does not
    // send: it knows this operator holds the permission, and the handler checks the permission
    // first. See `closeOutcome.ts` for why that inference is sound and still an inference.
    const outcome = closeOutcomeFor(failure("Conversation.Forbidden", 403), true);

    expect(outcome.message).toBe("This conversation is no longer assigned to you — someone else has taken it.");
    expect(outcome.retryable).toBe(false);
    expect(outcome.refreshQueue).toBe(true);
  });

  it("says the other thing when the operator does not hold the permission", () => {
    // Reachable even though the button is hidden: the permission snapshot is from sign-in, so a
    // permission revoked since then is a 403 for a control still on screen. Telling that operator
    // "someone else has taken it" would be a guess, and the wrong one.
    const outcome = closeOutcomeFor(failure("Conversation.Forbidden", 403), false);

    expect(outcome.message).toBe("You do not have permission to close conversations for this site.");
    expect(outcome.retryable).toBe(false);
    expect(outcome.refreshQueue).toBe(false);
  });

  it("gives the two 403 situations genuinely different wording", () => {
    // Stated as its own assertion because the whole point of the branch is that one code produces
    // two messages. A refactor that collapsed them would pass both tests above only if it happened
    // to pick the same sentence twice - this is what catches that.
    const reassigned = closeOutcomeFor(failure("Conversation.Forbidden", 403), true);
    const unpermitted = closeOutcomeFor(failure("Conversation.Forbidden", 403), false);

    expect(reassigned.message).not.toBe(unpermitted.message);
  });
});

describe("a lost optimistic-concurrency race", () => {
  it("is the one failure worth retrying, and does not disturb the rail", () => {
    // `6-08`'s own code, raised only after the handler already reloaded and retried once and a third
    // writer landed inside that window. Nothing is wrong with the request; the row would not sit
    // still. The server's own message says "retry the request" and it means it.
    const outcome = closeOutcomeFor(failure("Conversation.ConcurrencyConflict", 409), true);

    expect(outcome.message).toContain("Try closing it again");
    expect(outcome.retryable).toBe(true);
    // Deliberately no refresh: nothing about the conversation is known to have changed, and a queue
    // re-read here would make the rail flicker for a failure about timing rather than state.
    expect(outcome.refreshQueue).toBe(false);
  });

  it("is not confused with the other 409", () => {
    // The two `409`s are the pair a status-code-only implementation would merge, and merging them
    // would tell an operator to retry something terminal or refuse to retry something transient.
    const alreadyClosed = closeOutcomeFor(failure("Conversation.InvalidState", 409), true);
    const raced = closeOutcomeFor(failure("Conversation.ConcurrencyConflict", 409), true);

    expect(alreadyClosed.message).not.toBe(raced.message);
    expect(alreadyClosed.retryable).not.toBe(raced.retryable);
  });
});

describe("everything else", () => {
  it("reports a vanished conversation as gone", () => {
    const outcome = closeOutcomeFor(failure("Conversation.NotFound", 404), true);

    expect(outcome.message).toBe("This conversation no longer exists.");
    expect(outcome.retryable).toBe(false);
    expect(outcome.refreshQueue).toBe(true);
  });

  it("shows the server's own wording for a code this console has never heard of", () => {
    // `api-design.md`'s corollary to "branch on type": a message you do not branch on is a message
    // you show. Replacing it with a generic sentence would lose whatever actually happened.
    const outcome = closeOutcomeFor(failure("Conversation.SomethingNew", 400, "Wildly specific."), true);

    expect(outcome.message).toBe("Wildly specific.");
    expect(outcome.retryable).toBe(true);
  });

  it("treats an unreachable server as retryable and leaves the queue alone", () => {
    // A network failure and a CORS refusal are indistinguishable to a page by design. Nothing was
    // necessarily written, so retrying is honest.
    const outcome = closeOutcomeFor(new TypeError("Failed to fetch"), true);

    expect(outcome.message).toContain("could not reach the server");
    expect(outcome.retryable).toBe(true);
    expect(outcome.refreshQueue).toBe(false);
  });
});
