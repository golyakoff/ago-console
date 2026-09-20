import { useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsProvider } from "../auth/PermissionsProvider.js";
import { VkChannelPage, VK_CHANNEL_PERMISSION } from "./VkChannelPage.js";
import { ApiProblemError } from "../api/vkChannelApi.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `25-15`/`25-65`/`25-179`: `/channels/vk`. Modeled on `MaxChannelPage.test.tsx`'s own shape - same
 * permission-gated-page setup (the real `PermissionsProvider`, `GET /api/v1/operators/me` faked), same
 * "the token a tenant types is never, anywhere, rendered back onto the page" demand.
 *
 * `25-65` added `fetchVkChannelStatus`, the same MAX-shaped `{connected, channelCredentialId,
 * createdAt}` this file's own `notConnected()`/`connectedAndVerified()` helpers fake, mirroring
 * `MaxChannelPage.test.tsx`'s identical helpers. The one real addition beyond that precedent:
 * `describe("connected after a reload")` below, proving the actual reload case - `status` loaded fresh
 * on mount with a connected fixture already mocked, no `connectVkChannel` call anywhere in the test -
 * is what `VkChannelPage`'s own `25-15` gap ("no persisted connected view across a reload") required,
 * and `MaxChannelPage`/`TelegramChannelPage` never had to prove separately from their own "connected"
 * describe block because those screens never had two different sources of "connected" state (`status`
 * vs. `justConnected`) to tell apart the way this one now does.
 *
 * `25-179` (`25-175` having given `VkChannelEndpoints.HandleStatusAsync` the same live check
 * Telegram's/MAX's status routes already had) added the identical three-state live-check suite
 * (`connectedAndVerified`/`connectedButRefused`/`connectedButUnreachable` and their badges)
 * `TelegramChannelPage.test.tsx`/`MaxChannelPage.test.tsx` already prove for their own providers -
 * exercised in `describe("connected after a reload")`, the block closest to MAX's own single-status-
 * source shape, since the badge is driven by `status` alone regardless of `justConnected`.
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
const vkChannelApi = vi.hoisted(() => ({
  fetchVkChannelStatus: vi.fn(),
  connectVkChannel: vi.fn(),
  disconnectVkChannel: vi.fn(),
}));

vi.mock("../api/operatorsApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/operatorsApi.js")>("../api/operatorsApi.js");
  return { ...actual, ...operatorsApi };
});
vi.mock("../api/ownerApi.js", () => ownerApi);
vi.mock("../api/tenanciesApi.js", () => tenanciesApi);
vi.mock("../api/vkChannelApi.js", async () => {
  const actual = await vi.importActual<typeof import("../api/vkChannelApi.js")>("../api/vkChannelApi.js");
  return { ...actual, ...vkChannelApi };
});

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREDENTIAL_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
// Obviously synthetic - shaped like a real VK community access token (a long opaque string) but not
// one, the same "unmistakable for a real one" discipline CLAUDE.md requires of any fixture standing in
// for a secret.
const FAKE_TOKEN = "fake-vk-community-token-not-a-real-secret-0000000000";
const FAKE_WEBHOOK_SECRET = "fake-webhook-secret-not-a-real-secret-1111111111";
const CALLBACK_URL = "https://api.test.invalid/webhooks/vk/cccccccc-cccc-cccc-cccc-cccccccccccc";

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
          <VkChannelPage />
        </PermissionsProvider>
      </Signed>
    </MemoryRouter>
  );
}

function connectResponse() {
  return {
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-12T12:00:00Z",
    callbackUrl: CALLBACK_URL,
    webhookSecret: FAKE_WEBHOOK_SECRET,
  };
}

/** `MaxChannelPage.test.tsx`'s own precedent - `GetChannelCredentialStatusHandler`'s own answer, since
 * `VkChannelStatusDto` never carries `callbackUrl`/`webhookSecret` (`vkChannelApi.ts`'s own remarks). */
function notConnected() {
  vkChannelApi.fetchVkChannelStatus.mockResolvedValue({
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
  vkChannelApi.fetchVkChannelStatus.mockResolvedValue({
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
  vkChannelApi.fetchVkChannelStatus.mockResolvedValue({
    connected: true,
    channelCredentialId: CREDENTIAL_ID,
    createdAt: "2026-09-01T12:00:00Z",
    verified: false,
    unreachable: false,
    refusalReason: "VK refused the token (401): Invalid access_token",
    checkedAt: "2026-09-07T12:00:00Z",
  });
}

/** `25-175`: the third live-check state - the bound fired, or VK/the relay did not answer at all.
 * `verified`/`refusalReason` are both `null` here, exactly as the backend's own response requires -
 * this fixture would be wrong (and would silently pass as "refused") if it set either one. */
function connectedButUnreachable() {
  vkChannelApi.fetchVkChannelStatus.mockResolvedValue({
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
  const label = byText<HTMLLabelElement>(container, ".ago-field__label", "Community access token");
  if (label === null) {
    throw new Error("no 'Community access token' field label found");
  }
  const id = label.getAttribute("for");
  const field = id ? document.getElementById(id) : null;
  if (!(field instanceof HTMLInputElement)) {
    throw new Error("'Community access token' field is not an <input>");
  }
  return field;
}

// `MaxChannelPage.test.tsx`'s own precedent (via `WidgetConfigPage.test.tsx`): a direct `.value = x`
// assignment is swallowed by React's tracked setter as "no change", so no `onChange` ever fires.
function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tenanciesApi.fetchMyTenancies.mockResolvedValue({ tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }] });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
  operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [VK_CHANNEL_PERMISSION], siteId: SITE_ID });
  notConnected();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the screen", () => {
  it("refuses an operator without channel:manage, and never calls fetchVkChannelStatus", async () => {
    operatorsApi.fetchMyPermissions.mockResolvedValue({ permissions: [], siteId: SITE_ID });

    const container = await render(page());

    expect(container.textContent).toContain("You do not have permission to manage this site's channels.");
    expect(vkChannelApi.fetchVkChannelStatus).not.toHaveBeenCalled();
  });

  it("offers it, and loads status, to an operator holding channel:manage", async () => {
    const container = await render(page());

    expect(container.textContent).toContain("Community access token");
    expect(vkChannelApi.fetchVkChannelStatus).toHaveBeenCalledWith("token", SITE_ID);
  });
});

describe("not connected", () => {
  it("offers the token field and a disabled connect button until something is typed", async () => {
    const container = await render(page());

    const connectButton = byText<HTMLButtonElement>(container, "button", "Connect");
    expect(connectButton).not.toBeNull();
    expect(connectButton.disabled).toBe(true);
  });

  it("connects with the typed token, reloads status, then shows the callback URL and webhook secret to paste into VK", async () => {
    vkChannelApi.connectVkChannel.mockResolvedValue(connectResponse());

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    // The second (post-connect) status read reports the newly-connected, verified state -
    // `MaxChannelPage.test.tsx`'s own identical precedent for why this is set here, right before the click.
    connectedAndVerified();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(vkChannelApi.connectVkChannel).toHaveBeenCalledWith("token", SITE_ID, FAKE_TOKEN);
    expect(vkChannelApi.fetchVkChannelStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain(CALLBACK_URL);
    expect(container.textContent).toContain(FAKE_WEBHOOK_SECRET);
  });

  /** `25-15`'s own demand, the same shape `TelegramChannelPage.test.tsx`/`MaxChannelPage.test.tsx`
   * already prove for their own provider calls: a wrong token is refused at entry with what VK said
   * (`VkChannelEndpoints.HandleConnectAsync`'s own `groups.getById` rejection), not accepted and
   * silently dead. */
  it("shows VK's own refusal text and does not switch to a connected view when the token is rejected", async () => {
    vkChannelApi.connectVkChannel.mockRejectedValue(
      new ApiProblemError("ChannelCredential.InvalidToken", "VK refused that token: Invalid access_token", 400),
    );

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), "bad-token"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).toContain("VK refused that token: Invalid access_token");
    expect(container.textContent).toContain("Community access token");
  });

  /** `VkChannelPage`'s own doc comment: the one refusal this screen cannot fix by "try a different
   * value in this form" gets a second, explanatory hint underneath the server's own message. */
  it("shows an extra hint, distinct from the server message, when the refusal is specifically AlreadyConnected", async () => {
    vkChannelApi.connectVkChannel.mockRejectedValue(
      new ApiProblemError(
        "ChannelCredential.AlreadyConnected",
        `Site ${SITE_ID} already has an active Vk credential. Revoke it before registering a new one.`,
        409,
      ),
    );

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).toContain("already has an active Vk credential");
    expect(container.textContent).toContain(
      "To connect a different one, the existing connection has to be revoked first.",
    );
  });

  /** `25-15`'s own demand: "a stored credential never comes back out through any read path", proven
   * here at the one layer a reader can see directly, the rendered page - the identical
   * `MaxChannelPage.test.tsx`/`TelegramChannelPage.test.tsx` guarantee. */
  it("never renders the token anywhere on the page once it has been typed and submitted", async () => {
    vkChannelApi.connectVkChannel.mockResolvedValue(connectResponse());

    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    connectedAndVerified();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());

    expect(container.textContent).not.toContain(FAKE_TOKEN);
    expect(container.innerHTML).not.toContain(FAKE_TOKEN);
  });
});

describe("connected (this page visit performed the connect)", () => {
  async function connectedContainer(): Promise<HTMLElement> {
    vkChannelApi.connectVkChannel.mockResolvedValue(connectResponse());
    const container = await render(page());
    await interact(() => setTextValue(tokenField(container), FAKE_TOKEN));
    connectedAndVerified();
    await interact(() => byText<HTMLButtonElement>(container, "button", "Connect").click());
    return container;
  }

  it("shows the connected badge and the connected-since date, and never the token", async () => {
    const container = await connectedContainer();

    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Connected since");
    expect(container.textContent).not.toContain(FAKE_TOKEN);
  });

  it("copies the callback URL and the webhook secret to the clipboard on request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const container = await connectedContainer();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Copy callback URL").click());
    expect(writeText).toHaveBeenCalledWith(CALLBACK_URL);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Copy secret key").click());
    expect(writeText).toHaveBeenCalledWith(FAKE_WEBHOOK_SECRET);
  });

  it("disconnects after confirming, states the consequence first, and returns to the not-connected form", async () => {
    vkChannelApi.disconnectVkChannel.mockResolvedValue(undefined);

    const container = await connectedContainer();
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Your community will stop delivering messages immediately");
    expect(vkChannelApi.disconnectVkChannel).not.toHaveBeenCalled();

    notConnected();
    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Disconnect");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(vkChannelApi.disconnectVkChannel).toHaveBeenCalledWith("token", SITE_ID, CREDENTIAL_ID);
    expect(container.textContent).toContain("Community access token");
  });

  it("cancelling the disconnect dialog calls nothing", async () => {
    const container = await connectedContainer();
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await interact(() => one<HTMLDialogElement>(container, "dialog[open]"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(vkChannelApi.disconnectVkChannel).not.toHaveBeenCalled();
  });
});

/**
 * `25-65`'s own actual Done-when: "`VkChannelPage` reads the new route on mount and shows the real
 * persisted connection state after a reload". Every test here mocks `fetchVkChannelStatus` to answer
 * a connected fixture *before* the first `render()` and never calls `connectVkChannel` at all - a
 * simulated reload (or a second operator/browser opening this screen), not "the same page visit that
 * just connected" `describe("connected (this page visit performed the connect)")` above already proves.
 * Before `25-65`, this state was unreachable by any means: `VkChannelPage` had no `fetchVkChannelStatus`
 * to call and showed the connect form unconditionally (this file's own pre-`25-65` history).
 *
 * `25-179`'s own three-state live-check suite lives here rather than in the "this page visit performed
 * the connect" block above - the badge is driven by `status` alone regardless of `justConnected`, and
 * this block is the one already shaped as "status mocked fresh, no connect call", the identical setup
 * `TelegramChannelPage.test.tsx`/`MaxChannelPage.test.tsx` use for their own three states.
 */
describe("connected after a reload", () => {
  it("shows the connected badge and the connected-since date from status alone, with no connect call", async () => {
    connectedAndVerified();

    const container = await render(page());

    expect(vkChannelApi.connectVkChannel).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).toContain("Connected since");
    expect(container.textContent).not.toContain("Not responding");
  });

  it("shows the not-responding badge and VK's own refusal text when the live check just failed", async () => {
    connectedButRefused();

    const container = await render(page());

    expect(container.textContent).toContain("Not responding");
    expect(container.textContent).toContain("VK said:");
    expect(container.textContent).toContain("VK refused the token (401): Invalid access_token");
  });

  /** `25-175`: the coordinator's own requirement, ported from `TelegramChannelPage.test.tsx`'s/
   * `MaxChannelPage.test.tsx`'s identical test - a timeout/unreachable provider must render as a
   * plainly distinct message from "this token is invalid", never the same "Not responding" badge or
   * "VK said:" text a real refusal gets. A regression that collapsed the two states back into one
   * would make this test (and the one right above it) fail on whichever assertion the collapse broke. */
  it("shows a distinct could-not-reach badge, never the refused message, when the live check could not complete", async () => {
    connectedButUnreachable();

    const container = await render(page());

    expect(container.textContent).toContain("Could not check just now");
    expect(container.textContent).toContain("AGO could not reach VK just now");
    expect(container.textContent).not.toContain("Not responding");
    expect(container.textContent).not.toContain("VK said:");
  });

  /** The one real behavioural difference from a same-visit connect: `VkChannelStatusDto` never carries
   * `callbackUrl`/`webhookSecret` (`vkChannelApi.ts`'s own remarks), so a reload cannot show them again
   * - this screen says so explicitly (`vkChannelSecretsShownOnceHint`) instead of silently omitting the
   * setup panel. */
  it("does not show the callback URL or webhook secret, and shows the shown-once hint instead", async () => {
    connectedAndVerified();

    const container = await render(page());

    expect(container.textContent).not.toContain(CALLBACK_URL);
    expect(container.textContent).not.toContain(FAKE_WEBHOOK_SECRET);
    expect(container.textContent).toContain(
      "The callback URL and secret key were shown once, right after connecting.",
    );
  });

  it("still disconnects, using the credential id status provided - not one from a connect response that never happened", async () => {
    connectedAndVerified();
    vkChannelApi.disconnectVkChannel.mockResolvedValue(undefined);

    const container = await render(page());
    const openDialogButton = all(container, "button").filter((b) => b.textContent === "Disconnect");
    await interact(() => openDialogButton[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    notConnected();
    const confirmButtons = all(container, "dialog button").filter((b) => b.textContent === "Disconnect");
    await interact(() => confirmButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(vkChannelApi.disconnectVkChannel).toHaveBeenCalledWith("token", SITE_ID, CREDENTIAL_ID);
    expect(container.textContent).toContain("Community access token");
  });
});
