import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { InstallSnippetPage } from "./InstallSnippetPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";
import type { User } from "oidc-client-ts";

/**
 * `10-06`. The gate itself (`site:configure`, permission-still-loading, refused/allowed) is already
 * covered by `permissionGating.test.tsx`'s own shared table and is not repeated here - this file is
 * the screen's own content: what it shows once permitted, and what the copy button does.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
    faqApiBaseUrl: null,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const installationApi = vi.hoisted(() => ({ fetchSiteInstallation: vi.fn() }));

vi.mock("../api/operatorsApi.js", () => operatorsApi);
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/installationApi.js", () => installationApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let writeTextMock: ReturnType<typeof vi.fn>;

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function page(): ReactNode {
  return (
    <Signed>
      <PermissionsProvider>
        <InstallSnippetPage />
      </PermissionsProvider>
    </Signed>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: ["site:configure"], siteId: SITE_ID });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  installationApi.fetchSiteInstallation.mockResolvedValue({
    publicKey: "shop_7f3a",
    allowedOrigins: ["https://tenant.example"],
    firstSeenAt: "2026-08-01T09:00:00.000Z",
    lastSeenAt: "2026-09-04T09:00:00.000Z",
    lastRefusedOrigin: null,
    lastRefusedOriginAt: null,
    usedRecently: false,
    state: "SeenAndQuiet",
  });
  // jsdom does not implement the Clipboard API - every browser this console actually ships to does,
  // so this stands in for it rather than skipping the assertion. Stored in its own variable, not read
  // back off `navigator.clipboard` at assertion time - a bare `expect(navigator.clipboard.writeText)`
  // is an unbound method reference, exactly the pattern `@typescript-eslint/unbound-method` exists to
  // catch, whatever the object turns out to be.
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
});

afterEach(async () => {
  await unmount();
});

describe("the install screen", () => {
  it("shows the site's own public key and configured origin", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("shop_7f3a");
    expect(container.textContent).toContain("https://tenant.example");
  });

  // `10-06`'s own Done-when: "the configured origin is visible on the same screen as the snippet" -
  // both panels render together, not one gated behind the other.
  it("shows the key and the origin on the same screen", async () => {
    const container = await render(page());

    const body = container.textContent ?? "";
    expect(body.indexOf("shop_7f3a")).toBeGreaterThan(-1);
    expect(body.indexOf("https://tenant.example")).toBeGreaterThan(-1);
  });

  it("shows every configured origin when a site has more than one", async () => {
    installationApi.fetchSiteInstallation.mockResolvedValue({
      publicKey: "shop_7f3a",
      allowedOrigins: ["https://tenant.example", "https://www.tenant.example"],
    });

    const container = await render(page());

    expect(container.textContent).toContain("https://tenant.example");
    expect(container.textContent).toContain("https://www.tenant.example");
  });

  it("copies the site key to the clipboard and confirms it", async () => {
    const container = await render(page());

    await interact(() => one<HTMLButtonElement>(container, "button").click());

    expect(writeTextMock).toHaveBeenCalledWith("shop_7f3a");
    expect(container.textContent).toContain("Copied to clipboard.");
  });

  // `adr/0092`/`#324`: the tag this screen shipped without, because nothing served the widget at a
  // public URL. Asserted as one exact string rather than by parts: a snippet that is *nearly* right -
  // wrong path, wrong filename, the site key missing - is a snippet a tenant pastes and then cannot
  // debug, and `ago-landing` handed out `widget.js` for weeks under a name that never existed.
  it("prints the exact snippet, composed from the API origin", async () => {
    const container = await render(page());

    expect(container.textContent).toContain(
      '<script src="https://api.test.invalid/widget/widget.js" data-site="shop_7f3a" async></script>',
    );
  });

  // The snippet is only useful if it survives the round trip through a clipboard, and the button is
  // what anybody actually uses - the `<pre>` wraps, so reading it off the screen is not the path.
  it("copies the snippet, not the key, from the snippet panel's own button", async () => {
    const container = await render(page());
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));

    await interact(() => buttons[buttons.length - 1].click());

    expect(writeTextMock).toHaveBeenCalledWith(
      '<script src="https://api.test.invalid/widget/widget.js" data-site="shop_7f3a" async></script>',
    );
  });

  it("shows a load error instead of the panels when the request fails", async () => {
    installationApi.fetchSiteInstallation.mockRejectedValue(new Error("network down"));

    const container = await render(page());

    expect(container.textContent).toContain("Failed to load your installation details.");
    expect(byText(container, "code", "shop_7f3a")).toBeNull();
  });

  /**
   * `23-06`'s own Done-when: "`/settings/install` renders every state, and *never seen* is the one a
   * brand-new tenant gets on day one." Four states, one test each - the resolved `state` alone decides
   * the wording; no other field on the seeded DTO changes between them.
   */
  describe("the install status panel (23-06)", () => {
    it("tells a brand-new tenant the script has not arrived yet, worded as a next step", async () => {
      installationApi.fetchSiteInstallation.mockResolvedValue({
        publicKey: "shop_7f3a",
        allowedOrigins: ["https://tenant.example"],
        firstSeenAt: null,
        lastSeenAt: null,
        lastRefusedOrigin: null,
        lastRefusedOriginAt: null,
        usedRecently: false,
        state: "NotSeenYet",
      });

      const container = await render(page());

      expect(container.textContent).toContain("Your script has not arrived yet");
      // Not a failure-worded page - the key/snippet panels a fresh tenant needs are still on screen.
      expect(container.textContent).toContain("shop_7f3a");
    });

    it("shows an installed-and-quiet tenant how long it has been since the widget was last seen", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-04T09:00:00.000Z"));
      installationApi.fetchSiteInstallation.mockResolvedValue({
        publicKey: "shop_7f3a",
        allowedOrigins: ["https://tenant.example"],
        firstSeenAt: "2026-08-01T09:00:00.000Z",
        lastSeenAt: "2026-09-02T09:00:00.000Z",
        lastRefusedOrigin: null,
        lastRefusedOriginAt: null,
        usedRecently: false,
        state: "SeenAndQuiet",
      });

      const container = await render(page());

      expect(container.textContent).toContain("Your widget is installed and reporting in.");
      expect(container.textContent).toContain("Last seen");
      expect(container.textContent).toContain("2d");
      expect(container.textContent).toContain("First seen");
      vi.useRealTimers();
    });

    it("names the refused origin and does not soften it as a mere quiet period", async () => {
      installationApi.fetchSiteInstallation.mockResolvedValue({
        publicKey: "shop_7f3a",
        allowedOrigins: ["https://tenant.example"],
        firstSeenAt: null,
        lastSeenAt: null,
        lastRefusedOrigin: "https://www.tenant.example",
        lastRefusedOriginAt: "2026-09-04T09:00:00.000Z",
        usedRecently: false,
        state: "EveryRequestRefused",
      });

      const container = await render(page());

      expect(container.textContent).toContain("https://www.tenant.example");
      expect(container.textContent).toContain("is being refused");
    });

    /** `decisions.md`'s two-facts amendment: a channel-only tenant must never be told to fix an
     * install that was never broken. */
    it("reassures a channel-only tenant instead of telling them the script never arrived", async () => {
      installationApi.fetchSiteInstallation.mockResolvedValue({
        publicKey: "shop_7f3a",
        allowedOrigins: ["https://tenant.example"],
        firstSeenAt: null,
        lastSeenAt: null,
        lastRefusedOrigin: null,
        lastRefusedOriginAt: null,
        usedRecently: true,
        state: "NeverSeenButInUse",
      });

      const container = await render(page());

      expect(container.textContent).toContain("conversations are already reaching you through a");
      expect(container.textContent).not.toContain("Your script has not arrived yet");
    });
  });
});
