import { useEffect, useRef } from "react";
import type { ErasureCheckOutcome } from "./erasureCheck.js";

/**
 * `16-02`: polls `check` on a fixed interval while `active` is true, and calls `onErased` exactly
 * once - the first time `check` resolves `"erased"` - then stops polling.
 *
 * <b>This is new ground for this console.</b> Every existing `setInterval` here before this item
 * (`AdminConversationsPage`'s list refresh, `ConversationPage`'s presence check, `WorkspaceLayout`'s
 * waiting-queue refresh) is a plain periodic re-fetch that redraws with whatever the server currently
 * says - none of them ask "is this *specific* operation actually finished". This hook is the first
 * "poll until a real async job completes" mechanism, because both erasure endpoints
 * (`sitesApi.ts#eraseSite`, `conversationsApi.ts#eraseConversation`) return `202 Accepted` before the
 * `Ago.Chat.Worker` job they start has touched anything (`16-02`'s own Scope: "these touch many rows
 * across several stores... they belong in Ago.Chat.Worker... not in a synchronous HTTP call").
 *
 * `check` never rejects by contract - `erasureCheck.ts`'s `ErasureCheckOutcome` folds a network error
 * or an unparseable response into `"unknown"` rather than a thrown error - so this hook needs no
 * `.catch`; a `"pending"`/`"unknown"` tick is simply not `"erased"` and the interval keeps running
 * either way. `"unknown"` deliberately never completes the poll - see `erasureCheck.ts` for why
 * treating it as `"erased"` would be exactly the false-completion bug this item exists to prevent.
 *
 * `check`/`onErased` are read through refs rather than named in the effect's own dependency array -
 * unlike every other polling effect in this codebase, where the polled function is a `useCallback`
 * the caller keeps stable specifically so its own effect can depend on it directly
 * (`AdminConversationsPage`'s `refresh` is the precedent). That discipline does not transfer well to a
 * *shared* hook: this one is called from `EraseConversationButton`, which `AdminConversationsPage`
 * instantiates fresh inside its own per-row `render()` on every list refresh, so a caller-memoised
 * closure is not something every future user of this hook can be relied on to provide. The ref
 * indirection buys "identity of `check`/`onErased` does not matter" at the cost of one extra internal
 * moving part most of this codebase's other timers do not need - stated here rather than left
 * implicit, since it is a deliberate deviation from the sibling pattern, not an oversight.
 */
export function usePollUntilErased(
  active: boolean,
  intervalMs: number,
  check: () => Promise<ErasureCheckOutcome>,
  onErased: () => void,
): void {
  const checkRef = useRef(check);
  checkRef.current = check;
  const onErasedRef = useRef(onErased);
  onErasedRef.current = onErased;

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    // Guards against firing `onErased` twice - without it, a `check` that keeps answering `"erased"`
    // on every subsequent tick (the ordinary case: the resource stays gone) would call `onErased`
    // again on every interval, not just the first. Set the moment completion is observed, and paired
    // with `clearInterval` in the same branch so the poll actually *stops*, not just stops telling the
    // caller - a completed poll left running would keep hitting the endpoint forever for no reason.
    let done = false;
    const tick = () => {
      void checkRef.current().then((outcome) => {
        if (cancelled || done || outcome !== "erased") {
          return;
        }
        done = true;
        clearInterval(interval);
        onErasedRef.current();
      });
    };

    // An immediate tick, not just the first interval fire - the same "check right away, then on the
    // interval" shape `ConversationPage`'s own presence poll already uses. Harmless even though the
    // very first call right after a fresh `202` will almost always still read `"pending"`: the job has
    // barely started, but there is nothing to lose by asking once immediately rather than waiting a
    // full `intervalMs` for the first answer.
    tick();
    // `tick`'s own closure reads `interval` inside a `.then()` callback that can only ever run after
    // this synchronous block finishes, by which point the `const` below has been assigned - the same
    // "declared after its first use, safe because the use is deferred" shape `ConversationPage`'s
    // `checkPresence`/`interval` pair already relies on.
    const interval = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // No `react-hooks/exhaustive-deps` suppression needed here: the effect body reads `checkRef`/
    // `onErasedRef` (stable ref objects), never `check`/`onErased` directly, so the lint rule already
    // agrees this dependency array is complete - the ref indirection above is what makes that true.
  }, [active, intervalMs]);
}
