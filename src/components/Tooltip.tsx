import { useId, useState, type ReactNode } from "react";
import { useStrings } from "../i18n/StringsContext.js";

export interface TooltipProps {
  /** The explanatory text this tooltip reveals - never rewritten by this component, only moved off
   * the page and behind a trigger. Plain strings so far; `ReactNode` because a caller composing one
   * from a prefix/suffix pair (`ConversationList`'s own `queueWaitingNotePrefix`/`Suffix`) still owns
   * how the pieces join, this component does not know about interpolation. */
  content: ReactNode;
}

/**
 * `25-54`: the twelfth component - `adr/0030`'s closed set of eleven (Button, Input, Textarea,
 * Select, Field, Table, Badge, Panel, Alert, Spinner/Skeleton, Dialog) named its own trigger for
 * reopening in its "Alternatives considered" section: *"the first real combobox, menu, or
 * tooltip is the trigger to revisit this ADR."* This is that tooltip. Unlike the eleven, which
 * `11-05` closed the list at, this one earns a shared component rather than one screen's own local
 * markup, because it is not one screen's concern - this item alone gives it seven call sites across
 * three panels (`ConversationList` twice, `ConversationPage`, `Thread`, `ConversationNotesPanel`,
 * `ConversationOutcomePanel`, `VisitorPanel`), and a hover/focus-triggered popover with real keyboard
 * and touch behaviour is exactly the kind of interaction a copy-pasted `<span>` per call site would
 * drift on - the failure mode `adr/0030`'s Alternatives section names for a component nobody owns.
 *
 * **Still hand-rolled, not a headless-library import, and for the same reason the 2026-09-12
 * dropdown-menu amendment gives** (`adr/0030`'s own text): the hard parts a library buys - focus
 * trapping, a roving-tabindex protocol, submenu/typeahead behaviour - are not what a tooltip needs.
 * This one is not modal, holds no focus hostage, and has exactly one interactive element. What is
 * genuinely worth getting right - a real accessible name, a programmatic description, a visible focus
 * ring, and no dead end for a touch user with no hover at all - is about thirty lines below, not a
 * dependency.
 *
 * **Native `title` was the other alternative, and it loses to this on the same page-owner's-request
 * it was raised for**: `title` never fires on keyboard focus at all (only ever on hover, plus a few
 * browsers' own inconsistent long-press), cannot be styled to the console's own tokens, and cannot be
 * measured for contrast the way `tokens.css` measures every other pair - the browser paints it
 * however the OS theme says to. A tenant-facing operator console that already gates on WCAG 1.4.11
 * and 2.5.8 elsewhere (`tokens.css`, `index.css`) is exactly the case `title` is the wrong tool for.
 *
 * **The glyph is a plain "?" character, not an icon.** `adr/0030`'s own icon amendments (a padlock,
 * then three Material Symbols paths) are each scoped narrowly to one meaning and explicitly not a
 * general icon system this console can reach for - see that ADR's 2026-09-05 and 2026-09-12
 * amendments, both stating the opposite ("did not find it licensed by this paragraph") for anyone
 * tempted to reuse them. A text glyph costs nothing, needs no path data retrieved from anywhere, and
 * matches this console's own founding argument for closing the component set: "text is unambiguous
 * and translatable" (`docs/design/gaps.md` pile 3 item 3, restated in every one of those amendments).
 *
 * **Trigger and reveal, in order:**
 * - **Hover** (`onMouseEnter`/`onMouseLeave`) and **keyboard focus** (`onFocus`/`onBlur`) both show
 *   and hide the bubble - the item's own "hover/focus-triggered" requirement, literally.
 * - **`onClick` calls `.focus()` on the trigger itself**, nothing else. This is not a third trigger
 *   mode - it exists because a real `<button>` is not reliably given document focus by a tap on every
 *   touch browser (iOS Safari's long-standing quirk), which would leave a touch operator with no way
 *   to ever open this tooltip at all under a pure hover/focus scheme. An explicit `.focus()` call
 *   is not subject to that quirk - it flows through the same `onFocus` handler every keyboard user
 *   already uses, so the reveal logic has exactly one source of truth rather than a parallel `open`
 *   toggle that could disagree with it.
 * - **Escape closes the bubble without moving focus off the trigger** - it would otherwise stay open
 *   until a keyboard user tabs away, which is the one interaction real tooltip guidance (WAI-ARIA's
 *   own tooltip pattern) calls out as worth fixing; that same pattern is explicit that dismissal
 *   should not also move focus, so this only clears `open`, never calls `.blur()` - a keyboard user
 *   who presses Escape is exactly where they were before, free to keep tabbing forward.
 * - `role="tooltip"` plus `aria-describedby` on the trigger is the accessible link between the two -
 *   a screen reader announces the description once the trigger receives focus, not only "button".
 *
 * **What this does not attempt**: viewport-collision detection (the bubble always opens below,
 * left-aligned to the trigger) and multi-line reflow beyond a fixed `max-width`. Every call site this
 * item adds lives inside the three-panel workspace's own bounded columns, never near a viewport edge
 * in the console's supported widths - a positioning library would be solving a problem this
 * application does not have yet, the same shape `adr/0030`'s own "Alternatives considered" rejects a
 * dependency for elsewhere. The trigger to revisit this is a real report of a clipped bubble, not a
 * hunch.
 */
export function Tooltip({ content }: TooltipProps) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const bubbleId = useId();

  return (
    <span className="ago-tooltip">
      <button
        type="button"
        className="ago-tooltip__trigger"
        aria-label={strings.tooltipTriggerLabel}
        aria-describedby={bubbleId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => event.currentTarget.focus()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        ?
      </button>
      <span className="ago-tooltip__bubble" id={bubbleId} role="tooltip" hidden={!open}>
        {content}
      </span>
    </span>
  );
}
