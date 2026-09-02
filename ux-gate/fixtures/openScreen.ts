import type { Page } from "@playwright/test";
import { installApiStubs } from "./apiStubs.js";
import { installOperatorHubMock } from "./hubMock.js";
import { signInAsSeededOperator } from "./auth.js";
import type { UxGateScreen } from "./screens.js";

/**
 * Wires one page up exactly the way every screen in this gate needs: the seeded sign-in
 * (`auth.ts`), every REST fixture (`apiStubs.ts`), the SignalR hub mock when the screen asks for it
 * (`hubMock.ts`), then navigates and waits for the screen's own "data has actually rendered, not
 * still on its `Skeleton`" marker.
 *
 * All wiring happens **before** `page.goto` - `page.route`/`page.routeWebSocket`/`addInitScript`
 * only take effect for navigations that start after they are registered, so registering them after a
 * `goto` would race the app's own first-render fetches and fail intermittently rather than reliably.
 */
export async function openScreen(page: Page, screen: UxGateScreen): Promise<void> {
  await signInAsSeededOperator(page);
  await installApiStubs(page);
  if (screen.needsHubMock) {
    await installOperatorHubMock(page);
  }

  await page.goto(screen.path);
  await page.waitForSelector(screen.readySelector, { state: "visible" });
}
