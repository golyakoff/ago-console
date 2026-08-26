import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, CenteredShell } from "./AppShell.js";
import { render, unmount } from "../testing/dom.js";

/**
 * `12-04`: the `8-06` demo strip, which said one thing to everybody and had it be false for one of
 * them.
 *
 * *"Its login is published on the demo pages, so anyone can sign in here"* is true of the shared demo
 * operator login and false of the platform owner's account, which is published nowhere and held by
 * one person. `8-11` had already made the widget's own notice follow the tenant rather than the page
 * for the same reason, and the argument transfers to an identity: a standing disclosure that its
 * reader can personally verify to be wrong teaches them the strip is boilerplate, which costs more
 * than the sentence buys.
 *
 * The sentence that must survive every variant is the one that is true regardless of who is reading -
 * the conversations belong to strangers, and nothing real should be typed here. That is what the strip
 * exists for; the login clause is context around it.
 *
 * `config.isPublicDemo` is mocked `true` here, unlike every other test file in this repository, which
 * mocks it `false` - this is the only file about the notice itself, so it is the only one that needs
 * the build flag that makes it exist at all.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: true,
  },
}));

const SHARED_LOGIN_CLAIM = "Its login is published on the demo pages";
const ALWAYS_TRUE_CLAIM = "typed by a stranger";

afterEach(async () => {
  await unmount();
});

describe("the public demo notice", () => {
  it("says nothing about the reader's own login being published, to the platform owner", async () => {
    const container = await render(
      <AppShell demoNoticeAudience="platform-owner">
        <p>a page</p>
      </AppShell>,
    );

    expect(container.textContent).not.toContain(SHARED_LOGIN_CLAIM);
    expect(container.textContent).toContain("signed in as the platform owner");
    expect(container.textContent).toContain("your own login is published nowhere");
  });

  it("still warns the platform owner about the part that is true for every reader", async () => {
    // The failure this variant could most easily cause: dropping the disclosure instead of correcting
    // it. The owner reads the same strangers' conversations everybody else does.
    const container = await render(
      <AppShell demoNoticeAudience="platform-owner">
        <p>a page</p>
      </AppShell>,
    );

    expect(container.textContent).toContain(ALWAYS_TRUE_CLAIM);
    expect(container.textContent).toContain("Do not type anything real");
  });

  it("keeps the published-login wording for the shared demo login", async () => {
    const container = await render(
      <AppShell demoNoticeAudience="shared-login">
        <p>a page</p>
      </AppShell>,
    );

    expect(container.textContent).toContain(SHARED_LOGIN_CLAIM);
    expect(container.textContent).toContain(ALWAYS_TRUE_CLAIM);
  });

  it("says the stricter thing when no audience is passed at all", async () => {
    // The direction the default has to fail in, asserted rather than trusted: a route added later
    // that never learns about this prop understates nothing.
    const container = await render(
      <AppShell>
        <p>a page</p>
      </AppShell>,
    );

    expect(container.textContent).toContain(SHARED_LOGIN_CLAIM);
  });

  it("says the stricter thing on the pre-session screens, where nobody has been identified yet", async () => {
    const container = await render(
      <CenteredShell>
        <p>signing in</p>
      </CenteredShell>,
    );

    expect(container.textContent).toContain(SHARED_LOGIN_CLAIM);
  });
});
