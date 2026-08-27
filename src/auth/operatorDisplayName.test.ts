import { describe, expect, it } from "vitest";
import type { User } from "oidc-client-ts";
import { operatorDisplayName } from "./operatorDisplayName.js";

function userWith(profile: Record<string, unknown>): User {
  return { profile } as unknown as User;
}

describe("operatorDisplayName", () => {
  it("prefers the real name over the Keycloak login name", () => {
    expect(
      operatorDisplayName(userWith({ sub: "sub-1", preferred_username: "golyakoff", name: "Andrey Golyakov" })),
    ).toBe("Andrey Golyakov");
  });

  it("falls back to preferred_username when the provider has no name claim", () => {
    expect(operatorDisplayName(userWith({ sub: "sub-1", preferred_username: "golyakoff" }))).toBe("golyakoff");
  });

  it("falls back to the subject id when neither name nor preferred_username is present", () => {
    expect(operatorDisplayName(userWith({ sub: "sub-1" }))).toBe("sub-1");
  });

  it("falls back to a generic label for no signed-in user at all", () => {
    expect(operatorDisplayName(null)).toBe("Signed in");
  });
});
