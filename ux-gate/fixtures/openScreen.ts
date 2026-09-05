import type { Page } from "@playwright/test";
import { installApiStubs } from "./apiStubs.js";
import { installFontStubs } from "./fontStubs.js";
import { installOperatorHubMock } from "./hubMock.js";
import { signInAsSeededOperator } from "./auth.js";
import type { UxGateScreen } from "./screens.js";

/**
 * Wires one page up exactly the way every screen in this gate needs: the seeded sign-in
 * (`auth.ts`), every REST fixture (`apiStubs.ts`), the one external-network dependency
 * `index.html` itself carries (`fontStubs.ts`, `349`), the SignalR hub mock when the screen asks
 * for it (`hubMock.ts`), then navigates and waits for the screen's own "data has actually rendered,
 * not still on its `Skeleton`" marker.
 *
 * All wiring happens **before** `page.goto` - `page.route`/`page.routeWebSocket`/`addInitScript`
 * only take effect for navigations that start after they are registered, so registering them after a
 * `goto` would race the app's own first-render fetches and fail intermittently rather than reliably.
 * `installFontStubs` is unconditional, not per-screen like the hub mock - every screen's first paint
 * pulls in `index.html`'s own Google Fonts `<link>`, not just some of them.
 */
export async function openScreen(page: Page, screen: UxGateScreen): Promise<void> {
  await signInAsSeededOperator(page);
  // `23-24`: `screen.permissionsOverride` is `undefined` for every screen but the one that sets it
  // (`screens.ts`'s own `admin-limited-permissions`) - `installApiStubs`'s own default parameter
  // falls back to the fully-permissioned seeded operator unchanged.
  //
  // `23-06`: the identical shape for `screen.installationOverride` - `undefined` for every screen but
  // `installation-never-seen`, falling back to `seededSiteInstallation`'s own fully-configured default.
  await installApiStubs(page, screen.permissionsOverride, screen.installationOverride);
  await installFontStubs(page);
  if (screen.needsHubMock) {
    await installOperatorHubMock(page);
  }

  await page.goto(screen.path);
  await page.waitForSelector(screen.readySelector, { state: "visible" });
}
