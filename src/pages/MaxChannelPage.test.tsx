import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { MaxChannelPage, MAX_CHANNEL_PERMISSION } from "./MaxChannelPage.js";
import { ApiProblemError } from "../api/maxChannelApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-09`: `/channels/max`. Modeled directly on `TelegramChannelPage.test.tsx` - same permission-gated-
 * page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked), same "the token a
 * tenant types is never, anywhere, rendered back onto the page" demand.
 *
 * Deliberately missing here: the three-state live-check suite (`connectedButRefused`/
 * `connectedButUnreachable` and their badges) `TelegramChannelPage.test.tsx` has. `MaxChannelPage`
 * itself only ever renders one connected state - see its own doc comment for why
 * `MaxChannelEndpoints.HandleStatusAsync` cannot re-verify the token the way Telegram's status endpoint
 * does. Testing three states this screen cannot produce would document a capability it does not have.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const operatorsApi = vi.hoisted(() => ({ fetchMyPermissions: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));
const tenanciesApi = vi.hoisted(() => ({ fetchMyTenancies: vi.fn() }));
const maxChannelApi = vi.hoisted(() => ({
  fetchMaxChannelStatus: vi.fn(),
  connectMaxChannel: vi.fn(),
  disconnectMaxChannel: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/maxChannelApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/maxChannelApi.js")>("../api/maxChannelApi.js");
  return { ...actual, ...maxChannelApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREDENTIAL_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
// Obviously synthetic - shaped like a real MAX bot token (a long opaque string) but not one, the same
// "unmistakable for a real one" discipline CLAUDE.md requires of any fixture standing in for a secret.
const FAKE_TOKEN = "fake-max-bot-token-not-a-real-secret-0000000000";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function Signed({ children }: { children: ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/** Wrapped in a `MemoryRouter` - the permission-refusal branch (`AccessRefusal`) renders a
 * `<Link to="/">`, which throws outside a router context (`TelegramChannelPage.test.tsx`'s own `page()`
 * carries the same wrapper for the same reason). */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <MaxChannelPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function notConnected() {
  maxChannelApi.fetchMaxChannelStatus.mockResolvedValue({
    connected: false,
    channelCredentialId: null,
    createdAt: null,
  });
}

function connected() {
  maxChannelApi.fetchMaxChannelStatus.mockResolvedValue({
    connected: true,
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-01T12:00:00Z",
  });
}

function tokenField(container: HTMLElement): HTMLInputElement {
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Bot token");
  if (label === null) {
    throw new Error("no 'Bot token' field label found");
  }
  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLInputElement)) {
    throw new Error("'Bot token' field is not an <input>");
  }
  return field;
}

// `WidgetConfigPage.test.tsx`'s own precedent: a direct `.value = x` assignment is swallowed by
// React's tracked setter as "no change", so no `onChange` ever fires.
function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [MAX_CHANNEL_PERMISSION], siteId: SITE_ID });
  notConnected();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without channel:manage, and never calls fetchMaxChannelStatus", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to manage this site's channels.");
    expect(maxChannelApi.fetchMaxChannelStatus).not.toHaveBeenCalled();
  });

  it("offers it, and loads status, to an operator holding channel:manage", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Bot token");
    expect(maxChannelApi.fetchMaxChannelStatus).toHaveBeenCalledWith("token", SITE_ID);
  });
});

describe("not connected", () => {
  it("offers the token field and a disabled connect button until something is typed", async () => {
    const container = await render(page());

    const connectButton = byText<HTMLButtonElement>(container, "button", "Connect");
    expect(connectButton).not.toBeNull();
    expect(connectButton.disabled).toBe(true);
  });

  it("connects with the typed token, then reloads status", async () => {
    maxChannelApi.connectMaxChannel.mockResolvedValue({
      channelCredentialId: CREDENTIAL_ID,
      createdAt: "2026-09-07T12:00:00Z",
    });

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    // The second (post-connect) status read reports the newly-connected state.
    connected();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(maxChannelApi.connectMaxChannel).toHaveBeenCalledWith("token", SITE_ID, FAKE_TOKEN);
    expect(maxChannelApi.fetchMaxChannelStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Connected");
  });

  /** `25-09`'s own demand: a wrong token is refused at entry with what MAX said, not accepted and
   * silently dead - `MaxChannelEndpoints.HandleConnectAsync`'s own rollback on
   * `MaxSubscriptionRejectedException`, surfaced verbatim the same way
   * `TelegramChannelPage.test.tsx`'s identical test proves for Telegram's `getMe` refusal. */
  it("shows the server's own refusal text and does not switch to a connected view when the token is rejected", async () => {
    maxChannelApi.connectMaxChannel.mockRejectedValue(
      new ApiProblemError("ChannelCredential.InvalidToken", "MAX refused the webhook subscription (401): Unauthorized", 400),
    );

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), "bad-token"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).toContain("MAX refused the webhook subscription (401): Unauthorized");
    // Still on the not-connected form - the token field is still present.
    expect(container.textContent).toContain("Bot token");
  });

  /** `25-09`'s own demand: "a stored credential never comes back out through any read path" - checked
   * here at the one layer a reader can see directly, the rendered page. Whatever the token was, it must
   * never appear in the DOM after being typed and submitted - not echoed by the connect response
   * (which carries no such field to begin with - see `maxChannelApi.ts`'s own remarks), and not left
   * sitting in the now-cleared input. */
  it("never renders the token anywhere on the page once it has been typed and submitted", async () => {
    maxChannelApi.connectMaxChannel.mockResolvedValue({
      channelCredentialId: CREDENTIAL_ID,
      createdAt: "2026-09-07T12:00:00Z",
    });

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    connected();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).not.toContain(FAKE_TOKEN);
    expect(container.innerHTML).not.toContain(FAKE_TOKEN);
  });
});

describe("connected", () => {
  /** Deliberately the only badge/state this suite proves - see this file's own top-of-file remarks on
   * why `TelegramChannelPage.test.tsx`'s "not responding"/"could not check" cases have no analogue
   * here: `MaxChannelPage` only ever has one connected state to show. Proven together with the token
   * absence, since a connected credential is the one state that could plausibly leak it. */
  it("shows the connected badge and the connected-since date, and never the token, once a credential exists", async () => {
    connected();

    const container = await render(page());

    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Connected since");
    expect(container.textContent).not.toContain(FAKE_TOKEN);
  });

  it("disconnects after confirming, states the consequence first, and returns to the not-connected form", async () => {
    connected();
    maxChannelApi.disconnectMaxChannel.mockResolvedValue(undefined);

    const container = await render(page());
    // The row action and the dialog's own confirm button share the label "Disconnect"
    // (`TelegramChannelPage.test.tsx`'s own identical precedent) - the panel action is the only
    // "Disconnect" button in the document before the dialog opens.
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Your bot will stop delivering messages immediately");
    expect(maxChannelApi.disconnectMaxChannel).not.toHaveBeenCalled();

    notConnected();
    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Disconnect");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(maxChannelApi.disconnectMaxChannel).toHaveBeenCalledWith("token", SITE_ID, CREDENTIAL_ID);
    expect(container.textContent).toContain("Bot token");
  });

  it("cancelling the disconnect dialog calls nothing", async () => {
    connected();

    const container = await render(page());
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await interact(() => one<HTMLDialogElement>(container, "dialog[open]"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(maxChannelApi.disconnectMaxChannel).not.toHaveBeenCalled();
  });
});
