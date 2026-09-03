import { test, expect } from "@playwright/test";
import { openScreen } from "./fixtures/openScreen.js";
import { UX_GATE_SCREENS } from "./fixtures/screens.js";

/**
 * `11-14`'s own Done-when the jsdom-level tests in `ago-console`'s `src/auth/permissionGating.test.tsx`
 * cannot reach: focus entering the drawer on open, staying trapped while it is open, and returning to
 * the hamburger on close. `src/testing/dom.tsx`'s own comment says why - jsdom's `<dialog>` shim
 * reflects `open` and fires `close`, nothing about focus, because the real behaviour is the browser's
 * (`adr/0030` point 3: `showModal()` is what makes this decision defensible rather than hand-wavy),
 * not this repository's to reimplement or to fake in a DOM with no layout engine. This is exactly the
 * gap `docs/conventions/testing.md` names the "Rendered UX gate" level for - "the browser's own half
 * of the claim stays with... live verification" - so it lives here, against a real `<dialog>` in a
 * real Chromium, reusing `gate.spec.ts`'s own seeded-auth-plus-stubbed-API harness rather than a new
 * one.
 *
 * Not part of the fifteen-screen/eighteen-assertion gate `gate.spec.ts` and `fails-before.spec.ts`
 * cover (`15-11`'s own scope: overflow, undersized targets, contrast) - this is a fourth, independent
 * concern (keyboard/focus behaviour), added alongside rather than folded into either of those two
 * files, so neither one's own fixed count drifts for an unrelated reason.
 *
 * Runs only at the mobile project - the hamburger has no rendered box above the 40rem breakpoint
 * (`shell.css`), so there is nothing to click at the desktop viewport.
 */
const SCREEN = UX_GATE_SCREENS[1]; // admin-conversations - `/admin`, no hub mock needed.

test.describe("mobile navigation drawer (11-14)", () => {
  test.beforeEach(({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 641, "the hamburger only renders below the 40rem breakpoint");
  });

  test("opens on the hamburger and moves focus into the drawer", async ({ page }) => {
    await openScreen(page, SCREEN);

    const menuButton = page.locator(".ago-shell__menu-button");
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();

    const dialog = page.locator(".ago-dialog--drawer");
    await expect(dialog).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest(".ago-dialog--drawer") !== null))
      .toBe(true);
  });

  test("traps focus while open - Tab cycles inside the drawer, never back to the page behind it", async ({ page }) => {
    await openScreen(page, SCREEN);
    await page.locator(".ago-shell__menu-button").click();
    await expect(page.locator(".ago-dialog--drawer")).toBeVisible();

    // More presses than this drawer has focusable items (fourteen nav links for the seeded
    // `site:configure` operator, `fixtures/data.ts`'s own `seededPermissions`) - if focus were not
    // trapped, this would walk it back out onto the page behind the drawer.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
    }

    const stillInside = await page.evaluate(() => document.activeElement?.closest(".ago-dialog--drawer") !== null);
    expect(stillInside).toBe(true);
  });

  test("Escape closes the drawer and returns focus to the hamburger", async ({ page }) => {
    await openScreen(page, SCREEN);
    const menuButton = page.locator(".ago-shell__menu-button");
    await menuButton.click();
    await expect(page.locator(".ago-dialog--drawer")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(".ago-dialog--drawer")).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton).toBeFocused();
  });

  test("choosing an item closes the drawer, navigates, and returns focus to the hamburger", async ({ page }) => {
    await openScreen(page, SCREEN);
    const menuButton = page.locator(".ago-shell__menu-button");
    await menuButton.click();
    const dialog = page.locator(".ago-dialog--drawer");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("link", { name: "Widget appearance" }).click();

    await expect(page).toHaveURL(/\/settings\/widget$/);
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("clicking outside the panel - the backdrop - closes the drawer", async ({ page }) => {
    await openScreen(page, SCREEN);
    await page.locator(".ago-shell__menu-button").click();
    const dialog = page.locator(".ago-dialog--drawer");
    await expect(dialog).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("ux-gate: no viewport configured for this Playwright project.");
    }
    // Inside the viewport, well clear of the drawer's own `min(20rem, 85vw)` panel - a real backdrop
    // click, not a mis-click on the panel's own content.
    await page.mouse.click(viewport.width - 5, viewport.height - 5);

    await expect(dialog).toBeHidden();
  });
});
