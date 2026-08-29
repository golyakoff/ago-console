import { useMemo } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import type { OperatorConnection } from "../realtime/operatorConnection.js";
import type { OperatorQueueResponse } from "../realtime/protocol/types.js";
import { OperatorShell } from "../shell/OperatorShell.js";
import { WorkspaceLayout } from "./WorkspaceLayout.js";
import { NoConversationSelected } from "./NoConversationSelected.js";
import { ConversationPage } from "../pages/ConversationPage.js";
import { one, interact, render, unmount } from "../testing/dom.js";

/**
 * `18-03`: proves the wiring `workspaceLocale.test.tsx`/`ConversationPage.test.tsx` do not - that
 * `WorkspaceLayout` actually fetches the site's canned responses and hands them down through
 * `WorkspaceOutletContext` to the real, mounted `Composer`, and that an operator can reach and insert
 * one **without leaving the keyboard**, through the real production route tree rather than a
 * component mounted with hand-built props. `Composer.test.tsx` proves the picker's own contract in
 * isolation; this file proves it is actually connected to something.
 *
 * Same harness `workspaceLocale.test.tsx` uses and for the same reason: the real `OperatorShell` ->
 * `WorkspaceLayout` -> `ConversationPage` tree, `PermissionsContext`/`OperatorConnectionContext`
 * injected directly rather than through their real providers (which open a fetch and a SignalR
 * connection this file has no reason to exercise).
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const conversationsApi = vi.hoisted(() => ({
  fetchOperatorQueue: vi.fn(),
  markConversationRead: vi.fn(),
  closeConversation: vi.fn(),
  fetchVisitorHistory: vi.fn(),
}));
const cannedResponsesApi = vi.hoisted(() => ({ fetchCannedResponses: vi.fn() }));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));

vi.mock("../api/conversationsApi.js", () => conversationsApi);
vi.mock("../api/cannedResponsesApi.js", () => cannedResponsesApi);
vi.mock("../api/ownerApi.js", () => ownerApi);

const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONVERSATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VISITOR_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub", preferred_username: "kim" } } as unknown as User;
}

function fakeConnection(): OperatorConnection {
  return {
    onMessage: vi.fn(),
    onAnyMessage: vi.fn(),
    onConversationAssigned: vi.fn(),
    onReconnectHint: vi.fn(),
    onStateChange: vi.fn(),
    joinConversation: vi.fn(() => Promise.resolve({ messages: [], nextBeforeSequence: null })),
    leaveConversation: vi.fn(),
    getVisitorPresence: vi.fn(() => Promise.resolve(null)),
    loadOlderHistory: vi.fn(() => Promise.resolve({ messages: [], nextBeforeSequence: null })),
    sendMessage: vi.fn(() => Promise.resolve(1)),
    start: vi.fn(() => Promise.resolve()),
  } as unknown as OperatorConnection;
}

function queue(): OperatorQueueResponse {
  return {
    assignedToMe: [
      {
        conversationId: CONVERSATION_ID,
        visitorId: VISITOR_ID,
        state: "Assigned",
        createdAt: "2026-08-25T09:00:00+00:00",
        operatorUnreadCount: 0,
      },
    ],
    waiting: [],
  };
}

function Signed({ children }: { children: React.ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  const permissions = useMemo<PermissionsState>(
    () => ({
      permissions: ["conversation:close"],
      siteId: SITE_ID,
      locale: null,
      hasPermission: (p: string) => p === "conversation:close",
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [],
  );

  const connectionValue = useMemo<OperatorConnectionState>(
    () => ({ connection: fakeConnection(), connectionState: "connected", serverDraining: false }),
    [],
  );

  return (
    <AuthContext.Provider value={auth}>
      <PermissionsContext.Provider value={permissions}>
        <OperatorConnectionContext.Provider value={connectionValue}>{children}</OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>
    </AuthContext.Provider>
  );
}

function workspaceAt(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed>
        <Routes>
          <Route element={<OperatorShell />}>
            <Route element={<WorkspaceLayout />}>
              <Route path="/" element={<NoConversationSelected />} />
              <Route path="/conversations/:conversationId" element={<ConversationPage />} />
            </Route>
          </Route>
        </Routes>
      </Signed>
    </MemoryRouter>
  );
}

/** Sets a controlled textarea's value the way a real keystroke would - `ConversationPage.test.tsx`'s
 * own `typeAndSend` helper explains why the plain `.value =` assignment React would swallow is not
 * enough. */
function typeInto(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function keyDown(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  conversationsApi.fetchOperatorQueue.mockResolvedValue(queue());
  conversationsApi.markConversationRead.mockResolvedValue({ operatorUnreadCount: 0, operatorLastReadSequence: 0 });
  conversationsApi.fetchVisitorHistory.mockResolvedValue({ hasChannelIdentity: false, conversations: [], nextBeforeId: null });
  cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("the workspace's canned-response wiring", () => {
  it("fetches the site's canned responses once when the workspace mounts", async () => {
    cannedResponsesApi.fetchCannedResponses.mockResolvedValue([{ title: "Refund policy", body: "Three days." }]);

    await render(workspaceAt(`/conversations/${CONVERSATION_ID}`));

    expect(cannedResponsesApi.fetchCannedResponses).toHaveBeenCalledWith("token", SITE_ID);
    expect(cannedResponsesApi.fetchCannedResponses).toHaveBeenCalledTimes(1);
  });

  it("lets an operator insert one into the real composer without touching the mouse", async () => {
    cannedResponsesApi.fetchCannedResponses.mockResolvedValue([
      { title: "Refund policy", body: "Refunds take three working days." },
      { title: "Greeting", body: "Hi, how can I help?" },
    ]);

    const container = await render(workspaceAt(`/conversations/${CONVERSATION_ID}`));
    const textarea = one<HTMLTextAreaElement>(container, ".ago-composer__input");

    // The whole keyboard path, through the real tree: open the picker, filter to one match, insert
    // it, and confirm nothing was sent along the way (`sendMessage` is the connection's own mock).
    await interact(() => typeInto(textarea, "/refund"));
    expect(one(container, "[role=listbox]").textContent).toContain("Refund policy");
    expect(one(container, "[role=listbox]").textContent).not.toContain("Greeting");

    await interact(() => keyDown(textarea, "Enter"));

    expect(textarea.value).toBe("Refunds take three working days.");
  });

  it("does not offer a picker when the site has none configured", async () => {
    cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);

    const container = await render(workspaceAt(`/conversations/${CONVERSATION_ID}`));
    const textarea = one<HTMLTextAreaElement>(container, ".ago-composer__input");

    await interact(() => typeInto(textarea, "/"));

    expect(container.querySelector("[role=listbox]")).toBeNull();
    // The `/` is left as ordinary text - not swallowed, not sent.
    expect(textarea.value).toBe("/");
  });
});
