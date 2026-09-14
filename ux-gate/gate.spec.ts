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

    // `23-27` skipped `redeem-invite` here, for a while: that screen called `useStrings()` throughout
    // and both `en.ts`/`ru.ts` carried a real translation for every string it rendered, but it had no
    // site to read a `locale` from yet, so it fell through to the context's bare English default
    // regardless. `23-28` removed that reason rather than working around it - `RedeemInvitePage.tsx`'s
    // own doc comment and `StringsContext.tsx`'s have the full account - so that screen has rendered
    // Russian like every other one this gate opens ever since.
    //
    // `owner-sites` **was** skipped here for the reason `redeem-invite` no longer is - "`/owner`
    // renders in English regardless of any signed-in identity's tenant locale, a settled `11-11`
    // design call" - and `25-89` overturns that premise the same way `23-28` overturned
    // `redeem-invite`'s (`OwnerSitesPage.tsx`'s and `OwnerStringsProvider.tsx`'s own doc comments have
    // the full account): `/owner` now wraps itself in `OwnerStringsProvider` and genuinely renders
    // Russian, proven by removing this skip once, running this exact assertion for real, and fixing
    // what it found in-scope to fix (`25-89`'s report has the details: a lowercase "id" that should
    // have been the already-exempted "ID", "API" newly exercised as the loanword `ru.ts` already used
    // elsewhere, and a fixture site name that literally embedded this test suite's own name inside
    // what its own rule requires to be pure Cyrillic).
    //
    // **The skip stays, on a narrower and different reason than before.** Once those were fixed, three
    // *pre-existing*, real, already-out-of-scope gaps remained, each latent rather than new - the first
    // screen this gate ever exercised `OwnerSiteSummary.tier`'s deliberate raw server passthrough
    // (`OwnerSitesPage.tsx`'s own doc comment: `"free"` is not a placeholder, there is no mapping
    // table), `ownerSites.ts#formatByteSize`'s own deliberately-untranslated unit letters (`"MiB"`,
    // the same `d`/`h`/`m` convention `time/format.ts#formatElapsed` already uses), and
    // `time/format.ts`'s fixed `en-GB` `DISPLAY_LOCALE` (`"Jun"`, `"Sept"` - this function's own file
    // header above already documents this exact gap as real and deliberately unfixed, for
    // `AdminConversationsPage` originally; `owner-sites` is simply the second screen honest enough to
    // surface it). None of the three is a translation this item's own Scope covers - `docs/backlog/
    // 25-89-*.md` moves owner-panel *strings* into `ConsoleStrings`, not the shared date-formatting or
    // byte-unit machinery every other translated screen already leaves exactly this untranslated, and
    // not `12-02`'s own settled "render the wire value, don't invent a mapping" call for `tier`. Fixing
    // any of the three for real is a repository-wide change (thread a locale through `time/format.ts`
    // and every one of its call sites; decide a byte-unit convention; decide whether `tier` gets a
    // display-name mapping at all) - each its own item, not a rider on this one (`CLAUDE.md` rule 15).
    if (screen.name !== "owner-sites") {
      await test.step("no untranslated interface text", async () => {
        const result = await page.evaluate(measureUntranslatedLatinText);
        expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
      });
    }
  });
}
