import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, CenteredShell } from "./AppShell.js";
import { render, unmount } from "../testing/dom.js";

/**
 * The `8-06` public-demo band, and every kind of account that can read it.
 *
 * `12-04` found that one wording was false for one reader and gave it a second. `23-42` removed it
 * for the platform owner. **Neither could fix the real problem, which is that the console had no way
 * to ask the question**: both inferred the answer from *who is not the platform owner*, so a real
 * tenant signing in with their own account was told their login is published on the demo pages. The
 * author found that by doing exactly that.
 *
 * `23-45` moved the question to the API, which answers one fact: are *this site's* console
 * credentials printed on a public page. This file is that fact's contract at the shell, one test per
 * kind of account. The API side - which sites answer true, and why a minted demo tenant does not -
 * is `GetMyPermissionsHandlerTests`; the platform owner's own case is settled a layer up, by
 * `OperatorShell` never having a published site, and is asserted here too so this file is the whole
 * picture rather than most of it.
 *
 * `config.isPublicDemo` is mocked `true` here, unlike every other test file in this repository, which
 * mocks it `false` - this is the only file about the band itself, so it is the only one that needs
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

const PUBLISHED_LOGIN_CLAIM = "Its login is published on the demo pages";
const STRANGERS_CLAIM = "typed by a stranger";

function band(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".ago-demo-notice");
}

afterEach(async () => {
  await unmount();
});

describe("the public demo band, by who is reading it", () => {
  it("is shown to the shared demo shop, whose password really is printed on the demo pages", async () => {
    const container = await render(
      <AppShell credentialsArePublished>
        <p>a page</p>
      </AppShell>,
    );

    expect(band(container)).not.toBeNull();
    expect(container.textContent).toContain(PUBLISHED_LOGIN_CLAIM);
    expect(container.textContent).toContain(STRANGERS_CLAIM);
    expect(container.textContent).toContain("Do not type anything real");
  });

  it("is not shown to a real tenant signed in with their own account", async () => {
    // The report this item came from. Every clause of the band is false for this reader: their login
    // is published nowhere, and the conversations in their console are their own customers'.
    const container = await render(
      <AppShell credentialsArePublished={false}>
        <p>a page</p>
      </AppShell>,
    );

    expect(band(container)).toBeNull();
    expect(container.textContent).not.toContain(PUBLISHED_LOGIN_CLAIM);
    expect(container.textContent).not.toContain(STRANGERS_CLAIM);
    expect(container.textContent).toContain("a page");
  });

  it("is not shown to a minted demo tenant, whose credentials were shown once and published nowhere", async () => {
    // Indistinguishable from the case above at this layer, and that is the point: the console asks
    // one question and the API answers it. What makes a minted tenant answer `false` - it has an
    // expiry, but no published password - is asserted where it is decided, in
    // `GetMyPermissionsHandlerTests`, not guessed at again here.
    const container = await render(
      <AppShell credentialsArePublished={false}>
        <p>a page</p>
      </AppShell>,
    );

    expect(band(container)).toBeNull();
  });

  it("is not shown to the platform owner", async () => {
    // `23-42`. The owner's account is published nowhere, so it answers `false` for the same reason a
    // real tenant does - which is why `23-45` could delete the special case that used to carry this.
    const container = await render(
      <AppShell credentialsArePublished={false}>
        <p>a page</p>
      </AppShell>,
    );

    expect(band(container)).toBeNull();
  });

  it("is not shown when a shell has not passed the fact at all", async () => {
    // The failure direction, asserted rather than trusted - and it is the *opposite* of `12-04`'s.
    // "We do not know whether your password is published" cannot honestly render as "your password is
    // published", so the default is silence. The cost of that silence is paid on the server:
    // `Ago.Chat.Api`'s `DemoTenantOptionsValidator` refuses to start a demo deployment that names no
    // published site, so the band can never go missing through an empty configuration.
    const container = await render(
      <AppShell>
        <p>a page</p>
      </AppShell>,
    );

    expect(band(container)).toBeNull();
  });

  it("is not shown on the pre-session screens, where nobody has been identified yet", async () => {
    // A real loss, recorded rather than glossed: `8-06` wanted this on the sign-in screen, and a
    // reader about to use the published login is no longer warned *before* they use it. Nothing
    // before sign-in knows whose account is coming, and `/signup` is the screen where the old wording
    // was at its most wrong - told to somebody in the act of creating a real tenant. The band appears
    // the instant a published account lands in the console, which is before anything can be typed.
    const container = await render(
      <CenteredShell>
        <p>signing in</p>
      </CenteredShell>,
    );

    expect(band(container)).toBeNull();
  });
});

describe("the band's own switch", () => {
  it("is absent on a deployment that is not the public demo, whatever the account", async () => {
    // `config.isPublicDemo` is the outer gate and `23-45` did not touch it: a real installation
    // serves no band even if this fact somehow arrived true. Asserted by resetting the module mock
    // for this one case rather than by reasoning about it.
    vi.resetModules();
    vi.doMock("../config.js", () => ({
      config: {
        apiBaseUrl: "https://api.test.invalid",
        keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
        keycloakClientId: "ago-console",
        isPublicDemo: false,
      },
    }));
    const { AppShell: FreshAppShell } = await import("./AppShell.js");

    const container = await render(
      <FreshAppShell credentialsArePublished>
        <p>a page</p>
      </FreshAppShell>,
    );

    expect(band(container)).toBeNull();
    vi.doUnmock("../config.js");
    vi.resetModules();
  });
});
