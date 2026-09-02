import { test, expect } from "@playwright/test";
import { openScreen } from "./fixtures/openScreen.js";
import { UX_GATE_SCREENS } from "./fixtures/screens.js";
import { measureHorizontalOverflow } from "./lib/overflow.js";
import { measureUndersizedInteractiveElements } from "./lib/minSize.js";
import { measureContrastViolations } from "./lib/contrast.js";

const MIN_INTERACTIVE_SIZE_PX = 24;

/**
 * `15-11`'s "Done when" list requires each assertion proven to fail first, by introducing the exact
 * defect it exists to catch, and its own brief is explicit about the mechanism: "inject the defect
 * via a post-navigation DOM/CSS mutation in the test itself ... run the assertion, observe the
 * failure, then run the same page *without* the mutation and observe green" - never by editing
 * product source, which would make this a change to what ships rather than a proof about the gate.
 *
 * All three run against `queue-conversation` (`fixtures/screens.ts`) - the one screen with a real
 * composer *and* real message bubbles, which is what lets the min-size and contrast defects below be
 * built out of the same shapes the two historical defects actually had, not a synthetic stand-in.
 *
 * Each test below: opens the clean screen, confirms the assertion starts green (so the "fails" that
 * follows is caused by the mutation and not by some other pre-existing violation), applies the
 * mutation, confirms the assertion now fails **with the expected violation in the result**, removes
 * the mutation, and confirms green again on the same page.
 */
const CONVERSATION_SCREEN = UX_GATE_SCREENS[0];

test.describe("fails-before proof", () => {
  test("no horizontal overflow: an element wider than the viewport fails, removing it passes", async ({ page }) => {
    await openScreen(page, CONVERSATION_SCREEN);

    const before = await page.evaluate(measureHorizontalOverflow);
    expect(before.overflowPx, "expected the clean page to start with no overflow").toBe(0);

    await page.evaluate(() => {
      const defect = document.createElement("div");
      defect.id = "ux-gate-overflow-defect";
      // 5000px, far past either configured viewport (375 and 1280) - an unambiguous overflow, not a
      // borderline one that could pass by rounding.
      defect.style.cssText = "position: absolute; top: 0; left: 0; width: 5000px; height: 4px;";
      document.body.appendChild(defect);
    });

    const during = await page.evaluate(measureHorizontalOverflow);
    expect(during.overflowPx, "expected the injected 5000px element to overflow the viewport").toBeGreaterThan(0);

    await page.evaluate(() => {
      document.getElementById("ux-gate-overflow-defect")?.remove();
    });

    const after = await page.evaluate(measureHorizontalOverflow);
    expect(after.overflowPx, "expected overflow to clear once the defect element was removed").toBe(0);
  });

  test("no undersized interactive element: a one-character-wide input fails, removing it passes", async ({ page }) => {
    await openScreen(page, CONVERSATION_SCREEN);

    const before = await page.evaluate(measureUndersizedInteractiveElements, MIN_INTERACTIVE_SIZE_PX);
    expect(before.violations, "expected the clean page to start with no undersized controls").toEqual([]);

    await page.evaluate(() => {
      // `15-11`'s own named historical defect, reproduced as literally as a synthetic element can:
      // a real, visible, normally-positioned (not the sr-only pattern) `<input>` sized to fit roughly
      // one monospace character.
      const defect = document.createElement("input");
      defect.id = "ux-gate-one-char-input-defect";
      defect.type = "text";
      defect.setAttribute("aria-label", "ux-gate one-character-wide input defect");
      defect.style.cssText = "display: inline-block; width: 6px; height: 20px; position: static;";
      document.body.appendChild(defect);
    });

    const during = await page.evaluate(measureUndersizedInteractiveElements, MIN_INTERACTIVE_SIZE_PX);
    const defectViolation = during.violations.find((v) => v.selector.includes("ux-gate-one-char-input-defect"));
    expect(defectViolation, JSON.stringify(during.violations, null, 2)).toBeTruthy();
    expect(defectViolation?.width).toBeLessThan(MIN_INTERACTIVE_SIZE_PX);

    await page.evaluate(() => {
      document.getElementById("ux-gate-one-char-input-defect")?.remove();
    });

    const after = await page.evaluate(measureUndersizedInteractiveElements, MIN_INTERACTIVE_SIZE_PX);
    expect(after.violations, "expected no undersized controls once the defect input was removed").toEqual([]);
  });

  test("no legitimately-hidden control is flagged (the exemption itself, proven both ways)", async ({ page }) => {
    // Not one of `15-11`'s three required proofs, but the brief is explicit that a naive minimum
    // "immediately false-fails" on this repo's own real hidden control - worth proving the exemption
    // holds, not just asserting it in prose. `Composer.tsx`'s own `input.ago-visually-hidden[type=file]`
    // is the real control this repository ships, not a synthetic stand-in.
    await openScreen(page, CONVERSATION_SCREEN);

    const result = await page.evaluate(measureUndersizedInteractiveElements, MIN_INTERACTIVE_SIZE_PX);
    const flaggedTheHiddenFileInput = result.violations.some((v) => v.tag === "input" && v.selector.includes("ago-visually-hidden"));
    expect(flaggedTheHiddenFileInput, "the deliberately visually-hidden file input must be exempted, not flagged").toBe(false);
  });

  test("WCAG AA contrast: dark-grey-on-dark-blue fails, restoring the real colours passes", async ({ page }) => {
    await openScreen(page, CONVERSATION_SCREEN);

    const before = await page.evaluate(measureContrastViolations);
    expect(before.violations, "expected the clean page to start with no contrast violations").toEqual([]);

    await page.evaluate(() => {
      const bubble = document.querySelector<HTMLElement>(".ago-message__bubble");
      const body = bubble?.querySelector<HTMLElement>(".ago-message__body") ?? null;
      if (!bubble || !body) {
        throw new Error("ux-gate: expected at least one seeded message bubble to exist on this screen.");
      }
      bubble.dataset.uxGateContrastDefect = "true";
      // `15-11`'s own named historical defect: dark grey text on a dark blue surface. Computed by
      // hand against the real WCAG formula before trusting this fixture (this file's own commit
      // message / the worker report has the arithmetic): #3a3a3a on #1a1a6e is ~1.3:1, far under
      // both the 4.5:1 normal-text and 3:1 large-text AA floors.
      bubble.style.backgroundColor = "#1a1a6e";
      body.style.color = "#3a3a3a";
    });

    // A style change and `getComputedStyle` reporting it back are not the same tick here - measured
    // live: reading the computed `background-color` in the same `page.evaluate` call that set it
    // still answered the *old* colour, and only a real, if brief, wait made it observe the new one
    // (this repository's own `--ago-transition`/`prefers-reduced-motion` machinery is the suspected
    // cause but was not conclusively isolated - noted honestly in the worker report rather than
    // asserted). Polling the actual condition rather than a fixed sleep, so this is exactly as fast
    // as the browser needs and no slower on a loaded CI runner.
    await page.waitForFunction(() => {
      const bubble = document.querySelector<HTMLElement>(".ago-message__bubble");
      return bubble ? getComputedStyle(bubble).backgroundColor === "rgb(26, 26, 110)" : false;
    });

    const during = await page.evaluate(measureContrastViolations);
    const defectViolation = during.violations.find((v) => v.background.includes("26, 26, 110"));
    expect(defectViolation, JSON.stringify(during.violations, null, 2)).toBeTruthy();
    expect(defectViolation?.ratio).toBeLessThan(defectViolation?.requiredRatio ?? 0);

    await page.evaluate(() => {
      const bubble = document.querySelector<HTMLElement>('[data-ux-gate-contrast-defect="true"]');
      const body = bubble?.querySelector<HTMLElement>(".ago-message__body") ?? null;
      bubble?.style.removeProperty("background-color");
      body?.style.removeProperty("color");
      bubble?.removeAttribute("data-ux-gate-contrast-defect");
    });

    // Same observed lag as the injection above, in reverse - waits for the real (token-driven)
    // background to actually be back before measuring "after".
    await page.waitForFunction(() => {
      const bubble = document.querySelector<HTMLElement>(".ago-message__bubble");
      return bubble ? getComputedStyle(bubble).backgroundColor !== "rgb(26, 26, 110)" : false;
    });

    const after = await page.evaluate(measureContrastViolations);
    expect(after.violations, "expected no contrast violations once the real colours were restored").toEqual([]);
  });
});
