import { test, expect } from "@playwright/test";
import { openScreen } from "./fixtures/openScreen.js";
import { UX_GATE_SCREENS } from "./fixtures/screens.js";
import { measureTooltipTriggerOverflow } from "./lib/tooltipOverflow.js";

/**
 * `25-111`: `Tooltip.tsx`'s own hidden-by-default bubble has no rendering-position test anywhere in
 * this repository before this item - jsdom (`src/testing/dom.tsx`'s own comment on why it stubs
 * `scrollIntoView`/`showModal` rather than faking their real behaviour) has no layout engine at all,
 * so a bubble's *position* is not something a Vitest DOM test can observe, only whether it opens and
 * closes. This file is that missing level: `docs/conventions/testing.md`'s "Rendered UX gate", the
 * same one `mobileNavDrawer.spec.ts` reaches for real focus-trap behaviour a `<dialog>` shim cannot
 * fake, reused here for a real bubble's real geometry in real Chromium - not folded into
 * `gate.spec.ts`/`fails-before.spec.ts` (`15-11`'s own fixed screen/assertion counts), for the same
 * reason `mobileNavDrawer.spec.ts` already gives for staying its own file: an independent concern
 * added alongside, not a rider on either of those two.
 *
 * Runs only at the desktop project, and only above `workspace.css`'s own 74rem breakpoint - below it,
 * the visitor panel's aside stops being a narrow 14rem grid column at all (it becomes a full-width
 * strip above the thread, then a full-width block at the one-column breakpoint), so there is nothing
 * narrow here to reproduce the reported defect against below that width.
 *
 * **Every overflow check below is `expect.poll`, not a single read.** The first cut read once, right
 * after `expect(bubble).toBeVisible()` resolved, and looked reliable - passing every manual run and
 * one full `npm run ux-gate` pass - until an independent `--repeat-each=8 --workers=1` rerun failed
 * most of the time, at a different trigger with a different overflow amount each run. Traced with
 * `console.log`s inside `Tooltip.tsx` itself (removed once this was understood): `hidden` coming off
 * the bubble and `Tooltip.tsx`'s own `setBubbleStyle` landing in the DOM are two separate React commits
 * - `toBeVisible()` only ever waits for the first one, so a read taken immediately after it can land in
 * the real, if narrow, gap between "unhidden" and "correctly positioned". Reading again ~50ms later
 * (proven with a throwaway polling script, not guessed) always found the second commit long since
 * landed - this is an ordinary async-UI settling window Playwright's own auto-retrying assertions exist
 * for, not a bug in the positioning arithmetic itself. `expect.poll` is that mechanism: it keeps
 * re-reading until the value is right or the (10s, `playwright.config.ts`'s own `expect.timeout`) budget
 * runs out - which is exactly why this is not "wait long enough and always pass regardless of the
 * code": a genuinely unfixed `Tooltip.tsx` never converges to zero, and this same poll times out and
 * fails for real, which the fails-before run for this item confirmed before this comment was written.
 */
const CONVERSATION_SCREEN = UX_GATE_SCREENS[0]; // queue-conversation - the one screen with a real VisitorPanel aside.

test.describe("tooltip bubble positioning (25-111)", () => {
  test.beforeEach(({ page }) => {
    const viewport = page.viewportSize();
    test.skip(
      !viewport || viewport.width < 1184,
      "VisitorPanel's aside is only a narrow (14rem) column at/above workspace.css's own 74rem breakpoint",
    );
  });

  test("VisitorPanel's own tooltip bubble does not overflow the narrow aside column it opens in", async ({ page }) => {
    await openScreen(page, CONVERSATION_SCREEN);

    // The trigger beside "ПОСЕТИТЕЛЬ" - `VisitorPanel.tsx`'s own `#ago-visitor-panel-title`, paired
    // with its `Tooltip` inside the same `.ago-tooltip-row`.
    const trigger = page.locator('.ago-tooltip-row:has(#ago-visitor-panel-title) .ago-tooltip__trigger');
    await expect(trigger).toBeVisible();

    await trigger.hover();
    const bubble = trigger.locator('xpath=following-sibling::*[@role="tooltip"]');
    await expect(bubble).toBeVisible();

    const initial = await trigger.evaluate(measureTooltipTriggerOverflow);
    expect(initial.found, "expected the hovered trigger's own bubble to be found").toBe(true);

    let lastOverflow: Awaited<ReturnType<typeof measureTooltipTriggerOverflow>> | undefined;
    try {
      await expect
        .poll(async () => {
          lastOverflow = await trigger.evaluate(measureTooltipTriggerOverflow);
          return lastOverflow.overflowPx;
        })
        .toBe(0);
    } catch (err) {
      // `expect.poll`'s own failure message names the last received number; this appends the full
      // rects behind it, the same diagnostic the pre-`expect.poll` version put directly in `expect`'s
      // own message.
      throw new Error(`bubble/clip rects: ${JSON.stringify(lastOverflow)}`, { cause: err });
    }
  });

  test("every tooltip trigger rendered on this screen keeps its bubble inside its own container", async ({ page }) => {
    // `docs/backlog/25-111-*.md`'s own scope: the fix must not regress any of the six other call
    // sites wherever they already had room. Rather than naming each by its own selector (several are
    // conditional on data that has finished loading), this measures every `.ago-tooltip__trigger`
    // this particular screen actually renders - VisitorPanel's own composed subsections
    // (`ConversationNotesPanel`, `ConversationOutcomePanel`, `VisitorPanel` itself) and the queue
    // rail's two (`ConversationList`) are all expected to be present here; `Thread`'s delivery-scope
    // tooltip and `ConversationPage`'s own hub-connecting note are conditional on this fixture's own
    // state and may or may not be among them - whichever this screen renders is what gets checked.
    await openScreen(page, CONVERSATION_SCREEN);

    const triggers = page.locator(".ago-tooltip__trigger");
    const count = await triggers.count();
    expect(count, "expected at least one tooltip trigger on this screen").toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const trigger = triggers.nth(i);
      await trigger.hover();
      const bubble = trigger.locator('xpath=following-sibling::*[@role="tooltip"]');
      await expect(bubble).toBeVisible();

      const initial = await trigger.evaluate(measureTooltipTriggerOverflow);
      expect(initial.found, `expected trigger #${i}'s own bubble to be found`).toBe(true);

      let lastOverflow: Awaited<ReturnType<typeof measureTooltipTriggerOverflow>> | undefined;
      try {
        await expect
          .poll(async () => {
            lastOverflow = await trigger.evaluate(measureTooltipTriggerOverflow);
            return lastOverflow.overflowPx;
          })
          .toBe(0);
      } catch (err) {
        throw new Error(`trigger #${i}, bubble/clip rects: ${JSON.stringify(lastOverflow)}`, { cause: err });
      }
    }
  });
});
