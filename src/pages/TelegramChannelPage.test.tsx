import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { TelegramChannelPage, TELEGRAM_CHANNEL_PERMISSION } from "./TelegramChannelPage.js";
import { ApiProblemError } from "../api/telegramChannelApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-36`: `/channels/telegram`. Modeled on `OperatorsTeamPage.test.tsx` for the permission-gated-
 * page shape (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked) - plus this item's
 * own new part, the thing its own brief demanded be demonstrated rather than asserted: that the token
 * a tenant types is never, anywhere, rendered back onto the page, in any of the three states this
 * screen can be in (not connected, connected-and-verified, connected-but-refused).
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
const telegramChannelApi = vi.hoisted(() => ({
  fetchTelegramChannelStatus: vi.fn(),
  connectTelegramChannel: vi.fn(),
  disconnectTelegramChannel: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/telegramChannelApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/telegramChannelApi.js")>("../api/telegramChannelApi.js");
  return { ...actual, ...telegramChannelApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREDENTIAL_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
// Obviously synthetic - shaped like a real Telegram bot token (digits, a colon, a base64-ish tail)
// but not one, the same "unmistakable for a real one" discipline CLAUDE.md requires of any fixture
// standing in for a secret.
const FAKE_TOKEN = "000000000:AAFakeNotARealTelegramBotTokenXXXXXXXXXX";

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
 * `<Link to="/">`, which throws outside a router context (`OperatorsTeamPage.test.tsx`'s own `page()`
 * carries the same wrapper for the same reason). */
function page(): ReactNode {
  return (
    <MemoryRouter>
      <Signed>
        <PermissionsProvider>
          <TelegramChannelPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function notConnected() {
  telegramChannelApi.fetchTelegramChannelStatus.mockResolvedValue({
    connected: false,
    channelCredentialId: null,
    createdAt: null,
    verified: null,
    unreachable: false,
    refusalReason: null,
    checkedAt: "2026-09-07T12:00:00Z",
  });
}

function connectedAndVerified() {
  telegramChannelApi.fetchTelegramChannelStatus.mockResolvedValue({
    connected: true,
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-01T12:00:00Z",
    verified: true,
    unreachable: false,
    refusalReason: null,
    checkedAt: "2026-09-07T12:00:00Z",
  });
}

function connectedButRefused() {
  telegramChannelApi.fetchTelegramChannelStatus.mockResolvedValue({
    connected: true,
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-01T12:00:00Z",
    verified: false,
    unreachable: false,
    refusalReason: "Telegram refused the token (401): Unauthorized",
    checkedAt: "2026-09-07T12:00:00Z",
  });
}

/** `adr/0143`: the third live-check state - the bound fired, or Telegram/the relay did not answer at
 * all. `verified`/`refusalReason` are both `null` here, exactly as `TelegramChannelStatusResponse`'s
 * own remarks require - this fixture would be wrong (and would silently pass as "refused") if it set
 * either one. */
function connectedButUnreachable() {
  telegramChannelApi.fetchTelegramChannelStatus.mockResolvedValue({
    connected: true,
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-01T12:00:00Z",
    verified: null,
    unreachable: true,
    refusalReason: null,
    checkedAt: "2026-09-07T12:00:00Z",
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
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [TELEGRAM_CHANNEL_PERMISSION], siteId: SITE_ID });
  notConnected();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without channel:manage, and never calls fetchTelegramChannelStatus", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to manage this site's channels.");
    expect(telegramChannelApi.fetchTelegramChannelStatus).not.toHaveBeenCalled();
  });

  it("offers it, and loads status, to an operator holding channel:manage", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Bot token");
    expect(telegramChannelApi.fetchTelegramChannelStatus).toHaveBeenCalledWith("token", SITE_ID);
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
    telegramChannelApi.connectTelegramChannel.mockResolvedValue({
      channelCredentialId: CREDENTIAL_ID,
      createdAt: "2026-09-07T12:00:00Z",
    });

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    // The second (post-connect) status read reports the newly-connected, verified state.
    connectedAndVerified();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(telegramChannelApi.connectTelegramChannel).toHaveBeenCalledWith("token", SITE_ID, FAKE_TOKEN);
    expect(telegramChannelApi.fetchTelegramChannelStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Connected");
  });

  it("shows the server's own refusal text and does not switch to a connected view when the token is rejected", async () => {
    telegramChannelApi.connectTelegramChannel.mockRejectedValue(
      new ApiProblemError("ChannelCredential.InvalidToken", "Telegram refused the token (401): Unauthorized", 400),
    );

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), "bad-token"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).toContain("Telegram refused the token (401): Unauthorized");
    // Still on the not-connected form - the token field is still present.
    expect(container.textContent).toContain("Bot token");
  });

  /** `23-36`'s own demand: "a stored credential never comes back out through any read path" -
   * checked here at the one layer a reader can see directly, the rendered page. Whatever the token
   * was, it must never appear in the DOM after being typed and submitted - not echoed by the connect
   * response (which carries no such field to begin with - see `telegramChannelApi.ts`'s own remarks),
   * and not left sitting in the now-cleared input. */
  it("never renders the token anywhere on the page once it has been typed and submitted", async () => {
    telegramChannelApi.connectTelegramChannel.mockResolvedValue({
      channelCredentialId: CREDENTIAL_ID,
      createdAt: "2026-09-07T12:00:00Z",
    });

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    connectedAndVerified();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).not.toContain(FAKE_TOKEN);
    expect(container.innerHTML).not.toContain(FAKE_TOKEN);
  });
});

describe("connected", () => {
  it("shows the verified badge and the connected-since date when Telegram just confirmed the bot", async () => {
    connectedAndVerified();

    const container = await render(page());

    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Connected since");
    expect(container.textContent).not.toContain("Not responding");
  });

  it("shows the not-responding badge and Telegram's own refusal text when the live check just failed", async () => {
    connectedButRefused();

    const container = await render(page());

    expect(container.textContent).toContain("Not responding");
    expect(container.textContent).toContain("Telegram said:");
    expect(container.textContent).toContain("Telegram refused the token (401): Unauthorized");
  });

  /** `adr/0143`: the coordinator's own requirement - a timeout/unreachable provider must render as a
   * plainly distinct message from "this token is invalid", never the same "Not responding" badge or
   * "Telegram said:" text a real refusal gets. A regression that collapsed the two states back into
   * one would make this test (and the one right above it) fail on whichever assertion the collapse
   * broke. */
  it("shows a distinct could-not-reach badge, never the refused message, when the live check could not complete", async () => {
    connectedButUnreachable();

    const container = await render(page());

    expect(container.textContent).toContain("Could not check just now");
    expect(container.textContent).toContain("AGO could not reach Telegram just now");
    expect(container.textContent).not.toContain("Not responding");
    expect(container.textContent).not.toContain("Telegram said:");
  });

  it("disconnects after confirming, states the consequence first, and returns to the not-connected form", async () => {
    connectedAndVerified();
    telegramChannelApi.disconnectTelegramChannel.mockResolvedValue(undefined);

    const container = await render(page());
    // The row action and the dialog's own confirm button share the label "Disconnect"
    // (`OperatorsTeamPage.test.tsx`'s own "Remove"/"Remove" precedent for the identical shape) - the
    // panel action is the only "Disconnect" button in the document before the dialog opens.
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Your bot will stop delivering messages immediately");
    expect(telegramChannelApi.disconnectTelegramChannel).not.toHaveBeenCalled();

    notConnected();
    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Disconnect");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(telegramChannelApi.disconnectTelegramChannel).toHaveBeenCalledWith("token", SITE_ID, CREDENTIAL_ID);
    expect(container.textContent).toContain("Bot token");
  });

  it("cancelling the disconnect dialog calls nothing", async () => {
    connectedAndVerified();

    const container = await render(page());
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await interact(() => one<HTMLDialogElement>(container, "dialog[open]"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(telegramChannelApi.disconnectTelegramChannel).not.toHaveBeenCalled();
  });
});
