/**
 * `25-111`/`25-123`: measures whether an open `Tooltip` bubble (`src/components/Tooltip.tsx`) is
 * rendered fully inside the nearest ancestor box that would actually clip it, given the trigger
 * `<button>` that owns it - on both axes.
 *
 * `findClippingRect` here is a deliberate duplicate of `Tooltip.tsx`'s own same-named function, not an
 * import of it - this assertion exists to prove what the browser actually painted, independently of
 * whether the component's own arithmetic agrees with itself. `ux-gate/lib/minSize.ts`'s own doc
 * comment already states why every helper a measurement function needs must be declared **inside**
 * its body: `page.evaluate`/`locator.evaluate` serialise only the passed function's own source text
 * into the browser, never a module-level import or a sibling declaration.
 *
 * Takes the trigger element itself (`locator.evaluate`'s own first argument), not a bubble id - a
 * `Tooltip`'s bubble id comes from React's `useId()`, which produces values like `":r0:"` that are not
 * valid unescaped CSS identifiers, so a caller cannot safely build a `page.locator("#" + id)` from one
 * at all. The bubble is `role="tooltip"`, the trigger's own next sibling inside `Tooltip.tsx`'s
 * `<span className="ago-tooltip">` wrapper - reached by DOM traversal instead.
 *
 * `25-123`: `overflowTopPx`/`overflowBottomPx` join the horizontal pair rather than folding
 * immediately into one number, because a caller proving the vertical fix (`tooltipPositioning.spec.ts`'s
 * own third test) needs to tell "no longer clips the bottom edge, now clips the top instead" apart from
 * "no longer clips at all" - a combined sum cannot distinguish those, and this item's own fix
 * deliberately has no shrink-to-fit fallback on this axis (`Tooltip.tsx`'s own doc comment), so a
 * trigger inside a scrollable ancestor shorter than the bubble on both sides can still land on this
 * function's "picked the better side, not a fully clear one" outcome. `overflowPx` still sums all four
 * directions, not just the horizontal two - the existing "every tooltip trigger on this screen" test
 * asserts `overflowPx` alone, and folding the vertical pair in here is what lets that same assertion
 * catch a vertical regression too, without that test having to know these fields exist.
 */
export function measureTooltipTriggerOverflow(trigger: HTMLElement): {
  found: boolean;
  overflowLeftPx: number;
  overflowRightPx: number;
  overflowTopPx: number;
  overflowBottomPx: number;
  overflowPx: number;
  bubbleRect: { left: number; right: number; top: number; bottom: number } | null;
  clipRect: { left: number; right: number; top: number; bottom: number } | null;
} {
  function findClippingRect(element: Element): { left: number; right: number; top: number; bottom: number } {
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

  const bubble = trigger.parentElement?.querySelector('[role="tooltip"]');
  if (bubble === null || bubble === undefined) {
    return {
      found: false,
      overflowLeftPx: 0,
      overflowRightPx: 0,
      overflowTopPx: 0,
      overflowBottomPx: 0,
      overflowPx: 0,
      bubbleRect: null,
      clipRect: null,
    };
  }

  const bubbleRect = bubble.getBoundingClientRect();
  const clipRect = findClippingRect(bubble);
  const overflowRightPx = Math.max(0, bubbleRect.right - clipRect.right);
  const overflowLeftPx = Math.max(0, clipRect.left - bubbleRect.left);
  const overflowBottomPx = Math.max(0, bubbleRect.bottom - clipRect.bottom);
  const overflowTopPx = Math.max(0, clipRect.top - bubbleRect.top);

  return {
    found: true,
    overflowLeftPx,
    overflowRightPx,
    overflowTopPx,
    overflowBottomPx,
    overflowPx: overflowLeftPx + overflowRightPx + overflowTopPx + overflowBottomPx,
    bubbleRect: { left: bubbleRect.left, right: bubbleRect.right, top: bubbleRect.top, bottom: bubbleRect.bottom },
    clipRect,
  };
}
