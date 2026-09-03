import { describe, expect, it } from "vitest";
import { ErrorResponse, OidcClient } from "oidc-client-ts";
import { REPLAYED_CALLBACK_MESSAGES, isReplayedCallback } from "./replayedCallback.js";

/**
 * `11-17` (`ago-root#383`). `replayedCallback.ts`'s own doc comment has the full reasoning; this file
 * covers two different things and keeps them in two `describe` blocks rather than one, because they
 * answer two different questions:
 *
 * - "does `isReplayedCallback` classify a message correctly" - ordinary unit tests, hand-constructed
 *   errors, no different from any other pure function's tests.
 * - "does `oidc-client-ts` still throw the messages this function was written against" - the canary
 *   below, added on review after `CallbackPage.test.tsx`'s own tests were pointed out to construct
 *   every replay error by hand (`new Error("No matching state found in storage")`), which proves the
 *   classifier but nothing about the library it classifies. This drives the *real*
 *   `OidcClient.readSigninResponseState` - both it and `OidcClient` are part of `oidc-client-ts`'s
 *   public `.d.ts`, not a private symbol reached into - with no stored state and with a URL carrying
 *   no `state` param, so the day a routine dependency bump inside `package.json`'s pinned `^3.3.0`
 *   range rewords either string, this fails here instead of the console quietly going back to
 *   blaming Keycloak for an ordinary page reload.
 *
 * **A real library entry point, not a browser-only one.** `readSigninResponseState` only parses the
 * callback URL (`UrlUtils.readParams` - no `fetch`, no `crypto.subtle`) and reads
 * `OidcClientSettingsStore`'s default `stateStore` (`window.localStorage`, present in this project's
 * `jsdom` test environment - `vitest.config.ts`). Nothing here needs a real browser, a redirect, or
 * network access, so this canary runs in the same `npm test` as everything else - checked by reading
 * `oidc-client-ts`'s own source (`node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js`) before
 * writing this, not assumed.
 */
describe("classifying a signinRedirectCallback() rejection as a replay", () => {
  it("recognises both known oidc-client-ts messages", () => {
    expect(isReplayedCallback(new Error("No matching state found in storage"))).toBe(true);
    expect(isReplayedCallback(new Error("No state in response"))).toBe(true);
  });

  it("never mistakes a genuine refusal for a replay, even by message text", () => {
    // `ErrorResponse` is `oidc-client-ts`'s own class for "Keycloak's redirect carried an `error`
    // parameter" - the `instanceof` guard is what `isReplayedCallback`'s own doc comment says keeps
    // this from ever mis-classifying a refusal, checked here rather than only asserted.
    expect(isReplayedCallback(new ErrorResponse({ error: "access_denied" }))).toBe(false);
  });

  it("does not treat an unrelated Error as a replay", () => {
    expect(isReplayedCallback(new Error("invalid_grant"))).toBe(false);
    expect(isReplayedCallback(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("does not treat a non-Error rejection as a replay", () => {
    expect(isReplayedCallback("No matching state found in storage")).toBe(false);
    expect(isReplayedCallback(undefined)).toBe(false);
  });
});

describe("the replay-message hinge is checked against the real library, not reimplemented", () => {
  const HINGE_MISMATCH_GUIDANCE =
    "oidc-client-ts changed the wording it throws for a replayed/stale /callback. Update the two " +
    "literal strings in replayedCallback.ts's REPLAYED_CALLBACK_MESSAGES (guarded only within the " +
    '"oidc-client-ts": "^3.3.0" range pinned in package.json) to match - see isReplayedCallback\'s ' +
    "own doc comment for why this is a hand-maintained hinge against the library's wording, not a " +
    "library-provided error code, and why a mismatch here means a page reload will start showing an " +
    "operator 'Sign-in failed' again instead of quietly sending them back to Keycloak.";

  function realClient(): OidcClient {
    // Deliberately the same shape `userManager.ts` configures - nothing about `readSigninResponseState`
    // reads these fields, but matching production's settings keeps this test honest about which
    // client configuration it is proving something about, rather than an arbitrary minimal one.
    return new OidcClient({
      authority: "https://keycloak.test.invalid/realms/ago",
      client_id: "ago-console",
      redirect_uri: "https://console.test.invalid/callback",
      response_type: "code",
      scope: "openid profile email",
    });
  }

  it('still throws "No state in response" for a callback URL with no state param', async () => {
    const client = realClient();

    let thrown: unknown;
    try {
      await client.readSigninResponseState("https://console.test.invalid/callback?code=abc");
    } catch (err) {
      thrown = err;
    }

    expect(thrown, HINGE_MISMATCH_GUIDANCE).toBeInstanceOf(Error);
    expect((thrown as Error).message, HINGE_MISMATCH_GUIDANCE).toBe("No state in response");
    expect(REPLAYED_CALLBACK_MESSAGES.has((thrown as Error).message), HINGE_MISMATCH_GUIDANCE).toBe(true);
    expect(isReplayedCallback(thrown), HINGE_MISMATCH_GUIDANCE).toBe(true);
  });

  it('still throws "No matching state found in storage" for a state nothing stored', async () => {
    const client = realClient();

    let thrown: unknown;
    try {
      // A `state` param is present, but this test never ran a signin request that would have stored
      // anything for it - the exact shape of a reload: the first pass through `/callback` already
      // consumed and removed its own entry, so a second read of the same URL finds nothing.
      await client.readSigninResponseState("https://console.test.invalid/callback?code=abc&state=stale-state-id");
    } catch (err) {
      thrown = err;
    }

    expect(thrown, HINGE_MISMATCH_GUIDANCE).toBeInstanceOf(Error);
    expect((thrown as Error).message, HINGE_MISMATCH_GUIDANCE).toBe("No matching state found in storage");
    expect(REPLAYED_CALLBACK_MESSAGES.has((thrown as Error).message), HINGE_MISMATCH_GUIDANCE).toBe(true);
    expect(isReplayedCallback(thrown), HINGE_MISMATCH_GUIDANCE).toBe(true);
  });
});
