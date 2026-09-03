import type { Page } from "@playwright/test";

/**
 * `349`: the one network dependency `apiStubs.ts`/`hubMock.ts` do not cover, because it is not an
 * API call - `index.html`'s own `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
 * (`11-05`'s doc comment there: "a third-party request on first paint"). Render-blocking, and never
 * intercepted anywhere in this gate before now, which made every `page.goto(..., waitUntil: "load")`
 * depend on a live round trip to Google's servers actually completing - a dependency this gate does
 * not otherwise carry (auth is a token written to storage, every REST/hub call is stubbed) and does
 * not need, since the console already renders correctly without it (`tokens.css`'s own font stacks
 * all end in a system font - the same fallback a slow or blocked network gets in production).
 *
 * This is `349`'s actual cause, confirmed rather than assumed: routing this same request to resolve
 * after an artificial 35s delay reproduced the reported failure verbatim - `page.goto: Test timeout
 * of 30000ms exceeded ... waiting until "load"`, at this exact line in `openScreen.ts`. Two
 * explanations were ruled out first because they did not fit the evidence: `--workers=2` still failed
 * one run in two (rules out Playwright-level worker contention), and CI - which reaches Google's
 * network from a datacenter, not through a developer machine's own outbound path - has been green on
 * every run since the gate merged (`gh run list`), with this exact step completing in ~16s each time.
 * A local machine's path to a *specific external domain* being intermittently slow, while `127.0.0.1`
 * stays fast and CI stays fast, points at the network hop between this machine and Google - not at
 * anything this gate's own code or config controls.
 *
 * The fix is a stub, not a longer timeout or a retry: a longer `timeout` would let a genuinely
 * hanging run pass slower rather than fail, which hides exactly the dependency being removed here;
 * a retry would be retrying a `page.goto`, which is infrastructure rather than an assertion and so is
 * the one kind of retry `349`'s own done-when criteria allows - but a retry still spends up to 30s
 * finding out the first attempt was going to hang, where a stub spends zero. Two routes, not one:
 * `fonts.googleapis.com` serves the render-blocking stylesheet itself, and `fonts.gstatic.com` is
 * where that stylesheet's own `@font-face` rules point for the actual `.woff2` files - unreachable
 * with an empty stylesheet body below, but stubbed anyway so a future change to the font list can
 * never reintroduce this dependency by way of the second domain instead of the first.
 */
export async function installFontStubs(page: Page): Promise<void> {
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });

  await page.route("https://fonts.gstatic.com/**", async (route) => {
    await route.abort();
  });
}
