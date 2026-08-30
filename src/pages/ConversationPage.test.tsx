import { useMemo } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "oidc-client-ts";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import { NotConnectedError, SendOutcomeUnknownError, type OperatorConnection } from "../realtime/operatorConnection.js";
import type { MessageDto } from "../realtime/protocol/types.js";
import type { WorkspaceOutletContext } from "../workspace/workspaceContext.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { ReplyDraftError } from "../api/replyDraftApi.js";
import { ConversationPage } from "./ConversationPage.js";
import { byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `11-08`: what the conversation view does around a send and around opening a conversation - the two
 * halves of `11-06`'s and `5-15`'s behaviour that live in the page rather than in the composer.
 *
 * The retry rule is the one worth the setup. `5-07` split a failed send into two genuinely different
 * situations, and the difference is invisible on screen: **nothing was sent** (retry with a fresh
 * `clientMessageId`) versus **the outcome is unknown** (retry with the *same* one, because the
 * server's dedup is what makes that safe and a new id would post the message twice). Getting it
 * backwards produces a duplicate message in a stranger's chat, occasionally, only when a socket
 * drops mid-invoke - which is to say never in manual testing and eventually in production.
 *
 * The connection is a hand-written fake rather than a mocked `@microsoft/signalr`: this file is
 * about the page's decisions, and `realtime/operatorConnection.test.tsx` already covers the layer
 * below at the level that needs a fake hub.
 */
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

const attachmentsApi = vi.hoisted(() => ({
  createAttachment: vi.fn(),
  uploadToPresignedUrl: vi.fn(),
  confirmAttachment: vi.fn(),
  getAttachmentDownload: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("../api/attachmentsApi.js", () => attachmentsApi);

// `11-09`: the page's only use of this module was `closeConversation`, so the whole module is
// replaced rather than partially mocked. `ApiProblemError` lives in `api/problemDetails.ts` and is
// deliberately *not* mocked - `closeOutcome.ts` does an `instanceof` against it, and a mocked class
// would fail that check for reasons that have nothing to do with the code under test.
//
// `18-07`: `fetchVisitorHistory` joined it - every render now fetches the visitor-history panel's
// own data, so this file's tests need a default answer or that fetch rejects with "is not a
// function" on every single one of them. Defaulted to `hasChannelIdentity: false` in `beforeEach`
// below (this file's tests are about sending/closing/attachments, not the history panel - its own
// behaviour is `VisitorHistoryPanel.test.tsx`'s job), which also happens to prove in passing that a
// widget-shaped answer renders nothing extra here.
const conversationsApi = vi.hoisted(() => ({
  closeConversation: vi.fn(),
  fetchVisitorHistory: vi.fn(),
  // `18-10`: `ConversationOutcomePanel` (mounted inside `VisitorPanel`, which every test in this file
  // renders via `ConversationPage`) calls these two - not optional, the same reason `fetchVisitorHistory`
  // above is not: an unmocked export on a `vi.mock`'d module throws instead of resolving.
  fetchConversationOutcome: vi.fn(),
  setConversationOutcome: vi.fn(),
}));

vi.mock("../api/conversationsApi.js", () => conversationsApi);

// `19-01`: `ReplyDraftError` is deliberately *not* mocked away, the identical reasoning
// `ApiProblemError`'s own comment above gives - `handleSuggestReply` does `err instanceof
// ReplyDraftError` to branch on `err.code`, and a mocked class would fail that check for reasons
// that have nothing to do with the code under test.
const replyDraftApi = vi.hoisted(() => ({ generateReplyDraft: vi.fn() }));

vi.mock("../api/replyDraftApi.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/replyDraftApi.js")>()),
  generateReplyDraft: replyDraftApi.generateReplyDraft,
}));

const CONVERSATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SITE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ATTACHMENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

interface SendAttempt {
  body: string;
  clientMessageId: string;
  attachmentId: string | null;
}

/** Only the methods `ConversationPage` reaches for, and one knob per test: what the next send does. */
function fakeConnection() {
  const sends: SendAttempt[] = [];
  let nextSendResult: "ok" | "unknown" | "not-connected" = "ok";
  let pushMessage: ((message: MessageDto) => void) | null = null;

  const connection = {
    onMessage(listener: (message: MessageDto) => void) {
      pushMessage = listener;
    },
    joinConversation: vi.fn(() => Promise.resolve({ messages: [] as MessageDto[], nextBeforeSequence: null })),
    leaveConversation: vi.fn(),
    getVisitorPresence: vi.fn(() => Promise.resolve(true)),
    loadOlderHistory: vi.fn(() => Promise.resolve({ messages: [] as MessageDto[], nextBeforeSequence: null })),
    sendMessage: vi.fn((_conversationId: string, body: string, clientMessageId: string, attachmentId: string | null) => {
      sends.push({ body, clientMessageId, attachmentId });
      if (nextSendResult === "unknown") {
        return Promise.reject(new SendOutcomeUnknownError(new Error("socket closed mid-invoke")));
      }

      if (nextSendResult === "not-connected") {
        return Promise.reject(new NotConnectedError());
      }

      return Promise.resolve(1);
    }),
  };

  return {
    connection: connection as unknown as OperatorConnection,
    sends,
    // `18-01`: exposed as plain locals rather than reached for via `fake.connection.joinConversation`
    // - `OperatorConnection` is a real class, so its method signatures trip
    // `@typescript-eslint/unbound-method` the moment one is used as a value (`vi.mocked(...)`, a bare
    // `expect(...)`) rather than called directly. Every other fake connection method in this file
    // sidesteps the same rule by never being asserted on this way; these two are the first that need
    // to be, for `?at=`'s own "no extra fetch when the target is already on the first page" /
    // "pages backward with the cursor `loadOlderHistory` actually returned" tests.
    joinConversation: connection.joinConversation,
    loadOlderHistory: connection.loadOlderHistory,
    failNextSendWith(result: "unknown" | "not-connected") {
      nextSendResult = result;
    },
    succeedFromNowOn() {
      nextSendResult = "ok";
    },
    /** Sets what a join answers with, for a conversation that already has history. */
    joinReturns(messages: MessageDto[]) {
      connection.joinConversation.mockResolvedValue({ messages, nextBeforeSequence: null });
    },
    push(message: MessageDto) {
      pushMessage?.(message);
    },
  };
}

function message(id: string, sequence: number, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    sequence,
    authorKind: "Visitor",
    authorId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    body: `message ${id}`,
    createdAt: "2026-08-25T09:00:00+00:00",
    conversationId: CONVERSATION_ID,
    ...overrides,
  };
}

interface HarnessOptions {
  connection: OperatorConnection;
  permissions?: string[];
  markRead?: (conversationId: string, upToSequence: number) => void;
  refreshQueue?: () => void;
  /** `18-01`: lets a test navigate straight to `?at=<sequence>`, the way `SearchConversationsPage`'s
   * own `Assigned`-hit link does - default unchanged from before this item (the plain conversation
   * route, no query string). */
  initialPath?: string;
}

function Harness({
  connection,
  permissions = [],
  markRead = () => undefined,
  refreshQueue = () => undefined,
  initialPath = `/conversations/${CONVERSATION_ID}`,
}: HarnessOptions) {
  const auth = useMemo<AuthState>(
    () => ({
      user: { access_token: "token", profile: { sub: "operator-sub" } } as unknown as User,
      isLoading: false,
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
    }),
    [],
  );

  const permissionsValue = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      // `11-11`: this file is about permission gating, not locale - `null` resolves to the console's
      // built-in English default (`parseConsoleLocale`'s own remarks), same as an unset tenant today.
      locale: null,
      hasPermission: (p: string) => permissions.includes(p),
      // `13-07`: this file is about permission gating, not the switcher - a single, already-resolved
      // tenancy, the same shape every operator before this item had.
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  const realtime = useMemo<OperatorConnectionState>(
    () => ({ connection, connectionState: "connected", serverDraining: false }),
    [connection],
  );

  const outlet = useMemo<WorkspaceOutletContext>(
    () => ({
      conversation: null,
      now: new Date("2026-08-25T09:05:00Z"),
      timeZone: "UTC",
      refreshQueue,
      markRead,
      // `18-05`: the layout's ref for the composer's textarea. A bare box here - nothing in this
      // file exercises the `C` shortcut, which is the workspace's, and the page's only job is to
      // hand it to `Composer`.
      composerRef: { current: null },
      // `18-03`: empty - nothing in this file exercises the picker, which is `Composer.test.tsx`'s own
      // job; the page's only job is to hand the list to `Composer` unchanged.
      cannedResponses: [],
      // `18-04`: same reasoning - nothing in this file exercises the tag panels, which is
      // `VisitorPanel`'s own concern; the page's only job is to hand the list through unchanged.
      tags: [],
      refreshTags: () => {},
    }),
    [markRead, refreshQueue],
  );

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthContext.Provider value={auth}>
        <PermissionsContext.Provider value={permissionsValue}>
          <OperatorConnectionContext.Provider value={realtime}>
            <Routes>
              <Route element={<Outlet context={outlet} />}>
                <Route path="/conversations/:conversationId" element={<ConversationPage />} />
              </Route>
            </Routes>
          </OperatorConnectionContext.Provider>
        </PermissionsContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

function typeAndSend(container: HTMLElement, body: string): Promise<void> {
  return interact(() => {
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    // React tracks the DOM value it last wrote, so assigning `.value` on the element is swallowed as
    // "no change" and no `onChange` ever fires; going through the *prototype's* setter is what makes
    // the synthetic change real. This is what "type into the box" costs without a testing library,
    // and it is three lines in one helper rather than a dependency.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, body);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

function retry(container: HTMLElement): Promise<void> {
  return interact(() => byText<HTMLButtonElement>(container, "button", "Retry")?.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  attachmentsApi.getAttachmentDownload.mockResolvedValue({
    url: "https://storage.test.invalid/object",
    contentType: "image/png",
    thumbnailUrl: "https://storage.test.invalid/thumb",
    expiresAt: "2026-08-25T10:00:00+00:00",
  });
  attachmentsApi.deleteAttachment.mockResolvedValue(undefined);
  conversationsApi.fetchVisitorHistory.mockResolvedValue({ hasChannelIdentity: false, conversations: [], nextBeforeId: null });
  conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Unset" });
  conversationsApi.setConversationOutcome.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("a send that failed", () => {
  it("offers a retry rather than losing what the operator typed", async () => {
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} />);

    fake.failNextSendWith("not-connected");
    await typeAndSend(container, "on my way");

    expect(container.textContent).toContain("Send failed or is unconfirmed");
    expect(container.textContent).toContain("on my way");
    expect(byText(container, "button", "Retry")).not.toBeNull();
  });

  it("retries with the same client message id when the outcome is unknown, so a landed send cannot land twice", async () => {
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} />);

    fake.failNextSendWith("unknown");
    await typeAndSend(container, "on my way");
    fake.succeedFromNowOn();
    await retry(container);

    expect(fake.sends).toHaveLength(2);
    expect(fake.sends[1].clientMessageId).toBe(fake.sends[0].clientMessageId);
    expect(fake.sends[1].body).toBe("on my way");
  });

  it("retries with a fresh id when nothing was sent at all", async () => {
    // The opposite case, and the reason the two are not one: reusing an id here is not wrong, but
    // minting one is what keeps the two paths honestly distinguished rather than collapsed into the
    // more conservative of them by accident.
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} />);

    fake.failNextSendWith("not-connected");
    await typeAndSend(container, "on my way");
    fake.succeedFromNowOn();
    await retry(container);

    expect(fake.sends).toHaveLength(2);
    expect(fake.sends[1].clientMessageId).not.toBe(fake.sends[0].clientMessageId);
  });

  it("carries the attachment over to the retry rather than sending the caption alone", async () => {
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} />);

    attachmentsApi.createAttachment.mockResolvedValue({
      attachmentId: ATTACHMENT_ID,
      uploadUrl: "https://storage.test.invalid/put",
      expiresAt: "2026-08-25T10:00:00+00:00",
    });
    attachmentsApi.uploadToPresignedUrl.mockResolvedValue(undefined);
    attachmentsApi.confirmAttachment.mockResolvedValue(undefined);

    await interact(() => {
      const input = one<HTMLInputElement>(container, 'input[type="file"]');
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["png"], "screenshot.png", { type: "image/png" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    fake.failNextSendWith("unknown");
    await typeAndSend(container, "here is the screenshot");
    fake.succeedFromNowOn();
    await retry(container);

    expect(fake.sends[0].attachmentId).toBe(ATTACHMENT_ID);
    expect(fake.sends[1].attachmentId).toBe(ATTACHMENT_ID);
  });

  it("stops offering the retry once one succeeds", async () => {
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} />);

    fake.failNextSendWith("unknown");
    await typeAndSend(container, "on my way");
    fake.succeedFromNowOn();
    await retry(container);

    expect(byText(container, "button", "Retry")).toBeNull();
    expect(container.textContent).not.toContain("Send failed or is unconfirmed");
  });
});

describe("opening a conversation", () => {
  it("marks it read up to the newest message actually on screen", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn();
    const fake = fakeConnection();
    fake.joinReturns([message("m2", 12), message("m1", 11)]);

    await render(<Harness connection={fake.connection} markRead={markRead} />);
    await vi.advanceTimersByTimeAsync(600);

    expect(markRead).toHaveBeenCalledWith(CONVERSATION_ID, 12);
  });

  it("does not mark it read from a tab the operator is not looking at", async () => {
    // `5-15`: the document-title unread count exists precisely so a backgrounded tab still tells the
    // truth, and a conversation left open behind another tab must not clear the number it is showing.
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const markRead = vi.fn();
    const fake = fakeConnection();
    fake.joinReturns([message("m1", 11)]);

    await render(<Harness connection={fake.connection} markRead={markRead} />);
    await vi.advanceTimersByTimeAsync(600);

    expect(markRead).not.toHaveBeenCalled();
    visibility.mockRestore();
  });

  it("marks it read again when a newer message arrives, and not once per message", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn();
    const fake = fakeConnection();
    fake.joinReturns([message("m1", 11)]);

    await render(<Harness connection={fake.connection} markRead={markRead} />);
    await vi.advanceTimersByTimeAsync(600);
    expect(markRead).toHaveBeenCalledTimes(1);

    // A rapid exchange. Each arrival is its own render, so without the debounce this would be one
    // request per message; with it, the timer is reset three times and fires once, at the newest.
    await interact(() => fake.push(message("m2", 12)));
    await interact(() => fake.push(message("m3", 13)));
    await interact(() => fake.push(message("m4", 14)));
    await vi.advanceTimersByTimeAsync(600);

    expect(markRead).toHaveBeenCalledTimes(2);
    expect(markRead).toHaveBeenLastCalledWith(CONVERSATION_ID, 14);
  });
});

describe("the attachment actions on a message", () => {
  it("does not offer delete to an operator without attachment:delete", async () => {
    const fake = fakeConnection();
    fake.joinReturns([message("m1", 11, { attachmentId: ATTACHMENT_ID })]);

    const container = await render(<Harness connection={fake.connection} permissions={["conversation:read"]} />);

    expect(byText(container, "button", "Delete attachment")).toBeNull();
    // The attachment itself is still there to download - the gate is on the action, not the content.
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("offers it to an operator who holds the permission", async () => {
    const fake = fakeConnection();
    fake.joinReturns([message("m1", 11, { attachmentId: ATTACHMENT_ID })]);

    const container = await render(<Harness connection={fake.connection} permissions={["attachment:delete"]} />);

    const button = byText<HTMLButtonElement>(container, "button", "Delete attachment");
    expect(button).not.toBeNull();

    await interact(() => button?.click());
    expect(attachmentsApi.deleteAttachment).toHaveBeenCalledWith("token", ATTACHMENT_ID);
    expect(container.textContent).toContain("Attachment deleted");
  });
});

/**
 * `11-09`: what the open thread does once this tab has closed the conversation.
 *
 * The item asks for the thread to "reflect the new state without a reload", and the substance of
 * that is the composer. A closed conversation leaves the operator queue entirely
 * (`GetAssignedToOperatorAsync` filters on `State == Assigned`), so the server's own view can only
 * ever say "no longer here" - which would leave a reply box that every send is refused by. That is
 * why the page carries a local flag rather than reading `conversation.state`, and why this is a page
 * test rather than a component one.
 */
describe("closing the conversation", () => {
  it("replaces the composer with a notice, and refreshes the rail", async () => {
    const fake = fakeConnection();
    conversationsApi.closeConversation.mockResolvedValue(undefined);
    const refreshQueue = vi.fn();

    const container = await render(
      <Harness connection={fake.connection} permissions={["conversation:close"]} refreshQueue={refreshQueue} />,
    );

    expect(container.querySelector("textarea")).not.toBeNull();

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Close it")?.click());

    expect(conversationsApi.closeConversation).toHaveBeenCalledWith("token", CONVERSATION_ID);
    // The reply box is gone rather than disabled: a send would be refused by the server, and a
    // composer that silently cannot work is worse than none.
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("This conversation is closed");
    // The rail drops the row on the next queue read, which the page asks for rather than waiting out
    // the fifteen-second poll.
    expect(refreshQueue).toHaveBeenCalled();
  });

  it("stops offering the control once it has been used", async () => {
    // A second close is a `409` the operator could only be confused by.
    const fake = fakeConnection();
    conversationsApi.closeConversation.mockResolvedValue(undefined);

    const container = await render(<Harness connection={fake.connection} permissions={["conversation:close"]} />);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Close it")?.click());

    expect(byText(container, "button", "Close conversation")).toBeNull();
  });

  it("keeps the composer when the close was refused", async () => {
    // Nothing changed server-side, so nothing changes on screen except the explanation.
    const fake = fakeConnection();
    conversationsApi.closeConversation.mockRejectedValue(
      new ApiProblemError("Conversation.ConcurrencyConflict", "raced", 409),
    );

    const container = await render(<Harness connection={fake.connection} permissions={["conversation:close"]} />);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Close conversation")?.click());
    await interact(() => byText<HTMLButtonElement>(container, "button", "Close it")?.click());

    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("Try closing it again");
  });

  it("offers no control at all to an operator without conversation:close", async () => {
    const fake = fakeConnection();

    const container = await render(<Harness connection={fake.connection} permissions={["conversation:read"]} />);

    expect(byText(container, "button", "Close conversation")).toBeNull();
    expect(container.textContent).not.toContain("Close conversation");
  });
});

/**
 * `18-07`: the visitor-history panel's own wiring through this page - `VisitorHistoryPanel.test.tsx`
 * covers the component's behaviour in full (gating, opening one, pagination); this is the proof that
 * `ConversationPage` actually fetches `fetchVisitorHistory` and threads the answer through
 * `VisitorPanel` rather than the panel simply never being reached.
 */
describe("the returning-visitor-history panel", () => {
  it("renders nothing for a widget visitor - no channel identity", async () => {
    const fake = fakeConnection();
    conversationsApi.fetchVisitorHistory.mockResolvedValue({ hasChannelIdentity: false, conversations: [], nextBeforeId: null });

    const container = await render(<Harness connection={fake.connection} />);

    expect(container.textContent).not.toContain("Previous conversations");
  });

  it("renders the panel for a channel-identified visitor with a prior conversation", async () => {
    const fake = fakeConnection();
    conversationsApi.fetchVisitorHistory.mockResolvedValue({
      hasChannelIdentity: true,
      conversations: [
        {
          conversationId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          state: "Closed",
          startedAt: "2026-08-20T09:00:00+00:00",
          closedAt: "2026-08-20T09:10:00+00:00",
          previewBody: "thanks for your help",
          previewAuthorKind: "Visitor",
          previewCreatedAt: "2026-08-20T09:10:00+00:00",
        },
      ],
      nextBeforeId: null,
    });

    const container = await render(<Harness connection={fake.connection} />);

    expect(container.textContent).toContain("Previous conversations");
    expect(container.textContent).toContain("thanks for your help");
  });
});

/**
 * `18-01`: `?at=<sequence>` - `SearchConversationsPage`'s own `Assigned`-hit link
 * (`/conversations/:id?at=<sequence>`). `searchConversations`'s own doc comment in `conversationsApi.ts`
 * has the full account of why this only ever attempts, never guarantees, the position: it re-uses the
 * exact `joinConversation`/`loadOlderHistory` calls every other conversation open already makes, which
 * is what makes "already on the freshly-joined page" and "found after paging back" both real,
 * observable outcomes here rather than a third code path invented for search alone.
 */
describe("opening a conversation at a search hit's own position (?at=)", () => {
  it("highlights the message immediately when it is already on the freshly-joined page", async () => {
    const fake = fakeConnection();
    fake.joinReturns([message("m2", 12), message("m1", 11)]);

    const container = await render(
      <Harness connection={fake.connection} initialPath={`/conversations/${CONVERSATION_ID}?at=11`} />,
    );

    const highlighted = one<HTMLLIElement>(container, '[data-sequence="11"]');
    expect(highlighted.className).toContain("ago-message--highlighted");
    // Already on the first page - no reason to page backward looking for it.
    expect(fake.loadOlderHistory).not.toHaveBeenCalled();
  });

  it("pages backward automatically until the target sequence turns up, then highlights it", async () => {
    const fake = fakeConnection();
    fake.joinConversation.mockResolvedValue({
      messages: [message("m20", 20), message("m19", 19)],
      nextBeforeSequence: 19,
    });
    fake.loadOlderHistory.mockResolvedValueOnce({
      messages: [message("m11", 11), message("m10", 10)],
      nextBeforeSequence: 10,
    });

    const container = await render(
      <Harness connection={fake.connection} initialPath={`/conversations/${CONVERSATION_ID}?at=11`} />,
    );
    await interact(() => undefined);

    expect(fake.loadOlderHistory).toHaveBeenCalledWith(CONVERSATION_ID, 19, expect.any(Number));
    const highlighted = one<HTMLLIElement>(container, '[data-sequence="11"]');
    expect(highlighted.className).toContain("ago-message--highlighted");
    // The message right before it, from the same fetched page, is on screen too - a real position in
    // the thread, not a single message plucked out of context.
    expect(container.textContent).toContain("message m10");
  });

  it("shows a plain failure and hides the composer when the join itself fails - most likely because this hit belongs to someone else's conversation", async () => {
    const fake = fakeConnection();
    fake.joinConversation.mockRejectedValue(new Error("Operator is not assigned to this conversation."));

    const container = await render(
      <Harness connection={fake.connection} initialPath={`/conversations/${CONVERSATION_ID}?at=11`} />,
    );

    expect(container.textContent).toContain("This conversation could not be opened here.");
    expect(container.querySelector("textarea")).toBeNull();
  });
});

/**
 * `19-01`: what the page does around "Suggest a reply" - the composer only renders the button and
 * fires `onSuggestReply` (`Composer.test.tsx`'s own job); this file covers the request it triggers,
 * what lands in the draft, and - the property this feature exists to keep - that a suggestion never
 * reaches `OperatorConnection.sendMessage` on its own.
 */
describe("suggesting a reply (19-01)", () => {
  /** The button's own label swaps to "Generating a suggestion…" while a request is in flight
   * (`Composer.tsx`'s own `suggestingReply` branch) - found by either label rather than by the
   * "Suggest a reply" text alone, so a test can still reach the (disabled) button mid-request. */
  function suggestButton(container: HTMLElement) {
    return (
      byText<HTMLButtonElement>(container, "button", "Suggest a reply") ??
      byText<HTMLButtonElement>(container, "button", "Generating a suggestion…")
    );
  }

  it("fills the draft with the generated text, replacing whatever was typed, and never sends it", async () => {
    const fake = fakeConnection();
    replyDraftApi.generateReplyDraft.mockResolvedValue({ draftText: "Sure, happy to help with that." });
    const container = await render(<Harness connection={fake.connection} />);

    await interact(() => {
      const textarea = one<HTMLTextAreaElement>(container, "textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "half-typed reply");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await interact(() => suggestButton(container)?.click());

    expect(replyDraftApi.generateReplyDraft).toHaveBeenCalledWith("token", CONVERSATION_ID);
    expect(one<HTMLTextAreaElement>(container, "textarea").value).toBe("Sure, happy to help with that.");
    expect(fake.sends).toHaveLength(0);
  });

  it("disables the button while a request is in flight, so a double click cannot fire a second real-money call", async () => {
    const fake = fakeConnection();
    let resolveDraft!: (value: { draftText: string }) => void;
    replyDraftApi.generateReplyDraft.mockReturnValue(new Promise((resolve) => (resolveDraft = resolve)));
    const container = await render(<Harness connection={fake.connection} />);

    await interact(() => suggestButton(container)?.click());
    expect(suggestButton(container)?.disabled).toBe(true);

    await interact(() => resolveDraft({ draftText: "an answer" }));
    expect(replyDraftApi.generateReplyDraft).toHaveBeenCalledTimes(1);
    expect(suggestButton(container)?.disabled).toBe(false);
  });

  it("shows a rate-limit-specific message and leaves the draft untouched when the cap is exceeded", async () => {
    const fake = fakeConnection();
    replyDraftApi.generateReplyDraft.mockRejectedValue(
      new ReplyDraftError("ReplyDraft.RateLimited", "Too many reply-draft requests - retry after 300.0s."),
    );
    const container = await render(<Harness connection={fake.connection} />);

    await interact(() => suggestButton(container)?.click());

    expect(container.textContent).toContain("Too many AI suggestions requested");
    expect(one<HTMLTextAreaElement>(container, "textarea").value).toBe("");
  });

  it("shows an unavailable-specific message when the provider is down, distinct from the rate-limit one", async () => {
    const fake = fakeConnection();
    replyDraftApi.generateReplyDraft.mockRejectedValue(
      new ReplyDraftError("ReplyDraft.Unavailable", "The reply-draft suggestion is temporarily unavailable."),
    );
    const container = await render(<Harness connection={fake.connection} />);

    await interact(() => suggestButton(container)?.click());

    expect(container.textContent).toContain("temporarily unavailable");
    expect(container.textContent).not.toContain("Too many AI suggestions requested");
  });
});
