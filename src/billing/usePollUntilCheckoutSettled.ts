import { useEffect, useLayoutEffect, useRef } from "react";
import type { CheckoutConfirmationOutcome } from "./checkoutConfirmation.js";

/**
 * `13-04`: polls `check` on a fixed interval while `active` is true, and calls `onSettled` exactly
 * once - the first time `check` resolves `"confirmed"` or `"failed"` - then stops polling.
 *
 * A close sibling of `erasure/usePollUntilErased.ts`, not a reuse of it: that hook is typed to
 * `ErasureCheckOutcome`, a different three-state union answering a different question ("is this
 * resource gone"), and forcing this screen's four-state `CheckoutConfirmationOutcome` through it would
 * mean either widening `usePollUntilErased`'s own type for a caller `16-02` never anticipated, or
 * silently treating `"failed"` as some flavour of `"erased"` - a naming lie either way. The mechanics
 * below - the ref indirection so a caller does not have to keep `check`/`onSettled` referentially
 * stable, the immediate tick before the first interval fire, the `done` flag guarding against a
 * completed poll re-firing its callback - are copied deliberately: `usePollUntilErased`'s own doc
 * comment already justifies every one of these choices, and they apply here unchanged.
 */
export function usePollUntilCheckoutSettled(
  active: boolean,
  intervalMs: number,
  check: () => Promise<CheckoutConfirmationOutcome>,
  onSettled: (outcome: "confirmed" | "failed") => void,
): void {
  // `23-96`: written from a `useLayoutEffect`, not during render - `react-hooks/refs` (v7) forbids
  // writing `.current` while rendering (react.dev/reference/eslint-plugin-react-hooks/lints/refs),
  // because a render can be thrown away or run twice before it commits. `useLayoutEffect` (not
  // `useEffect`) so the ref is never stale for the *first* `tick()` below, which fires synchronously
  // from this same effect on mount - a passive effect does not guarantee it runs before that one does.
  const checkRef = useRef(check);
  useLayoutEffect(() => {
    checkRef.current = check;
  });
  const onSettledRef = useRef(onSettled);
  useLayoutEffect(() => {
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let done = false;
    const tick = () => {
      void checkRef.current().then((outcome) => {
        if (cancelled || done || (outcome !== "confirmed" && outcome !== "failed")) {
          return;
        }
        done = true;
        clearInterval(interval);
        onSettledRef.current(outcome);
      });
    };

    tick();
    const interval = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, intervalMs]);
}
