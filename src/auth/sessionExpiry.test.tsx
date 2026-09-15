import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponse, type User } from "oidc-client-ts";
import { AuthProvider } from "./AuthProvider.js";
import { RequireAuth } from "./RequireAuth.js";
import { interact, render, unmount } from "../testing/dom.js";

/**
 * The bug this item fixes: an operator leaves a tab open past the 4-hour SSO idle timeout
 * (`ssoSessionIdleTimeout`, deliberately unchanged - see this item's own report) and comes back to
 * "Подключение…" then a raw "Failed to load the queue: 401", recoverable only by a manual reload.
 *
 * <b>The first version of this fix was itself wrong, and that correction is why this file has as
 * many "does NOT log out" cases as "does log out" ones.</b> Wiring `silentRenewError` straight to a
 * sign-out treats *every* renewal hiccup as proof the session is dead - but `oidc-client-ts`'s own
 * `SilentRenewService` gives a non-timeout failure zero retries, and this app never configures
 * `maxSilentRenewTimeoutRetries`, so an ordinary dropped fetch (exactly what a backgrounded tab
 * produces - browsers throttle `setInterval`, which is what schedules each renewal attempt) reaches
 * `silentRenewError` on the very first miss. Logging out on that would make the "honest" behaviour
 * track the ~5-minute access-token lifespan instead of the real 4-hour session - the regression the
 * author caught before this item shipped. `AuthProvider`'s handler now only treats an `ErrorResponse`
 * (Keycloak's token endpoint affirmatively answering "no", e.g. `invalid_grant`) as the real, final
 * word - not a plain `Error`, which just means a request never completed.
 *
 * **The fake has to fire the same events the real library fires, in the same order, or it cannot
 * reproduce any of this.** `signOutRace.test.tsx` (`23-51`) already established why: a `vi.fn()` that
 * just resolves cannot exercise a handler whose whole job is reacting to an event. Here that means
 * `removeUser()` itself firing `userUnloaded` before it resolves - exactly what `oidc-client-ts` does.
 */

const handlers = vi.hoisted(() => ({
  unloaded: [] as (() => void)[],
  silentRenewError: [] as ((error: Error) => void)[],
}));

const userManager = vi.hoisted(() => ({
  userManager: {
    getUser: vi.fn(),
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
    removeUser: vi.fn(),
    signinSilent: vi.fn(),
    events: {
      addUserLoaded: vi.fn(),
      removeUserLoaded: vi.fn(),
      addUserUnloaded: vi.fn((h: () => void) => handlers.unloaded.push(h)),
      removeUserUnloaded: vi.fn(),
      addSilentRenewError: vi.fn((h: (error: Error) => void) => handlers.silentRenewError.push(h)),
      removeSilentRenewError: vi.fn(),
    },
  },
}));

vi.mock("./userManager.js", () => userManager);
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

function signedIn(expired: boolean): User {
  return { access_token: "token", profile: { sub: "sub" }, expired } as unknown as User;
}

/** The one thing a truly-dead SSO session produces: Keycloak's token endpoint answering the refresh
 * grant with a real OAuth error, not a request that failed to complete at all. */
function tokenEndpointRejection(): ErrorResponse {
  return new ErrorResponse({ error: "invalid_grant", error_description: "Session not active" });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.unloaded = [];
  handlers.silentRenewError = [];
  userManager.userManager.signinRedirect.mockResolvedValue(undefined);
  userManager.userManager.signinSilent.mockResolvedValue(signedIn(false));
  // What the real `UserManager.removeUser()` does: clear the stored user, which notifies every
  // `userUnloaded` listener synchronously, and only then resolve.
  userManager.userManager.removeUser.mockImplementation(() => {
    handlers.unloaded.forEach((h) => h());
    return Promise.resolve();
  });
  // jsdom's own default is `"prerender"`, not `"visible"` - each test that cares sets this itself.
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(async () => {
  await unmount();
});

/** The guard plus a marker only a signed-in, non-expired render shows - so a test can tell "redirected
 * to sign in" apart from "rendered the workspace" without inspecting `AuthContext` directly. */
function app() {
  return (
    <AuthProvider>
      <RequireAuth>
        <div>workspace</div>
      </RequireAuth>
    </AuthProvider>
  );
}

describe("silent renewal being rejected by Keycloak", () => {
  it("clears the stale session and redirects to sign in, once the token endpoint actually says no", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));

    const container = await render(app());
    expect(container.textContent).toContain("workspace");
    expect(userManager.userManager.signinRedirect).not.toHaveBeenCalled();

    // The event `oidc-client-ts` raises when a renewal attempt fails - here, with the one error shape
    // that means Keycloak was actually reached and refused the refresh grant (the SSO session is
    // genuinely gone, not merely a request that did not complete).
    await interact(() => handlers.silentRenewError.forEach((h) => h(tokenEndpointRejection())));

    // The chain this item's report requires: `silentRenewError` -> `removeUser()` -> `userUnloaded` ->
    // `user === null` -> `RequireAuth`'s existing redirect. Not a second, independent redirect call
    // wired up inside the new handler itself.
    expect(userManager.userManager.removeUser).toHaveBeenCalledTimes(1);
    expect(userManager.userManager.signinRedirect).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("workspace");
  });
});

describe("silent renewal failing without a real answer from Keycloak", () => {
  it("does not sign the operator out over a single dropped renewal attempt", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));

    const container = await render(app());

    // A plain `Error`, not `ErrorResponse` - the shape a request that never got a response produces
    // (a dropped fetch, exactly what a throttled/backgrounded tab causes), which is not evidence the
    // SSO session is dead. This is the case the first version of this fix got wrong.
    await interact(() => handlers.silentRenewError.forEach((h) => h(new Error("network error"))));

    expect(userManager.userManager.removeUser).not.toHaveBeenCalled();
    expect(userManager.userManager.signinRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("workspace");
  });
});

describe("an already-expired user restored from storage", () => {
  it("redirects to sign in instead of rendering the stale session behind it", async () => {
    // No `silentRenewError` fires here at all - this is the gap `RequireAuth`'s own `user.expired`
    // check exists for: a page load restores a `User` from `sessionStorage` whose `expires_at` is
    // already in the past, before any renewal attempt has had a chance to run.
    userManager.userManager.getUser.mockResolvedValue(signedIn(true));

    const container = await render(app());

    expect(userManager.userManager.signinRedirect).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("workspace");
  });
});

describe("the tab regaining visibility", () => {
  it("proactively asks for a fresh renewal, rather than trusting a background timer the browser was free to throttle", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));

    await render(app());
    expect(userManager.userManager.signinSilent).not.toHaveBeenCalled();

    await interact(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(userManager.userManager.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("ignores the transition while the tab is still hidden", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });

    await render(app());
    await interact(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(userManager.userManager.signinSilent).not.toHaveBeenCalled();
  });

  it("signs out when the catch-up renewal gets a real rejection from Keycloak", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));
    userManager.userManager.signinSilent.mockRejectedValue(tokenEndpointRejection());

    const container = await render(app());
    await interact(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(userManager.userManager.removeUser).toHaveBeenCalledTimes(1);
    expect(userManager.userManager.signinRedirect).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("workspace");
  });

  it("stays signed in when the catch-up renewal merely fails to complete", async () => {
    userManager.userManager.getUser.mockResolvedValue(signedIn(false));
    userManager.userManager.signinSilent.mockRejectedValue(new Error("network error"));

    const container = await render(app());
    await interact(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(userManager.userManager.removeUser).not.toHaveBeenCalled();
    expect(userManager.userManager.signinRedirect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("workspace");
  });
});
