import { ErrorResponse } from "oidc-client-ts";

/**
 * `11-17` (`ago-root#383`): tells apart *why* `userManager.signinRedirectCallback()` rejected -
 * Keycloak genuinely refusing this sign-in, from a browser landing on `/callback` a second time with
 * a `code`/`state` this session has already spent (a reload, a stale bookmark, the back button after
 * the redirect already completed). The second case is not a failure worth an operator's attention: it
 * means "there is nothing to finish here", and `RequireAuth` already knows what to do with no session
 * - send the operator back to Keycloak (`12-04`'s own precedent for this shape of decision: "an
 * unanswerable probe means `/onboarding`, not fail loudly" - here the probe is answerable and says
 * "already used", which is stronger evidence than an outage, so the same non-error destination
 * applies even more clearly). `CallbackPage.tsx` is the one caller today.
 *
 * A pure function in its own module, not inline in `CallbackPage.tsx` - the same reasoning
 * `registrationUrl.ts`'s own doc comment gives for the identical shape: this is the one piece with a
 * way to be wrong, and pulling it out is what lets `replayedCallback.test.ts` drive the real library
 * directly rather than only through a mounted page. It also keeps `CallbackPage.tsx` a components-only
 * file, which `eslint-plugin-react-refresh`'s `only-export-components` rule requires of every page.
 *
 * **This is the fragile part of the fix, stated rather than hidden.** `oidc-client-ts` has no
 * dedicated error type or code for "this authorization code/state was already consumed" - it throws
 * a plain `Error` with one of exactly two hard-coded English messages, straight out of its own
 * `OidcClient.readSigninResponseState` (`node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js`,
 * v3.5.0, the version this project has pinned via `package-lock.json` against the `^3.3.0` range in
 * `package.json`): `"No matching state found in storage"` when the `state` param does not match
 * anything left in `sessionStorage` (the exact shape of a reload - `signinRedirectCallback()` removes
 * the entry after the first successful read), and `"No state in response"` when the URL carries no
 * `state` param at all (an even staler bookmark, or `/callback` opened by hand). Matching on these
 * literal strings is a real hinge: a future `oidc-client-ts` bump inside the `^3.3.0` range - a minor
 * or patch release, not a major one - could reword either message with no compile error here, and
 * this function would silently stop recognising a replay and fall back to showing it as a genuine
 * sign-in failure. That is the safe failure direction (rule: never swallow a real refusal), but it is
 * still a silent regression, which is why it is written out here rather than left implicit in the
 * string literals below - a future reader chasing "why did a reload start showing an error again"
 * should land on this paragraph, not have to re-derive it from the library's source a second time.
 *
 * **Guarded, not just documented.** `replayedCallback.test.ts`'s "the replay-message hinge is checked
 * against the real library, not reimplemented" drives the actual `OidcClient.readSigninResponseState`
 * - the real method `signinRedirectCallback()` ultimately calls into, not a hand-written stand-in -
 * with no stored state and with a URL carrying no `state` param, and asserts what it throws still
 * matches this exact set. `CallbackPage.test.tsx`'s own tests construct the error by hand
 * (`new Error("No matching state found in storage")`), which proves `isReplayedCallback` classifies a
 * message correctly but would never notice the library changing what it actually throws; the canary
 * in this file's own test is what would.
 *
 * The `ErrorResponse` guard is what keeps this from ever mis-classifying a genuine refusal: Keycloak
 * itself answering with `?error=access_denied` (or any OAuth `error` param) throws `oidc-client-ts`'s
 * own `ErrorResponse` - a distinct exported class, checked with `instanceof`, not a string - and this
 * function never even looks at its `.message`. Only a plain `Error` bearing one of the two exact
 * strings above counts as a replay; every other failure - including one that happens to reuse similar
 * wording for an unrelated reason - still reads as "Sign-in failed".
 */
export const REPLAYED_CALLBACK_MESSAGES = new Set<string>([
  "No matching state found in storage",
  "No state in response",
]);

export function isReplayedCallback(err: unknown): boolean {
  return err instanceof Error && !(err instanceof ErrorResponse) && REPLAYED_CALLBACK_MESSAGES.has(err.message);
}
