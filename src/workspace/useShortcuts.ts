import { useEffect, useRef } from "react";
import { isTypingTarget, matchShortcut, type ShortcutId } from "./shortcuts.js";

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

/**
 * `18-05`: binds `shortcuts.ts`'s catalogue to the document, and does nothing else.
 *
 * ## On `document`, not on the workspace element
 *
 * A shortcut has to work when focus is on the page body, which is where it sits after a click on
 * empty space and immediately after a route change - neither of which is inside any element this
 * component could attach to. `keydown` on `document` in the capture-less bubble phase is the
 * ordinary way to do it, and the guard below is what keeps it from being rude about it.
 *
 * ## The guard runs before the match, deliberately
 *
 * `isTypingTarget` is checked first so that a key pressed in a text field is never even looked up.
 * Written the other way round - match, then check - it would be one early `return` away from a
 * regression in which `Escape` in the composer both clears the draft *and* closes the thread, which
 * is precisely the "operator types their way into closing a conversation" failure the item names.
 *
 * ## `preventDefault` only when something happened
 *
 * A key with no handler is left entirely alone: `?` with no help dialog wired must still be typeable
 * into whatever the browser would have done with it. Only a shortcut that actually ran claims its
 * keypress.
 *
 * The handlers go through a ref so the listener is installed once and never re-installed. That is
 * not a micro-optimisation: re-installing on every render of a component whose parent re-renders on
 * a ten-second timer would add and remove a document listener several times a minute, and any
 * keypress landing between the two would be lost.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return;
      }

      const id = matchShortcut(event);
      if (id === null) {
        return;
      }

      const handler = latest.current[id];
      if (handler === undefined) {
        return;
      }

      event.preventDefault();
      handler();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // Installed once for the life of the component, and there is deliberately no `enabled` flag to
    // turn it off: the only thing that would want one is "a dialog is open", and `isTypingTarget`
    // already answers that from the event itself. A parameter with no caller is a guess about a
    // second one.
  }, []);
}
