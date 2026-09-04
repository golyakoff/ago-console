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
import { WorkspaceLayout } from "../workspace/WorkspaceLayout.js";
import { NoConversationSelected } from "../workspace/NoConversationSelected.js";
import { ConversationPage } from "../pages/ConversationPage.js";
import { all, render, unmount } from "../testing/dom.js";

/**
 * `11-12`'s own Done-when, read as a DOM test rather than asserted from the string table alone -
 * `consoleLocale.test.tsx`'s twin for the screen an operator actually works in, following its exact
 * harness shape (mock the APIs the tree calls, mount the *real* production route tree - here
 * `OperatorShell` -> `WorkspaceLayout` -> `ConversationPage`/`NoConversationSelected` - inject context
 * directly rather than going through `PermissionsProvider`/`OperatorConnectionProvider` themselves,
 * the same substitution `ConversationPage.test.tsx` already makes for the identical reason: those two
 * providers open a real fetch and a real SignalR connection, and this file is about what the locale
 * does to the rendered text, not about connection bootstrapping (`operatorConnection.test.tsx` already
 * owns that).
 *
 * Locale still travels through the real production path: `PermissionsContext.locale` ->
 * `OperatorShell`'s `getStrings(parseConsoleLocale(locale))` -> `StringsProvider` -> every leaf
 * component's own `useStrings()`. Nothing in this file constructs a `StringsProvider` directly, which
 * is what makes this a proof of the wiring rather than a restatement of `ru.ts`.
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
  // `18-07`: ConversationPage now fetches this on every render too - see
  // ConversationPage.test.tsx's own note on the identical gap.
  fetchVisitorHistory: vi.fn(),
}));
const ownerApi = vi.hoisted(() => ({ probeOwnerEligibility: vi.fn() }));

vi.mock("../api/conversationsApi.js", () => conversationsApi);
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

function Signed({ locale, children }: { locale: string | null; children: React.ReactNode }) {
  const auth = useMemo<AuthState>(
    () => ({ user: signedIn(), isLoading: false, login: () => Promise.resolve(), logout: () => Promise.resolve() }),
    [],
  );

  const permissions = useMemo<PermissionsState>(
    () => ({
      permissions: ["conversation:close"],
      siteId: SITE_ID,
      locale,
      enabledModules: [],
      hasPermission: (p: string) => p === "conversation:close",
      tenancies: [{ siteId: SITE_ID, siteName: "Тестовый сайт" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [locale],
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

function workspaceAt(path: string, locale: string | null) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Signed locale={locale}>
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

beforeEach(() => {
  vi.clearAllMocks();
  conversationsApi.fetchOperatorQueue.mockResolvedValue(queue());
  conversationsApi.markConversationRead.mockResolvedValue({ operatorUnreadCount: 0, operatorLastReadSequence: 0 });
  conversationsApi.fetchVisitorHistory.mockResolvedValue({ hasChannelIdentity: false, conversations: [], nextBeforeId: null });
  ownerApi.probeOwnerEligibility.mockResolvedValue("ineligible");
});

afterEach(async () => {
  await unmount();
});

describe("the operator workspace for an active site with Locale = Ru", () => {
  it("renders the queue in Russian", async () => {
    const container = await render(workspaceAt("/", "Ru"));

    expect(container.querySelector("#ago-list-assigned")?.textContent).toContain("Назначено мне");
    expect(container.querySelector("#ago-list-waiting")?.textContent).toContain("Ожидание");
    // The assigned row's visible elapsed-time label ("Открыт 2d 11h") and its `title` (the fuller,
    // zone-labelled sentence `date-and-time.md` rule 5 asks every short reading to carry).
    expect(container.querySelector(".ago-list__row-bottom .ago-meta")?.textContent).toContain("Открыт");
    expect(container.querySelector(".ago-list__row-bottom .ago-meta")?.getAttribute("title")).toContain(
      "Диалог начат",
    );
  });

  it("renders the open conversation and the composer in Russian", async () => {
    const container = await render(workspaceAt(`/conversations/${CONVERSATION_ID}`, "Ru"));

    // The thread: an empty conversation still carries its own accessible name and empty structure -
    // this is `11-06`'s `<ol aria-label>`, translated.
    expect(container.querySelector(".ago-thread")?.getAttribute("aria-label")).toBe("Переписка");

    // The composer: placeholder, aria-label and both buttons.
    const textarea = container.querySelector<HTMLTextAreaElement>(".ago-composer__input");
    expect(textarea?.placeholder).toBe("Напишите ответ — Enter отправляет, Shift+Enter — новая строка");
    expect(textarea?.getAttribute("aria-label")).toBe("Сообщение для отправки");
    // `19-01`: "Suggest a reply", translated - the workspace's own harness wires `ConversationPage`
    // for real, which always supplies `onSuggestReply`, so this button is part of the same regression
    // surface the other two already are.
    const buttons = all(container, ".ago-composer__actions button").map((b) => b.textContent?.trim());
    expect(buttons).toEqual(["Прикрепить", "Предложить ответ", "Отправить"]);

    // The visitor panel, the third region.
    expect(container.querySelector("#ago-visitor-panel-title")?.textContent).toBe("Посетитель");
  });
});

describe("the operator workspace for an active site with no Locale set", () => {
  it("renders unchanged, in English - the regression case", async () => {
    const container = await render(workspaceAt(`/conversations/${CONVERSATION_ID}`, null));

    expect(container.querySelector("#ago-list-assigned")?.textContent).toContain("Assigned to me");
    expect(container.querySelector(".ago-thread")?.getAttribute("aria-label")).toBe("Message thread");
    const textarea = container.querySelector<HTMLTextAreaElement>(".ago-composer__input");
    expect(textarea?.placeholder).toBe("Write a reply — Enter to send, Shift+Enter for a new line");
    // `19-01`: same addition as the Russian case above.
    const buttons = all(container, ".ago-composer__actions button").map((b) => b.textContent?.trim());
    expect(buttons).toEqual(["Attach", "Suggest a reply", "Send"]);
    expect(container.querySelector("#ago-visitor-panel-title")?.textContent).toBe("Visitor");
  });
});
