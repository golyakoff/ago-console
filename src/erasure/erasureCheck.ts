/**
 * `16-02`: what a single poll tick learns about whether an erasure job (site or conversation) has
 * actually finished, as three states rather than a boolean - because "not yet done" and "cannot tell"
 * are different facts, and folding them together is exactly the failure this item names in its own
 * Scope: "the console must not claim it is done before it is."
 *
 * - `"pending"` - the resource this check reads still answers normally. The `Ago.Chat.Worker` job
 *   `16-02` runs the deletion as has not reached it yet.
 * - `"erased"` - the server gave the one signal this console is willing to treat as real completion.
 *   For a conversation, that is a `404` from the single-conversation fetch. For the operator's own
 *   row (the account-deletion poll, `operatorsApi.ts`), the contract handed to both this console and
 *   the parallel `ago-chat` worker names either a `404`, or a `403`/`401` whose problem-details `type`
 *   contains `"NotFound"` case-insensitively - the exact backend shape was not settled when this side
 *   was built (parallel execution), so `checkOperatorErasure` accepts either.
 * - `"unknown"` - anything else: a network failure, a generic `401`/`403` a merely-expired token or an
 *   unrelated permission refusal would also produce, a `500`, an unparseable body. **Never** treated
 *   as `"erased"` - `usePollUntilErased` simply ticks again on this outcome. Reading it as completion
 *   would be the console claiming a deletion succeeded because the wifi dropped, which is the specific
 *   false-completion bug `16-02`'s backlog item exists to prevent.
 */
export type ErasureCheckOutcome = "pending" | "erased" | "unknown";
