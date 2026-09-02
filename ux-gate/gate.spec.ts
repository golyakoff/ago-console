import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { openScreen } from "./fixtures/openScreen.js";
import { UX_GATE_SCREENS } from "./fixtures/screens.js";
import { measureHorizontalOverflow } from "./lib/overflow.js";
import { measureUndersizedInteractiveElements } from "./lib/minSize.js";
import { measureContrastViolations } from "./lib/contrast.js";

/** `ux-gate/lib/minSize.ts`'s own doc comment has the full justification - WCAG 2.2's 2.5.8 Target
 * Size (Minimum), checked against this repository's own smallest legitimate control (32px) and a
 * deliberately-built one-character-wide input (6px) before being trusted. */
const MIN_INTERACTIVE_SIZE_PX = 24;

const SCREENSHOTS_DIR = fileURLToPath(new URL("./screenshots/", import.meta.url));

/**
 * `15-11`: one test per screen, running all three assertions and taking both viewports' screenshot
 * in one pass - the screen is only opened once per (screen, viewport) pair, which matters here more
 * than it would in an ordinary UI test because opening it is not free (a seeded sign-in, a full REST
 * fixture set and, for the conversation screen, a mocked SignalR handshake).
 *
 * The screenshot is taken **before** the three assertions run, deliberately - a failing assertion
 * still leaves the picture that shows *why* in the CI artifact, which is the more useful failure mode
 * for a human looking at a red build than three failed `expect`s and nothing to look at.
 */
for (const screen of UX_GATE_SCREENS) {
  test(screen.name, async ({ page }) => {
    await openScreen(page, screen);

    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("ux-gate: no viewport configured for this Playwright project.");
    }
    const suffix = `${viewport.width}x${viewport.height}`;

    // Viewport-only, not `fullPage: true`. Changed during review, 2026-09-02, after the very first
    // batch of images misled the reviewer: `shell.css` makes the header `position: sticky`, and a
    // full-page capture paints a sticky element at its scroll offset - so the header lands on top of
    // the page's own content and the picture looks like a broken layout that is not broken. These
    // images exist to be looked at by a human deciding whether a screen is usable (the delivery
    // digest), so they must show what a person actually sees on opening the page; a capture that
    // invents an overlap is worse than no capture at all, because it costs someone a hunt for a
    // defect that is not there. The assertions below never read the image, so nothing about the gate
    // itself depends on this choice.
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${screen.name}--${suffix}.png`),
      fullPage: false,
    });

    await test.step("no horizontal overflow", async () => {
      const overflow = await page.evaluate(measureHorizontalOverflow);
      expect(
        overflow.overflowPx,
        `document.documentElement.scrollWidth (${overflow.scrollWidth}px) exceeds window.innerWidth (${overflow.innerWidth}px) by ${overflow.overflowPx}px`,
      ).toBe(0);
    });

    await test.step("no undersized interactive element", async () => {
      const result = await page.evaluate(measureUndersizedInteractiveElements, MIN_INTERACTIVE_SIZE_PX);
      expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    });

    await test.step("WCAG AA contrast", async () => {
      const result = await page.evaluate(measureContrastViolations);
      expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    });
  });
}
