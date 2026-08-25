import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupPage } from "./SignupPage.js";
import { byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `10-03`: the public, pre-account route - `adr/0023`'s fourth console surface. Two properties are
 * worth a test and the styling is not:
 *
 * **It collects nothing.** `adr/0028` put every credential field on Keycloak's own hosted page, and
 * the console's whole job is a redirect. A password input appearing on this screen would be a
 * decision reversed by accident, and it is the kind of change that looks locally reasonable.
 *
 * **It needs no session, and no providers.** This is the one route in the console a visitor with no
 * Keycloak account at all must be able to render. It is mounted outside `RequireAuth`,
 * `PermissionsProvider` and `OperatorConnectionProvider` (`App.tsx`), so it is rendered here with
 * none of them: a `useAuth()`/`usePermissions()` call added to anything it renders would throw,
 * which is the failure this catches at the only level that can see it.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const userManager = vi.hoisted(() => ({
  userManager: { signinRedirectCallback: vi.fn() },
  keycloakRegistrationRedirect: vi.fn(),
}));

vi.mock("../auth/userManager.js", () => userManager);

function signUp(container: HTMLElement): Promise<void> {
  return interact(() => byText<HTMLButtonElement>(container, "button", "Sign up")?.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  // The real one never resolves in a browser - it hands control to Keycloak mid-promise.
  userManager.keycloakRegistrationRedirect.mockReturnValue(new Promise(() => undefined));
});

afterEach(async () => {
  await unmount();
});

describe("the public sign-up entry point", () => {
  it("renders for a visitor with no session and no providers around it", async () => {
    const container = await render(<SignupPage />);

    expect(byText(container, "button", "Sign up")).not.toBeNull();
  });

  it("asks for no credentials of its own", async () => {
    const container = await render(<SignupPage />);

    expect(container.querySelector("input[type='password']")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("hands the visitor to Keycloak's hosted registration page", async () => {
    const container = await render(<SignupPage />);

    await signUp(container);

    expect(userManager.keycloakRegistrationRedirect).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second redirect while the first is in flight", async () => {
    const container = await render(<SignupPage />);

    await signUp(container);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Opening sign-up…")?.click());

    expect(userManager.keycloakRegistrationRedirect).toHaveBeenCalledTimes(1);
  });

  it("says so when the sign-up page cannot be opened, instead of a button that does nothing", async () => {
    // Keycloak unreachable, a realm renamed, an authorization endpoint that moved
    // (`registrationUrl.ts` throws on the last one). Before this the rejection was discarded and
    // the visitor - the one person here who cannot ask an operator what happened - saw no change
    // at all.
    userManager.keycloakRegistrationRedirect.mockRejectedValue(new Error("failed to fetch discovery document"));

    const container = await render(<SignupPage />);
    await signUp(container);

    expect(container.textContent).toContain("Could not open the sign-up page");
    expect(container.textContent).toContain("failed to fetch discovery document");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    // And it can be tried again.
    expect(byText(container, "button", "Sign up")).not.toBeNull();
  });
});
