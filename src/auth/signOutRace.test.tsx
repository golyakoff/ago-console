import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { useAuth } from "./AuthContext.js";
import { AuthProvider } from "./AuthProvider.js";
import { RequireAuth } from "./RequireAuth.js";
import { interact, render, unmount, byText } from "../testing/dom.js";

/**
 * `23-51`: pressing **Выйти** almost never worked the first time. Sometimes twice, sometimes three
 * times — and the varying count is the tell: it was a race, so every press was a fresh coin toss.
 *
 * **The ordering is the whole defect, and it is why no existing test could have caught it.**
 * `oidc-client-ts`'s `signoutRedirect` reads the stored user (for the `id_token_hint`), then
 * `await`s `removeUser()`, and only *then* navigates. That `removeUser` fires `userUnloaded` while
 * the browser is still on the page, so `user` goes `null` — and `RequireAuth` did exactly what it is
 * written to do with a null user: redirected to **sign in**. Keycloak's SSO cookie was still valid,
 * because nothing had ended that session yet, so it handed the operator straight back into the
 * console they had just asked to leave.
 *
 * Every other test in this repository mocks `userManager` with plain `vi.fn()`s that resolve without
 * firing anything. That mock cannot reproduce this, which is precisely why the suite was green
 * through a defect the author hit daily. **So the fake here fires `userUnloaded` before it resolves,
 * exactly as the real library does** — the test is worth no more than that fidelity.
 */

const handlers = vi.hoisted(() => ({ unloaded: [] as (() => void)[] }));

const userManager = vi.hoisted(() => ({
  userManager: {
    getUser: vi.fn(),
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
    events: {
      addUserLoaded: vi.fn(),
      removeUserLoaded: vi.fn(),
      addUserUnloaded: vi.fn((h: () => void) => handlers.unloaded.push(h)),
      removeUserUnloaded: vi.fn(),
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

function signedIn(): User {
  return { access_token: "token", profile: { sub: "sub" } } as unknown as User;
}

/** What the real library does, in the real order: clear the stored user (which notifies every
 * listener synchronously), and only then navigate away. */
function signOutTheWayTheLibraryDoes() {
  return new Promise<void>((resolve) => {
    handlers.unloaded.forEach((h) => h());
    resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.unloaded = [];
  userManager.userManager.getUser.mockResolvedValue(signedIn());
  userManager.userManager.signinRedirect.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

/** Renders the guard with a button that signs out, the way `ShellIdentity` does. */
function app() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SignOutButton />
      </RequireAuth>
    </AuthProvider>
  );
}

function SignOutButton() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>Выйти</button>;
}

describe("signing out", () => {
  it("does not sign the operator straight back in, when the library clears the user before it navigates", async () => {
    userManager.userManager.signoutRedirect.mockImplementation(signOutTheWayTheLibraryDoes);

    const container = await render(app());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Выйти")?.click());

    // The assertion that fails against the old code. `signinRedirect` was called because the guard
    // saw a null user and could not tell "on the way out" from "never signed in".
    expect(userManager.userManager.signinRedirect).not.toHaveBeenCalled();
    expect(userManager.userManager.signoutRedirect).toHaveBeenCalledTimes(1);
  });

  it("says which way the operator is travelling, in their own language", async () => {
    userManager.userManager.signoutRedirect.mockImplementation(signOutTheWayTheLibraryDoes);

    const container = await render(app());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Выйти")?.click());

    // This tree has no `StringsProvider`, so `useStrings()` falls through to the English table -
    // which is what makes this an assertion about *direction* rather than about language. Until this
    // item the label was a hardcoded English literal that said "Signing in…" in both directions, so
    // it was wrong twice over: about the language on every Russian screen, and about the fact itself
    // while somebody was leaving.
    //
    // The Russian wording needs no test of its own: `ConsoleStrings` declares both keys, so `ru.ts`
    // cannot compile without them. The compiler is the guarantee, not a duplicate assertion here.
    expect(container.textContent).toContain("Signing out…");
    expect(container.textContent).not.toContain("Signing in…");
  });

  it("hands the page back when the redirect never happens, rather than stranding it on a spinner", async () => {
    // Keycloak unreachable, the navigation blocked. The operator is still signed in, so pretending
    // otherwise forever would be worse than admitting the sign-out did not happen: the guard resumes
    // and does what it always does with a session that is gone.
    userManager.userManager.signoutRedirect.mockImplementation(() => {
      handlers.unloaded.forEach((h) => h());
      return Promise.reject(new Error("network down"));
    });

    const container = await render(app());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Выйти")?.click());

    expect(userManager.userManager.signinRedirect).toHaveBeenCalled();
  });
});
