import { describe, expect, it } from "vitest";
import { registrationUrlFrom } from "./registrationUrl.js";

/**
 * `10-03`: the one piece of the signup redirect that can be wrong without anything saying so.
 *
 * The property under test is not "the string contains `registrations`" - it is that the *same*
 * Authorization Code request `oidc-client-ts` built (its PKCE challenge, its `state`, its
 * `redirect_uri`) arrives at Keycloak's registration endpoint unaltered, because those parameters
 * are what `CallbackPage`'s `signinRedirectCallback()` verifies against on the way back. Dropping
 * one produces a signup that completes on Keycloak's side and then fails at the console's, which is
 * the worst place to find out.
 */
const AUTHORIZE = "https://auth.example.test/realms/ago/protocol/openid-connect/auth";
const QUERY =
  "?client_id=ago-console&redirect_uri=https%3A%2F%2Fconsole.example.test%2Fcallback" +
  "&response_type=code&scope=openid+profile+email&state=abc123&code_challenge=xyz789&code_challenge_method=S256";

describe("deriving Keycloak's registration URL from its authorization request", () => {
  it("points at the registration endpoint of the same realm", () => {
    const url = new URL(registrationUrlFrom(`${AUTHORIZE}${QUERY}`));

    expect(url.pathname).toBe("/realms/ago/protocol/openid-connect/registrations");
    expect(url.host).toBe("auth.example.test");
  });

  it("carries the PKCE challenge, state and redirect_uri through unchanged", () => {
    const url = new URL(registrationUrlFrom(`${AUTHORIZE}${QUERY}`));

    expect(url.searchParams.get("code_challenge")).toBe("xyz789");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://console.example.test/callback");
    expect(url.searchParams.get("client_id")).toBe("ago-console");
  });

  it("rewrites the path and not the host, on a realm hosted at auth.<domain>", () => {
    // `auth.reserve-me.ru` is this project's own Keycloak host (`adr/0026`), so a substring match
    // against the whole URL rather than against the pathname would rewrite the host of the live
    // deployment specifically.
    const url = new URL(registrationUrlFrom("https://auth.reserve-me.ru/realms/ago/protocol/openid-connect/auth"));

    expect(url.host).toBe("auth.reserve-me.ru");
    expect(url.pathname).toBe("/realms/ago/protocol/openid-connect/registrations");
  });

  it("refuses an authorization endpoint that is not where it expects, rather than returning the sign-in URL", () => {
    // Fail closed. The silent version of this - `String.replace` finding no match - sends a visitor
    // with no account to a *login* form, which they cannot complete and cannot diagnose.
    expect(() => registrationUrlFrom("https://auth.example.test/realms/ago/some/other/endpoint")).toThrow(
      /not \/protocol\/openid-connect\/auth/,
    );
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => registrationUrlFrom("/protocol/openid-connect/auth")).toThrow();
  });
});
