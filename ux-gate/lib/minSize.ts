/**
 * `15-11`, assertion 2: "No interactive element rendered unusably small."
 *
 * ## The threshold: 24 CSS pixels, in both dimensions
 *
 * This is WCAG 2.2's own **2.5.8 Target Size (Minimum)** (AA) figure, not a number invented for this
 * gate - reached for rather than picked, because `CLAUDE.md` bans invented figures and a cited
 * standard is the honest alternative to "a guideline you didn't verify". It was checked against two
 * real measurements before being trusted, per `15-11`'s own brief:
 *
 * - **This repository's own smallest legitimate control.** `src/components/components.css`'s
 *   `.ago-btn--sm` sets `min-height: 2rem` (32px at the browser's un-overridden default root
 *   font-size, confirmed by grepping `tokens.css` for a `:root { font-size }` override - there is
 *   none). Every button/input/select in `adr/0030`'s eleven-component set is 32px or 40px tall
 *   (`.ago-btn--md`/`.ago-input`/`.ago-select` at `min-height: 2.5rem`). 24px sits *below* every one
 *   of them, which is what "accept the repo's real smallest control" requires - a threshold this
 *   button would fail is not usable as a gate, whatever standard it cites.
 * - **A deliberately-constructed one-character-wide input**, built in `fails-before.spec.ts` at
 *   `width: 6px` (roughly one monospace glyph) - `6 < 24`, so this threshold rejects it by a wide
 *   margin, not by a hair.
 *
 * `ago-widget`'s own composer (150×40, named in `15-11`'s own brief as the widget's measured number)
 * is a different repository's control and is not what grounds this repo's threshold - it is cited
 * here only to note that 24px clears it too, for whatever that is worth to a reader comparing the two
 * gates.
 *
 * ## The exemption: detecting the hiding pattern, not naming selectors
 *
 * A naive "every interactive element must be >= 24x24" immediately false-fails on a legitimately
 * tiny/hidden control - this codebase's own `input.ago-visually-hidden[type="file"]`
 * (`src/workspace/Composer.tsx`, styled via `src/design/base.css`'s `.ago-visually-hidden`: absolute
 * position, `width: 1px; height: 1px`, `clip-path: inset(50%)`) is exactly the "hidden native
 * `<input type="file">` driving a styled button" pattern `15-11`'s brief names as a real trap here.
 *
 * An element is exempt - excluded from the size check entirely, not scored against the threshold -
 * when it matches any of:
 *
 * - `aria-hidden="true"`
 * - computed `display: none` or `visibility: hidden` or `opacity: 0`
 * - a `clip-path`/`clip` that clips the element to nothing (the sr-only pattern above)
 * - taken out of normal flow (`position: fixed`/`absolute`/`sticky`) **and** positioned entirely
 *   outside the viewport - deliberately narrower than "currently outside the viewport" alone: a
 *   `position: static` element merely below the fold of a long, scrollable page is not hidden, it is
 *   one scroll away, and an early version of this check exempted it by mistake (found live against
 *   `queue-conversation`'s own long thread - see the code's own comment for the detail).
 * - near-zero box (`<= 2px` in both dimensions) **and** taken out of normal flow - the general shape
 *   of the sr-only/offscreen-input trick, detected by the pattern rather than by this repository's
 *   own class name, so a future component using the identical technique under a different name is
 *   still exempted correctly.
 * - a plain `<a>` still in normal inline flow (`display: inline`) - WCAG 2.5.8's own explicit
 *   exception, "the target is in a sentence or block of text". `WorkspaceLayout`'s mobile-only
 *   "← Conversations" back link is exactly this shape and is the case that surfaced the need for the
 *   exemption: an inline hyperlink sized by its own text, not a control laid out like a button.
 * - any ancestor computes `display: none` - not the element's own `display`, which does not inherit
 *   this property from an ancestor at all (the code's own comment on `hasHiddenAncestor` has the
 *   detail). Without this, a control inside a closed native `<dialog>` (`EraseConversationButton`'s
 *   "Cancel"/"Erase it", rendered unconditionally by `Dialog` and shown via `showModal()`) reports its
 *   own natural `display` value while genuinely being 0x0 and invisible, and was flagged as a false
 *   violation the first time this ran against `/admin`.
 *
 * Every element that survives that filter and is still visible (non-zero rendered box) is scored: a
 * width or height under the threshold is a violation, including a genuine `0×0` - a collapsed control
 * is not "hidden", it is broken, and this check must not read a layout bug as an exemption.
 */

export interface MinSizeViolation {
  selector: string;
  tag: string;
  width: number;
  height: number;
  text: string;
}

export interface MinSizeResult {
  thresholdPx: number;
  scanned: number;
  exempted: number;
  violations: MinSizeViolation[];
}

/**
 * `measureUndersizedInteractiveElements` is passed straight to Playwright's `page.evaluate`, which
 * serialises only *this function's own source text* into the browser - not this module, not any
 * top-level `const`/`function` declared beside it. Every helper it needs is therefore declared
 * **inside** its body (nested function declarations are part of the same source text and travel with
 * it); a module-level `INTERACTIVE_SELECTOR`/`describeSelector` here would compile and typecheck
 * fine and then throw `ReferenceError` the first time this actually ran in a page - found exactly
 * that way while first wiring this gate up.
 */
export function measureUndersizedInteractiveElements(thresholdPx: number): MinSizeResult {
  const INTERACTIVE_SELECTOR = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='combobox']",
    "[role='option']",
    "[role='checkbox']",
    "[role='switch']",
  ].join(", ");

  function describeSelector(el: Element): string {
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }

  // `display: none` does not inherit and does not cascade into a descendant's own *computed* style -
  // `getComputedStyle(button).display` still answers the button's own natural value (e.g.
  // `"inline-block"`) even when an ancestor is `display: none`, only the actual rendering (and so
  // `getBoundingClientRect()`, which correctly reports 0x0) is suppressed. Checking only `el`'s own
  // `display` therefore misses every control inside a closed native `<dialog>` - the UA stylesheet's
  // own `dialog:not([open]) { display: none }` - which is exactly the real case this surfaced against:
  // `EraseConversationButton`'s "Cancel"/"Erase it" buttons live inside a `Dialog` (`adr/0030`) that
  // renders its children unconditionally and toggles `open`/`showModal()`, so they are always in the
  // DOM and were showing up as 0x0 "violations" while the dialog was simply closed. `visibility`, by
  // contrast, *does* inherit, so the element's own computed `visibility` already reflects an ancestor's
  // `visibility: hidden` correctly and needs no separate walk.
  function hasHiddenAncestor(el: Element): boolean {
    let node = el.parentElement;
    while (node) {
      if (window.getComputedStyle(node).display === "none") {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // CSS's own "blockification" rule (CSS Display Module Level 3 §2.7) computes `display: block` for
  // any flex/grid *item* whose author-specified `display` was `inline`, regardless of what the
  // stylesheet actually says - `getComputedStyle` only ever reports this *used* value, never the
  // authored one. Found live: `.ago-workspace__back` is `display: inline` in `workspace.css`, but its
  // parent (`.ago-workspace__main-head`) is a flex row, so `getComputedStyle(link).display` reports
  // `"block"` and the naive `computed display === "inline"` check above missed it entirely - the very
  // link this exemption exists for. This walks the live CSSOM instead of the computed style, looking
  // for a matching rule (including inside `@media` blocks, which is where this repository's own rule
  // lives) that authors `display: inline` - the question this exemption actually needs answered is
  // "did the author write this as running text", not "did the box model blockify it afterwards".
  function authoredAsInlineDisplay(el: Element): boolean {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        // A cross-origin stylesheet throws on `.cssRules` (CORS) - not a case this app has today,
        // skipped defensively rather than letting one bad sheet abort the whole scan.
        continue;
      }
      if (scanRulesForInlineMatch(rules, el)) {
        return true;
      }
    }
    return false;
  }

  function scanRulesForInlineMatch(rules: CSSRuleList, el: Element): boolean {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
        if (scanRulesForInlineMatch(rule.cssRules, el)) {
          return true;
        }
        continue;
      }
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      if (rule.style.display !== "inline") {
        continue;
      }
      try {
        if (el.matches(rule.selectorText)) {
          return true;
        }
      } catch {
        // An unparseable-by-`matches` selector (a rare modern-CSS edge case) - skip it rather than
        // let one rule abort the scan.
      }
    }
    return false;
  }

  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const violations: MinSizeViolation[] = [];
  let exempted = 0;

  // **A control wrapped in a `<label>` is measured by the label, not by itself** (issue #82, found
  // while replicating this gate to `ago-calendar-console`). That gate flagged two bare
  // `<input type="checkbox">` at 13x13 - the browser's own unstyled default - and both sat inside a
  // `<label>` whose text toggles them, so the clickable target was never 13x13 to a user. A defect
  // was nearly filed for a control that is genuinely fine, and a gate that reports a non-defect gets
  // switched off.
  //
  // Nothing in this repository currently trips it, which is luck about styling rather than a property
  // of the check - the three gates share these lib files precisely so a lesson learned in one is not
  // re-learned in the others.
  //
  // Measured rather than exempted: a `<label>` that is itself under the threshold is still reported,
  // which an exemption would have waved through.
  function targetRect(el: Element): DOMRect {
    const label = el.closest("label");
    return (label ?? el).getBoundingClientRect();
  }

  for (const el of elements) {
    const style = window.getComputedStyle(el);
    const rect = targetRect(el);

    const ariaHidden = el.getAttribute("aria-hidden") === "true";
    const displayNone = style.display === "none";
    const visibilityHidden = style.visibility === "hidden";
    const opacityZero = parseFloat(style.opacity || "1") === 0;
    // Deliberately narrow: only the specific clip-shapes the sr-only idiom actually uses ("clip
    // to nothing"), never "has any clip-path at all" - a real, visible control clipped to a rounded
    // corner or a decorative shape must not be exempted just for having a `clip-path` set.
    const clipsToNothing =
      style.clipPath === "inset(50%)" ||
      style.clipPath === "circle(0px)" ||
      style.clipPath === "circle(0)" ||
      style.clip === "rect(0px, 0px, 0px, 0px)" ||
      style.clip === "rect(0, 0, 0, 0)";
    // Off-canvas only counts as the hiding pattern when the element is taken out of normal flow to
    // get there (`position: fixed/absolute/sticky`) - the older "shove it off-screen" sr-only
    // technique. A `position: static` element that is merely *below the fold* of a long, scrollable
    // page is not hidden at all, it is one scroll away - found live, the first time this ran against
    // `queue-conversation`'s own long message thread: an element appended at the end of a tall
    // `document.body` landed below `window.innerHeight` by ordinary flow, not by any hiding technique,
    // and this exemption almost swallowed it. Requiring non-static positioning is what keeps a
    // genuinely tiny control at the bottom of a real page from being waved through.
    const takenOutOfFlow = style.position === "fixed" || style.position === "absolute" || style.position === "sticky";
    const offscreen =
      takenOutOfFlow &&
      (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight);
    const nearZeroAndPositioned = rect.width <= 2 && rect.height <= 2 && takenOutOfFlow;

    // WCAG 2.2's own 2.5.8 Target Size (Minimum) carries an explicit exception this repository's
    // threshold (this file's own doc comment) is cited from: "the target is in a sentence or block of
    // text". `WorkspaceLayout`'s own `.ago-workspace__back` ("← Conversations", mobile only,
    // `workspace.css`'s `display: inline`) is exactly that - an ordinary inline hyperlink whose size
    // is however tall its own text happens to be, not a tap target laid out like a button. Checked
    // against the *authored* display (`authoredAsInlineDisplay`, this file's own comment on why the
    // computed value cannot be trusted here), not the computed one - narrow on purpose either way:
    // only a plain `<a>` counts, never a `button`/`input`/`[role="button"]` styled to look like
    // running text, which is a control regardless of its CSS.
    const inlineTextLink = el.tagName === "A" && (style.display === "inline" || authoredAsInlineDisplay(el));
    const ancestorHidden = hasHiddenAncestor(el);

    const exempt =
      ariaHidden ||
      displayNone ||
      visibilityHidden ||
      opacityZero ||
      clipsToNothing ||
      offscreen ||
      nearZeroAndPositioned ||
      inlineTextLink ||
      ancestorHidden;

    if (exempt) {
      exempted++;
      continue;
    }

    if (rect.width < thresholdPx || rect.height < thresholdPx) {
      violations.push({
        selector: describeSelector(el),
        tag: el.tagName.toLowerCase(),
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        text: (el.textContent || "").trim().slice(0, 60),
      });
    }
  }

  return { thresholdPx, scanned: elements.length, exempted, violations };
}
