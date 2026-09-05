import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { openScreen } from "./fixtures/openScreen.js";
import { UX_GATE_SCREENS } from "./fixtures/screens.js";
import { measureHorizontalOverflow } from "./lib/overflow.js";
import { measureUndersizedInteractiveElements } from "./lib/minSize.js";
import { measureContrastViolations } from "./lib/contrast.js";
import { measureUntranslatedLatinText } from "./lib/i18nCompleteness.js";

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
 * `11-16` adds a fourth: every fixture this gate seeds is Cyrillic
 * (`ux-gate/fixtures/data.ts`, `seededPermissions().locale: "Ru"`), so the whole console renders in
 * Russian for every one of these runs - not a separate locale variant of the same test, the same run
 * that already produces the other three assertions and the screenshot.
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

    // `11-16`: skipped for `owner-sites` - `/owner` renders in English regardless of any signed-in
    // identity's tenant locale, a settled `11-11` design call restated in `OwnerSitesPage.tsx`'s own
    // doc comment ("`en` explicitly, never `useStrings()`"), gated server-side by
    // `RequirePlatformOwner` and client-side by `useOwnerEligibility` - seen by one person, who wrote
    // it in English on purpose.
    //
    // `23-27`: skipped for `redeem-invite` too, for a related but distinct reason -
    // `RedeemInvitePage.tsx`'s own doc comment has the full reasoning. `/owner`'s English is
    // permanent by design; this screen's is a consequence of having no tenant to read a locale from
    // *yet* (the same category `StringsContext.tsx` already places `/onboarding`/`/signup`/
    // `/callback` in), not a deliberate "this reader gets English forever" choice - `RedeemInvitePage`
    // does call `useStrings()`, and both `en.ts`/`ru.ts` carry a real translation for every string it
    // renders, satisfying `23-27`'s own "every string through the translation files, in every
    // locale" requirement at the level that requirement can be met without a backend change: the
    // *table* is complete, even though this route has no provider to pick the Russian half of it.
    //
    // Both screens stay in the run for the three assertions above; only this fourth one treats them
    // differently, and each is named here rather than matched by any property of the screen
    // (`ux-gate/lib/i18nCompleteness.ts`'s own doc comment has the element-level exemptions this one
    // complements).
    if (screen.name !== "owner-sites" && screen.name !== "redeem-invite") {
      await test.step("no untranslated interface text", async () => {
        const result = await page.evaluate(measureUntranslatedLatinText);
        expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
      });
    }
  });
}
