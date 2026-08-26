/**
 * `18-05`: what the keyboard does in the workspace, as data rather than as a `switch` inside an
 * event handler.
 *
 * Two things follow from keeping the catalogue separate from the listener, and both are the point
 * rather than tidiness:
 *
 * 1. **The help dialog is generated from the same list the handler dispatches on**, so a shortcut
 *    cannot exist without being discoverable. The item asks for "listed somewhere in the interface,
 *    not only in a file"; a hand-maintained second list in a dialog is exactly how that promise rots.
 * 2. **The matching is a pure function of a key event's shape**, so "Escape does nothing while the
 *    composer has focus" is testable without a workspace, a router or a hub connection.
 *
 * ## Why plain letters, and why that is safe here
 *
 * `j`/`k`/`c` are unmodified letters, which is the convention every mail client an operator has used
 * already teaches. They are only safe because of `isTypingTarget` below, and that guard is therefore
 * not a nicety - it is the thing that stops an operator typing their way out of the conversation
 * they are answering. `11-06` shipped Enter/Shift+Enter/Escape *inside* the composer; this item adds
 * keys that deliberately only exist *outside* it.
 *
 * ## Why `Escape` closes the thread rather than closing the conversation
 *
 * The item's scope names "close" in its list of shortcuts. **There are two readings and only one of
 * them is buildable here.** The console has no close-the-conversation action at all: `6-02` shipped
 * `POST /api/v1/conversations/{id}/close` and `Permission.ConversationClose` in Stage 6, and nothing
 * in this repository has ever called either. A shortcut for a button that does not exist is not a
 * shortcut - it is a new product action wearing a keybinding, with a confirmation, a permission gate
 * and `6-08`'s concurrency-conflict path attached, none of which an item about keyboard shortcuts
 * should be inventing.
 *
 * So `Escape` means **close the open thread** - go back to `/`, the workspace's own
 * no-conversation-selected state - which is what "whatever the workspace's own layout makes obvious"
 * points at and costs nothing. The missing action is reported as a gap rather than smuggled in here.
 */

export type ShortcutId = "nextConversation" | "previousConversation" | "focusComposer" | "closeThread" | "showHelp";

export interface Shortcut {
  readonly id: ShortcutId;
  /** What a person reads in the help dialog. Not derived from `key`: `?` is `Shift+/` on most
   * layouts and rendering it as such would be true and useless. */
  readonly label: string;
  readonly description: string;
}

/** The whole catalogue. Ordered as the help dialog lists it: movement, then action, then help. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: "nextConversation", label: "J", description: "Move to the next conversation assigned to you" },
  { id: "previousConversation", label: "K", description: "Move to the previous one" },
  { id: "focusComposer", label: "C", description: "Put the cursor in the composer" },
  { id: "closeThread", label: "Esc", description: "Close the open thread and go back to the list" },
  { id: "showHelp", label: "?", description: "Show this list" },
];

/** The shape `matchShortcut` needs. A structural type rather than `KeyboardEvent`, so a test can
 * describe a keypress without constructing a DOM event and so the function has no DOM dependency at
 * all. */
export interface KeyStroke {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}

/**
 * Which shortcut, if any, a keypress is.
 *
 * <b>Any modifier means "not one of ours".</b> `Ctrl+C` is copy, `Cmd+K` is the browser's own search
 * on some platforms, `Alt+J` is a system binding somewhere. Claiming a letter is only defensible
 * while it is the bare letter; the moment a modifier is held, the keypress belongs to the browser or
 * the operating system and this must keep its hands off it. `Shift` is the exception, and only for
 * `?`, which cannot be typed without it.
 */
export function matchShortcut(stroke: KeyStroke): ShortcutId | null {
  if (stroke.ctrlKey === true || stroke.metaKey === true || stroke.altKey === true) {
    return null;
  }

  if (stroke.key === "Escape") {
    return "closeThread";
  }

  if (stroke.key === "?") {
    return "showHelp";
  }

  if (stroke.shiftKey === true) {
    return null;
  }

  switch (stroke.key) {
    case "j":
      return "nextConversation";
    case "k":
      return "previousConversation";
    case "c":
      return "focusComposer";
    default:
      return null;
  }
}

/**
 * Whether the keypress landed somewhere a person is typing, in which case none of the above applies.
 *
 * <b>This is the guard the whole scheme rests on.</b> Without it, an operator writing "just checking"
 * to a visitor would move conversation twice and close the thread before finishing the word. It is
 * deliberately broader than "the composer": any `input`, any `textarea`, any `select`, anything
 * `contenteditable`, and anything inside an open `<dialog>` - the last because the help dialog's own
 * close button must respond to Escape as a dialog, not as a shortcut that fires behind it.
 *
 * Checked against the event's target rather than `document.activeElement`, because the two disagree
 * exactly once and it is the case that matters: a key event dispatched at an element in a test, or
 * re-targeted through a shadow boundary, has a target and may have no focus at all.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("dialog[open]") !== null) {
    return true;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }

  return target.closest("[contenteditable]:not([contenteditable='false'])") !== null;
}

/**
 * Where `J`/`K` land: the next or previous conversation id, given the list as drawn and the one
 * currently open.
 *
 * <b>Both ends stop rather than wrap.</b> A wrapping list means an operator holding `J` cycles for
 * ever and cannot tell they have reached the end; stopping is a fact they can feel. Nothing selected
 * yet means `J` opens the first and `K` opens the last, so a single keypress always does something
 * from a cold start.
 *
 * Returns `null` when there is nowhere to go, which the caller turns into "do nothing" rather than
 * into an error - a shortcut that beeps at the end of a list is a shortcut people stop using.
 */
export function conversationAfter(
  order: readonly string[],
  openConversationId: string | null,
  direction: 1 | -1,
): string | null {
  if (order.length === 0) {
    return null;
  }

  if (openConversationId === null) {
    return direction === 1 ? order[0] : order[order.length - 1];
  }

  const index = order.indexOf(openConversationId);
  if (index === -1) {
    // The open conversation is not in this list - reached by direct URL, or no longer assigned. The
    // list is still navigable, so start from its nearest end rather than refusing to move.
    return direction === 1 ? order[0] : order[order.length - 1];
  }

  const next = index + direction;
  return next < 0 || next >= order.length ? null : order[next];
}
