import { afterEach, describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-54`: `Tooltip`'s own first test file - `adr/0030`'s own stated negative consequence is that the
 * closed component set has no component tests at all, "revisited when the set is next touched". This
 * item touches it, so this is that revisit for the one component it adds: the mechanism itself
 * (hidden by default, shown on hover/focus, hidden again, closable with Escape), not any one call
 * site's own copy - each of those has its own test proving its particular string moved.
 */
afterEach(async () => {
  await unmount();
});

async function mount(content = "Explanatory text.") {
  const container = await render(<Tooltip content={content} />);
  return {
    container,
    trigger: one<HTMLButtonElement>(container, ".ago-tooltip__trigger"),
    bubble: one<HTMLElement>(container, '[role="tooltip"]'),
  };
}

describe("Tooltip", () => {
  it("renders the trigger and a hidden bubble carrying the content, before any interaction", async () => {
    const { trigger, bubble } = await mount("The pairing code expires in ten minutes.");

    expect(trigger.getAttribute("aria-describedby")).toBe(bubble.id);
    expect(bubble.hidden).toBe(true);
    expect(bubble.textContent).toBe("The pairing code expires in ten minutes.");
  });

  it("shows the bubble on hover and hides it again once the pointer leaves", async () => {
    const { trigger, bubble } = await mount();

    // React does not listen for the native, non-bubbling `mouseenter`/`mouseleave` events at all - it
    // derives `onMouseEnter`/`onMouseLeave` from the bubbling `mouseover`/`mouseout` pair plus
    // `relatedTarget`, the same way a real browser's own event delegation would have to. `relatedTarget:
    // document.body` is what makes each dispatch read as "the pointer crossed this element's own
    // boundary" rather than a move within it.
    await interact(() =>
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })),
    );
    expect(bubble.hidden).toBe(false);

    await interact(() =>
      trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })),
    );
    expect(bubble.hidden).toBe(true);
  });

  it("shows the bubble on keyboard focus and hides it again on blur", async () => {
    const { trigger, bubble } = await mount();

    await interact(() => trigger.focus());
    expect(bubble.hidden).toBe(false);

    await interact(() => trigger.blur());
    expect(bubble.hidden).toBe(true);
  });

  it("closes on Escape and returns focus nowhere the operator did not put it - the trigger stays, the bubble hides", async () => {
    const { trigger, bubble } = await mount();

    await interact(() => trigger.focus());
    expect(bubble.hidden).toBe(false);

    await interact(() =>
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })),
    );
    expect(bubble.hidden).toBe(true);
  });

  it("has an accessible name distinct from its visible \"?\" glyph, so a screen reader announces what it does", async () => {
    const { trigger } = await mount();

    expect(trigger.textContent).toBe("?");
    expect(trigger.getAttribute("aria-label")).toBeTruthy();
    expect(trigger.getAttribute("aria-label")).not.toBe("?");
  });
});
