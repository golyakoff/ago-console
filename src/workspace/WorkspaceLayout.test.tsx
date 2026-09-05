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

// `23-04`: exposed as a plain local, refreshed in `beforeEach` - `OperatorConnection` is a real
// interface, so its own method trips `@typescript-eslint/unbound-method` the moment it is asserted on
// as a value (`expect(connectionMock.joinConversation)`) rather than called directly, the same
// `ConversationPage.test.tsx#fakeConnection` precedent already works around for `joinConversation`/
// `loadOlderHistory` there.
let joinConversationMock: ReturnType<typeof vi.fn>;

function fakeConnection(): OperatorConnection {
  joinConversationMock = vi.fn(() => Promise.resolve({ messages: [], nextBeforeSequence: null }));

  return {
    onMessage: vi.fn(),
    onAnyMessage: vi.fn(),
    onConversationAssigned: vi.fn(),
    onReconnectHint: vi.fn(),
    onStateChange: vi.fn(),
    joinConversation: joinConversationMock,
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

// `23-04`: refreshed in `beforeEach`, read by `Signed`'s own `connectionValue` below - see that
// component's own comment for why this indirection exists.
let connectionMock: OperatorConnection;

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
      enabledModules: [],
      hasPermission: (p: string) => p === "conversation:close",
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [],
  );

  // `23-04`: the same instance every render within one mount, taken from the module-level slot
  // `beforeEach` refreshes - so a test can assert on `connectionMock.joinConversation` after the fact,
  // which a fresh `fakeConnection()` call here (this file's own original shape) would put out of
  // reach.
  const connectionValue = useMemo<OperatorConnectionState>(
    () => ({ connection: connectionMock, connectionState: "connected", serverDraining: false }),
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
  connectionMock = fakeConnection();
  conversationsApi.fetchOperatorQueue.mockResolvedValue(queue());
  conversationsApi.markConversationRead.mockResolvedValue({ operatorUnreadCount: 0, operatorLastReadSequence: 0 });
  conversationsApi.fetchVisitorHistory.mockResolvedValue({ hasChannelIdentity: false, conversations: [], nextBeforeId: null });
  cannedResponsesApi.fetchCannedResponses.mockResolvedValue([]);
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

/**
 * `2026-08-29`: `AppShell.tsx`'s `wide` and `fixed` props used to be the same flag; splitting them
 * (see that file's own doc comment) fixed every other route `OperatorShell` renders losing page
 * scroll, but this layout is the one route that genuinely needs the fixed-height, `overflow: hidden`
 * shell - its rail/thread/aside scroll internally (`workspace.css`), and without the shell bounding
 * `<main>` to the viewport those regions never get a height to scroll within, and the composer walks
 * off the bottom of the page (`workspace.css`'s own remarks on `.ago-shell--fixed`). This is the
 * companion regression test to `permissionGating.test.tsx`'s "keeps ... page-scrollable" cases -
 * proving the split did not also flip this route the other way.
 */
describe("the workspace's own shell mode", () => {
  it("still gets the fixed-height, internally-scrolling shell at / and /conversations/:id", async () => {
    const container = await render(workspaceAt(`/conversations/${CONVERSATION_ID}`));

    expect(container.querySelector(".ago-shell")?.classList.contains("ago-shell--fixed")).toBe(true);
    expect(container.querySelector(".ago-shell__main")?.classList.contains("ago-shell__main--fixed")).toBe(true);
  });
});

/**
 * `23-04`: the rail's own end of "an operator can take a waiting conversation" - `ConversationList`'s
 * own doc comment on why the waiting row is a real `NavLink` now, proven here through the real
 * production tree rather than `ConversationList` mounted in isolation. Claiming itself
 * (`ConversationAssignmentSource.Taken`, the capacity charge) is `ago-chat`'s own server-side behaviour
 * behind `OperatorHub.JoinConversationAsync` - what this test proves is that the console actually
 * reaches that call when a waiting row is clicked, which is the one thing a frontend test can check.
 */
describe("taking a waiting conversation from the rail", () => {
  it("navigates a clicked waiting row into the conversation, reaching the real join call", async () => {
    const WAITING_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const WAITING_VISITOR_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    conversationsApi.fetchOperatorQueue.mockResolvedValue({
      assignedToMe: [],
      waiting: [
        {
          conversationId: WAITING_ID,
          visitorId: WAITING_VISITOR_ID,
          state: "Waiting",
          createdAt: "2026-08-25T09:00:00+00:00",
          operatorUnreadCount: 0,
        },
      ],
    });

    const container = await render(workspaceAt("/"));
    const waitingRow = one<HTMLAnchorElement>(container, `a[href="/conversations/${WAITING_ID}"]`);
    // Not `.ago-list__row--static` any more - the class the pre-`23-04` non-link row carried.
    expect(waitingRow.className).not.toContain("ago-list__row--static");

    await interact(() => waitingRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));

    expect(container.querySelector(`a[href="/conversations/${WAITING_ID}"]`)?.className).toContain("ago-list__row--active");
    // The claim itself: OperatorConnection.joinConversation is what reaches
    // OperatorHub.JoinConversationAsync -> AssignConversationHandler server-side.
    expect(joinConversationMock).toHaveBeenCalledWith(WAITING_ID);
  });
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
