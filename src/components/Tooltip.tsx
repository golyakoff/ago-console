import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

/** `25-111`: the nearest ancestor, walking up from `element`, whose own `overflow-x`/`overflow-y` is
 * not `visible` - the box that would actually clip an absolutely-positioned descendant, which is what
 * a left-aligned tooltip bubble is. Falls back to the viewport when nothing up the tree clips at all,
 * which folds the "does not attempt viewport-collision detection" gap this component's own doc comment
 * used to name into the same measurement rather than a second one - not a deliberate second feature,
 * just what is left when the walk reaches `<html>` with nothing to report. */
function findClippingRect(element: HTMLElement): { left: number; right: number } {
  let node = element.parentElement;
  while (node !== null) {
    const style = window.getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }
    node = node.parentElement;
  }

  return { left: 0, right: document.documentElement.clientWidth };
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
 */
export function Tooltip({ content }: TooltipProps) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties | undefined>(undefined);

  // `25-111`: measured only while open - the bubble is `display: none` (the `hidden` attribute's own
  // UA default) whenever it is not, so measuring earlier would read a zero-size box. Nothing resets
  // `bubbleStyle` on close: the render below masks it with `open ? bubbleStyle : undefined` instead
  // (the identical "mask at render time rather than write a reset into the effect" shape
  // `useSiteSuspensionStatus.ts`'s own doc comment already uses for `react-hooks/set-state-in-effect`),
  // so a bubble that reopens elsewhere always gets this same synchronous recomputation, regardless of
  // what a *previous* open cycle, anywhere, last left this state holding. This function's own doc
  // comment above has the full account of why this stayed synchronous rather than deferred - a
  // same-frame measurement was suspected, then ruled out, as the cause of an intermittent failure this
  // item's own review found.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const wrapper = wrapperRef.current;
    const bubble = bubbleRef.current;
    if (wrapper === null || bubble === null) {
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const clipRect = findClippingRect(wrapper);
    const bubbleWidth = bubble.getBoundingClientRect().width;

    // `--ago-space-2` (8px, `tokens.css`) kept as a plain number rather than read from the token:
    // this is a safety gutter against the clip edge itself, not a gap between two rendered elements
    // the token's own meaning describes.
    const gutter = 8;
    const spaceRight = wrapperRect.left <= clipRect.right ? clipRect.right - wrapperRect.left - gutter : 0;
    const spaceLeft = wrapperRect.right >= clipRect.left ? wrapperRect.right - clipRect.left - gutter : 0;

    // Fits left-aligned, exactly as the default CSS already renders it, at every call site but
    // `VisitorPanel` today - `nextStyle` stays `undefined`, so nothing here can be told apart from
    // the pre-`25-111` component at any of those sites.
    let nextStyle: CSSProperties | undefined;
    if (bubbleWidth > spaceRight) {
      const alignRight = spaceLeft > spaceRight;
      const available = alignRight ? spaceLeft : spaceRight;
      nextStyle = alignRight ? { left: "auto", right: 0 } : {};
      if (bubbleWidth > available) {
        nextStyle.maxWidth = `${Math.max(available, MIN_BUBBLE_WIDTH_PX)}px`;
      }
    }

    setBubbleStyle(nextStyle);
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
      <span
        className="ago-tooltip__bubble"
        id={bubbleId}
        role="tooltip"
        hidden={!open}
        ref={bubbleRef}
        style={open ? bubbleStyle : undefined}
      >
        {content}
      </span>
    </span>
  );
}
