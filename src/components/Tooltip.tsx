import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStrings } from "../i18n/StringsContext.js";

export interface TooltipProps {
  /** The explanatory text this tooltip reveals - never rewritten by this component, only moved off
   * the page and behind a trigger. Plain strings so far; `ReactNode` because a caller composing one
   * from a prefix/suffix pair (`ConversationList`'s own `queueWaitingNotePrefix`/`Suffix`) still owns
   * how the pieces join, this component does not know about interpolation. */
  content: ReactNode;
}

/** A floor under a clamped `max-width` - `25-111` - so a pathologically narrow container (nothing
 * this console actually ships, but not a case worth trusting arithmetic alone for) still gets a
 * bubble wide enough to hold a word or two rather than one this thin on either side of. Not a design
 * value from `tokens.css` (`adr/0030`'s "a literal size anywhere else in `src/` is a defect" is about
 * this file's own layout geometry, the same exemption `workspace.css`'s grid track widths already
 * claim for the identical reason), and not `components.css`'s own 18rem either - this is a last-resort
 * minimum, not this component's normal size. */
const MIN_BUBBLE_WIDTH_PX = 96;

/** `25-111`/`25-123`: the nearest ancestor, walking up from `element`, whose own `overflow-x`/
 * `overflow-y` is not `visible` - the box that would actually clip an absolutely-positioned
 * descendant, which is what a left-aligned or top-aligned tooltip bubble is. Falls back to the
 * viewport when nothing up the tree clips at all, which folds the "does not attempt viewport-collision
 * detection" gap this component's own doc comment used to name into the same measurement rather than a
 * second one - not a deliberate second feature, just what is left when the walk reaches `<html>` with
 * nothing to report.
 *
 * `25-123`: one walk, four numbers - `top`/`bottom` ride along with the same ancestor `left`/`right`
 * already walks to, because it is the same box on both axes: whatever element clips this tooltip
 * horizontally is the identical element that clips it vertically, `overflow-x`/`overflow-y` are
 * checked together in the one condition above precisely so a second, vertical-only walk is never
 * needed. */
function findClippingRect(element: HTMLElement): { left: number; right: number; top: number; bottom: number } {
  let node = element.parentElement;
  while (node !== null) {
    const style = window.getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }
    node = node.parentElement;
  }

  return { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: document.documentElement.clientHeight };
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
 * **`25-111`: the bubble no longer always opens left-aligned.** The paragraph above used to end here
 * with "the trigger to revisit this is a real report of a clipped bubble, not a hunch" - `VisitorPanel`'s
 * own 14rem aside column is that report: narrower than the bubble's own 18rem `max-width`
 * (`components.css`), so a left-aligned bubble ran off the column's right edge and was clipped by
 * `.ago-shell__main--fixed`'s `overflow: hidden` (`shell.css`), not by the viewport - the distinction
 * the original paragraph did not draw. The fix stays inside this component's own hand-rolled shape,
 * not a positioning library: on open, this measures the bubble's natural width against the space
 * available on both sides of the trigger, inside the nearest ancestor whose own overflow is not
 * `visible` (walking up from the trigger; the viewport itself if none is found, which is a free side
 * effect of the same measurement rather than a second code path for the viewport case the original
 * paragraph excluded). Left-aligned is still the default and is left completely alone - no inline style
 * at all - whenever it already fits, which is every call site but this one; only when it would not does
 * the bubble flip to right-aligned, and only when even the wider side cannot hold the unclamped bubble
 * does its `max-width` shrink to what is actually available, which is the "multi-line reflow beyond a
 * fixed max-width" the original paragraph also named - still true, still not attempted as a separate
 * feature, just reached slightly more often now that `max-width` itself can shrink.
 *
 * **The measurement is synchronous, in the same `useLayoutEffect` that removes `hidden` - and an
 * apparent race around exactly that was chased and ruled out, worth recording so nobody chases it
 * again.** An independent rerun of the real gate serially (`playwright test -g "every tooltip
 * trigger" --repeat-each=8 --workers=1`) failed most of the time, at a different trigger with a
 * different overflow amount each run, after a single `npm run ux-gate` pass had been green. Traced
 * with `console.log`s inside this file (removed once understood) plus an isolated `page.setContent`
 * reproduction of the identical `display:none` → visible → `style.maxWidth = …` sequence outside
 * React entirely: plain DOM manipulation never reproduced it, however many times it was repeated, which
 * ruled out a genuine Chromium quirk with a freshly-unhidden box. Deferring the same measurement by one
 * `requestAnimationFrame` was tried next and made the *test* fail consistently instead of
 * intermittently - the opposite of a fix - which is what actually found the real cause: the bubble
 * losing its `hidden` attribute and `setBubbleStyle` landing in the DOM are two separate React commits,
 * and the test's own `expect(bubble).toBeVisible()` only ever waits for the first one. A read taken
 * immediately afterward can land in the gap between "unhidden" and "correctly positioned"; a `page.
 * waitForTimeout(50)` inserted at that same point (proof, not a guess) found the second commit long
 * since settled, every single time. The fix that belonged here was in the test
 * (`ux-gate/tooltipPositioning.spec.ts`'s own `expect.poll`, not a single read), not in this component -
 * this measurement was correct all along, and deferring it would only have traded a real one-frame
 * flash of the unclamped bubble for a test bug the deferral itself could never fix.
 *
 * **`25-123`: the same shape, mirrored onto the vertical axis.** `25-111` above only ever measured
 * `left`/`right` - `components.css`'s own `top: calc(100% + var(--ago-space-2))` stayed unconditional,
 * so a bubble had no way to avoid clipping against the *bottom* of a clipping ancestor either, and
 * `Thread`'s own delivery-scope tooltip (pinned to the very top of the scrollable `.ago-thread-scroll`
 * it opens inside) is exactly the trigger a short conversation clips this way - reported live, with a
 * screenshot, not a hunch, the identical bar `25-111`'s own trigger had to clear. `findClippingRect`
 * above now returns `top`/`bottom` off the same walk, no second one; `spaceBelow`/`spaceAbove` mirror
 * `spaceRight`/`spaceLeft` exactly; and when the bubble does not fit below, it flips to open **above**
 * the trigger (`top: "auto", bottom: "calc(100% + var(--ago-space-2))"`, the CSS default's own gap
 * value, quoted back as a `calc()` string inside the inline `style` object - confirmed against a real
 * rendered bubble, not assumed, the same discipline `25-111`'s own width arithmetic was held to).
 * Deliberately asymmetric with the block above in one place: there is no vertical counterpart to the
 * `maxWidth` shrink-as-last-resort, and the code at that point says why, rather than leaving a reader
 * to wonder whether it was missed. Both axes write into the same `nextStyle` object - never a second
 * piece of state - for the reason given where it is built: a bubble can need an aligned side and a
 * flipped-open direction at once, and the measurement above is the one place, inside the one
 * `useLayoutEffect`, this component's own doc comment already insists it has to happen synchronously.
 */
export function Tooltip({ content }: TooltipProps) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // `25-111`: measured only while open - the bubble is `display: none` (the `hidden` attribute's own
  // UA default) whenever it is not, so measuring earlier would read a zero-size box.
  //
  // `25-132`: the positioning override is applied **imperatively, directly on the DOM node**, never
  // through a React `style` prop backed by state - found live, reproduced deterministically (every
  // *other* open, forever, proven with a real repeated-hover script before this was touched). The
  // original shape kept a `bubbleStyle` state variable and rendered `style={open ? bubbleStyle :
  // undefined}`; state was never reset on close, so a bubble reopening rendered *with the previous
  // cycle's own override already applied*, in the same commit this effect's own measurement reads
  // from - a stale `max-width` read back as "already narrow enough", clearing the override outright,
  // which the *next* cycle then read as a clean slate and correctly reintroduced, which the cycle
  // after *that* then read as stale and cleared again - alternating forever, exactly matching the
  // live report.
  //
  // The first fix attempt reset the bubble's own inline style with a *raw* DOM write
  // (`bubble.style.left = ""`, etc.) at the top of this effect, before measuring - which fixed the
  // *measurement* (every cycle now read the bubble's true, unconstrained size) but broke the
  // *application*: React's own DOM renderer tracks, per element, the style object it last rendered,
  // and diffs a new `style` prop against *that memory* to decide which CSS properties to touch - it
  // has no way to know a raw `element.style.x = ...` write happened outside its own reconciliation.
  // Once this effect's own fresh computation produced a style with the *same field values* as what
  // React remembered already being applied (the identical shrink was needed every cycle, since
  // nothing about the layout ever actually changes between cycles here), React saw no value-level
  // change from its own point of view and skipped writing to the DOM at all - leaving the bubble
  // stuck in the *raw-reset, unstyled* state forever, never once reapplying the real override. Proven
  // with the same repeated-hover script: no more alternation, but now permanently wrong instead.
  //
  // Applying the style with the same `element.style.<prop> = value` calls this effect already needs
  // for the reset - never through a React-managed `style` prop at all - removes the whole class of
  // bug: there is only ever one writer of this element's `style` attribute (this effect), so nothing
  // can develop a belief about it that the DOM itself disagrees with.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (bubble === null) {
      return;
    }

    // Cleared unconditionally, on every run of this effect - including the one that fires when
    // `open` becomes `false`, so a closed bubble never carries a stale override into whatever
    // measurement its *next* open cycle takes. Cheap even when it changes nothing (the bubble is
    // `display: none` while closed, so these writes never cause a visible reflow).
    bubble.style.left = "";
    bubble.style.right = "";
    bubble.style.top = "";
    bubble.style.bottom = "";
    bubble.style.maxWidth = "";

    const wrapper = wrapperRef.current;
    if (!open || wrapper === null) {
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const clipRect = findClippingRect(wrapper);
    const bubbleRect = bubble.getBoundingClientRect();
    const bubbleWidth = bubbleRect.width;
    const bubbleHeight = bubbleRect.height;

    // `--ago-space-2` (8px, `tokens.css`) kept as a plain number rather than read from the token:
    // this is a safety gutter against the clip edge itself, not a gap between two rendered elements
    // the token's own meaning describes.
    const gutter = 8;
    const spaceRight = wrapperRect.left <= clipRect.right ? clipRect.right - wrapperRect.left - gutter : 0;
    const spaceLeft = wrapperRect.right >= clipRect.left ? wrapperRect.right - clipRect.left - gutter : 0;
    // `25-123`: the vertical mirror of `spaceRight`/`spaceLeft` above - room below/above the trigger,
    // inside the same `clipRect` the horizontal pair already measures, guarded the same way (only
    // counted when the wrapper's own edge is still on the near side of the clip edge, `0` otherwise).
    const spaceBelow = wrapperRect.bottom <= clipRect.bottom ? clipRect.bottom - wrapperRect.bottom - gutter : 0;
    const spaceAbove = wrapperRect.top >= clipRect.top ? wrapperRect.top - clipRect.top - gutter : 0;

    // Fits left-aligned and opens downward, exactly as the default CSS already renders it, at every
    // call site but `VisitorPanel` (horizontally) today - nothing written below, so nothing here can
    // be told apart from the pre-`25-111` component at any of those sites.
    if (bubbleWidth > spaceRight) {
      const alignRight = spaceLeft > spaceRight;
      const available = alignRight ? spaceLeft : spaceRight;
      if (alignRight) {
        bubble.style.left = "auto";
        bubble.style.right = "0";
      }
      if (bubbleWidth > available) {
        bubble.style.maxWidth = `${Math.max(available, MIN_BUBBLE_WIDTH_PX)}px`;
      }
    }

    // `25-123`: the vertical mirror of the block above, with one deliberate asymmetry - no
    // `maxWidth`-shaped shrink-as-last-resort here. Shrinking a bubble's *width* lets its text reflow
    // into more lines, so a narrower box still shows the same content; shrinking its *height* does not
    // reflow anything, it only clips whatever no longer fits or forces the bubble to grow its own
    // scrollbar, and both are worse than simply leaving the bubble on whichever side already has more
    // room. So when neither side fully fits, this picks the better one and stops, rather than also
    // trying to squeeze the bubble into it.
    if (bubbleHeight > spaceBelow) {
      const alignAbove = spaceAbove > spaceBelow;
      if (alignAbove) {
        bubble.style.top = "auto";
        bubble.style.bottom = "calc(100% + var(--ago-space-2))";
      }
    }
  }, [open, content]);

  return (
    <span className="ago-tooltip" ref={wrapperRef}>
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
      <span className="ago-tooltip__bubble" id={bubbleId} role="tooltip" hidden={!open} ref={bubbleRef}>
        {content}
      </span>
    </span>
  );
}
