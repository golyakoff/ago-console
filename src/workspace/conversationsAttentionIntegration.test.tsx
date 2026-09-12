import { useMemo } from "react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router-dom";
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
import { ConversationsAttentionProvider } from "./ConversationsAttentionProvider.js";
import type { WorkspaceOutletContext } from "./workspaceContext.js";
import { byText, one, interact, render, unmount } from "../testing/dom.js";

/**
 * `25-51`: the one claim the isolated unit tests (`ConversationsAttentionProvider.test.tsx`,
 * `consoleNav.test.ts`, `navBadges.test.tsx`) cannot show on their own - that the real, mounted
 * `OperatorShell` (a *parent* in the component tree) and the real, mounted `WorkspaceLayout` (a
 * *descendant*, reached through `<Outlet />`) actually agree, through `ConversationsAttentionProvider`,
 * without either one being hand-built. A stub route element stands in for `ConversationPage` - it
 * reads the identical `WorkspaceOutletContext.markRead` a real conversation view would call once
 * messages load, without needing this test to also drive a real hub join and a real message list.
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
}));
vi.mock("../api/conversationsApi.js", () => conversationsApi);

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

function queue(unreadCount: number): OperatorQueueResponse {
  return {
    assignedToMe: [
      {
        conversationId: CONVERSATION_ID,
        visitorId: VISITOR_ID,
        state: "Assigned",
        createdAt: "2026-08-25T09:00:00+00:00",
        operatorUnreadCount: unreadCount,
      },
    ],
    waiting: [],
  };
}

let connectionMock: OperatorConnection;

function Signed({ children }: { children: React.ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, isSigningOut: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );
  const permissions = useMemo<PermissionsState>(
    () => ({
      permissions: [],
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
      hasPermission: () => false,
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [],
  );
  const connectionValue = useMemo<OperatorConnectionState>(
    () => ({ connection: connectionMock, connectionState: "connected", serverDraining: false, isAway: false, setAway: () => Promise.resolve() }),
    [],
  );

  return (
    <AuthContext.Provider value={auth}>
      <PermissionsContext.Provider value={permissions}>
        <OperatorConnectionContext.Provider value={connectionValue}>
          {/* `25-51`: the one provider this file adds beside `WorkspaceLayout.test.tsx`'s own harness -
              real, not hand-built, since proving it wires `OperatorShell` and `WorkspaceLayout`
              together is the entire point of this file. */}
          <ConversationsAttentionProvider>{children}</ConversationsAttentionProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>
    </AuthContext.Provider>
  );
}

/** Stands in for `ConversationPage` - calls the real `markRead` from the real outlet context on a
 * click, which is all this file needs from "opening and reading a conversation": the one call
 * `ConversationPage`'s own effect makes once messages have loaded. */
function MarkReadStub() {
  const { markRead } = useOutletContext<WorkspaceOutletContext>();
  return (
    <button type="button" onClick={() => markRead(CONVERSATION_ID, 3)}>
      mark read
    </button>
  );
}

function tree() {
  return (
    <MemoryRouter initialEntries={[`/conversations/${CONVERSATION_ID}`]}>
      <Signed>
        <Routes>
          <Route element={<OperatorShell />}>
            <Route element={<WorkspaceLayout />}>
              <Route path="/" element={<NoConversationSelected />} />
              <Route path="/conversations/:conversationId" element={<MarkReadStub />} />
            </Route>
          </Route>
        </Routes>
      </Signed>
    </MemoryRouter>
  );
}

afterEach(async () => {
  await unmount();
});

beforeEach(() => {
  vi.clearAllMocks();
  connectionMock = fakeConnection();
  conversationsApi.fetchOperatorQueue.mockResolvedValue(queue(2));
  conversationsApi.markConversationRead.mockResolvedValue({ operatorUnreadCount: 0, operatorLastReadSequence: 3 });
});

describe("the Диалоги nav badge, through the real OperatorShell + WorkspaceLayout tree", () => {
  it("shows the unread total on the nav rail, and clears it the instant the workspace's own markRead succeeds", async () => {
    const container = await render(tree());

    const rail = one<HTMLElement>(container, ".ago-shell__rail");
    const myItem = one<HTMLAnchorElement>(rail, 'a[href="/"]');
    expect(myItem.querySelector(".ago-badge--danger")?.textContent).toContain("2");

    // Not `one(container, "button")` - the header's own hamburger button is also a `<button>` and
    // sits earlier in the DOM, so an unscoped query would click that one instead.
    const markReadButton = byText<HTMLButtonElement>(container, "button", "mark read");
    if (markReadButton === null) {
      throw new Error("no element matched a <button> reading 'mark read'");
    }
    await interact(() => markReadButton.click());

    expect(conversationsApi.markConversationRead).toHaveBeenCalledWith("token", CONVERSATION_ID, 3);
    // The nav badge is gone - not merely decremented on a later poll, but the instant the mark-read
    // call this test just drove resolved. `ConversationsAttentionProvider`'s own 15-second poll never
    // ran in this test at all (no timer was advanced), so this can only be the forwarded event.
    expect(myItem.querySelector(".ago-badge--danger")).toBeNull();
  });
});
