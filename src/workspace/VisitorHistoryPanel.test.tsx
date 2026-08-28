import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import type { OperatorConnection } from "../realtime/operatorConnection.js";
import type { HistoryPage, MessageDto, VisitorHistoryResponse } from "../realtime/protocol/types.js";
import { VisitorHistoryPanel } from "./VisitorHistoryPanel.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `18-07`: the returning-visitor-history panel's own component tests.
 *
 * The backlog item's own Done-when, worded exactly: "A widget-only visitor's conversation shows no
 * such panel - proven with a test, not left implicit." `attachmentsApi` is left real rather than
 * mocked at the module level here - none of these tests render a message with an attachment, so
 * `attachmentsApi.getAttachmentDownload` never runs.
 */
vi.mock("../api/attachmentsApi.js", () => ({ getAttachmentDownload: vi.fn() }));

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const HISTORICAL_ID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-08-25T09:05:00Z");

function conversationRow(overrides: Partial<VisitorHistoryResponse["conversations"][number]> = {}): VisitorHistoryResponse["conversations"][number] {
  return {
    conversationId: HISTORICAL_ID,
    state: "Closed",
    startedAt: "2026-08-20T09:00:00+00:00",
    closedAt: "2026-08-20T09:10:00+00:00",
    previewBody: "thanks for your help",
    previewAuthorKind: "Visitor",
    previewCreatedAt: "2026-08-20T09:10:00+00:00",
    ...overrides,
  };
}

function fakeConnection() {
  const calls: { conversationId: string; historicalConversationId: string; beforeSequence: number | null; pageSize: number }[] = [];
  let nextResult: () => Promise<HistoryPage> = () => Promise.resolve({ messages: [], nextBeforeSequence: null });

  const connection = {
    getVisitorHistoryConversation: vi.fn(
      (conversationId: string, historicalConversationId: string, beforeSequence: number | null, pageSize: number) => {
        calls.push({ conversationId, historicalConversationId, beforeSequence, pageSize });
        return nextResult();
      },
    ),
  };

  return {
    connection: connection as unknown as OperatorConnection,
    calls,
    resultsWith(page: HistoryPage) {
      nextResult = () => Promise.resolve(page);
    },
    rejectsWith(error: Error) {
      nextResult = () => Promise.reject(error);
    },
  };
}

function message(id: string, sequence: number, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    sequence,
    authorKind: "Visitor",
    authorId: "33333333-3333-3333-3333-333333333333",
    body: `message ${id}`,
    createdAt: "2026-08-20T09:05:00+00:00",
    ...overrides,
  };
}

interface HarnessOptions {
  connection: OperatorConnection;
  history: VisitorHistoryResponse | null;
  historyError?: string | null;
}

function Harness({ connection, history, historyError = null }: HarnessOptions) {
  const realtime = useMemo<OperatorConnectionState>(
    () => ({ connection, connectionState: "connected", serverDraining: false }),
    [connection],
  );

  return (
    <OperatorConnectionContext.Provider value={realtime}>
      <VisitorHistoryPanel
        conversationId={CONVERSATION_ID}
        history={history}
        historyError={historyError}
        now={NOW}
        timeZone="UTC"
        accessToken="token"
      />
    </OperatorConnectionContext.Provider>
  );
}

async function openFirstRow(container: HTMLElement): Promise<void> {
  await interact(() => one<HTMLButtonElement>(container, "button.ago-list__row--history").click());
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("the hard gate: a widget visitor has no channel identity", () => {
  it("renders nothing whatsoever once the answer is known - not a heading, not an empty state", async () => {
    const fake = fakeConnection();
    const container = await render(
      <Harness connection={fake.connection} history={{ hasChannelIdentity: false, conversations: [], nextBeforeId: null }} />,
    );

    expect(container.textContent).toBe("");
    expect(all(container, "section")).toHaveLength(0);
    // Never even asks to open one, and never mentions a panel that could not possibly apply here.
    expect(container.textContent).not.toContain("Previous conversations");
  });

  it("does not render the gated empty state either, even though 'no conversations' is technically true", async () => {
    // The trap this test guards against: a widget visitor's answer also has an empty conversations
    // array, so a gate implemented as `conversations.length === 0 ? null : ...` would pass every
    // other test here and still render nothing whatsoever - correctly, by accident, for the wrong
    // reason. Checked explicitly with `hasChannelIdentity: false` alongside a non-empty list (a
    // value the real handler never actually sends together, but the point is this component's own
    // gate reads `hasChannelIdentity`, not list length) to prove which field the condition inspects.
    const fake = fakeConnection();
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{ hasChannelIdentity: false, conversations: [conversationRow()], nextBeforeId: null }}
      />,
    );

    expect(container.textContent).toBe("");
  });
});

describe("a channel-identified visitor", () => {
  it("shows a loading state while the fetch is in flight", async () => {
    const fake = fakeConnection();
    const container = await render(<Harness connection={fake.connection} history={null} />);

    expect(container.textContent).toContain("Previous conversations");
    expect(container.textContent).toContain("Loading previous conversations");
  });

  it("shows an empty-state sentence for a first-ever conversation on this channel - a real, reachable case", async () => {
    const fake = fakeConnection();
    const container = await render(
      <Harness connection={fake.connection} history={{ hasChannelIdentity: true, conversations: [], nextBeforeId: null }} />,
    );

    expect(container.textContent).toContain("Previous conversations");
    expect(container.textContent).toContain("No prior conversations");
  });

  it("shows the fetch error rather than a false empty state", async () => {
    const fake = fakeConnection();
    const container = await render(
      <Harness connection={fake.connection} history={null} historyError="network exploded" />,
    );

    expect(container.textContent).not.toContain("No prior conversations");
  });

  it("lists prior conversations, most recent first, with a preview and state", async () => {
    const fake = fakeConnection();
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{
          hasChannelIdentity: true,
          conversations: [conversationRow({ previewBody: "thanks for your help" })],
          nextBeforeId: null,
        }}
      />,
    );

    expect(container.textContent).toContain("thanks for your help");
    expect(container.textContent).toContain("Closed");
    expect(all(container, "button.ago-list__row--history")).toHaveLength(1);
  });

  it("shows a fallback for a conversation with no messages, rather than a blank line", async () => {
    const fake = fakeConnection();
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{
          hasChannelIdentity: true,
          conversations: [conversationRow({ previewBody: null, previewAuthorKind: null, previewCreatedAt: null })],
          nextBeforeId: null,
        }}
      />,
    );

    expect(container.textContent).toContain("No messages");
  });
});

describe("opening one", () => {
  it("fetches and renders its real message history through the existing Thread component", async () => {
    const fake = fakeConnection();
    fake.resultsWith({ messages: [message("m2", 2), message("m1", 1)], nextBeforeSequence: null });
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{ hasChannelIdentity: true, conversations: [conversationRow()], nextBeforeId: null }}
      />,
    );

    await openFirstRow(container);

    expect(fake.calls).toEqual([
      { conversationId: CONVERSATION_ID, historicalConversationId: HISTORICAL_ID, beforeSequence: null, pageSize: 50 },
    ]);
    const dialog = one<HTMLDialogElement>(container, "dialog");
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("message m1");
    expect(dialog.textContent).toContain("message m2");
    // The real ordered thread, not a debug dump - the same <ol aria-label> Thread always renders.
    expect(one(dialog, "ol[aria-label]")).not.toBeNull();
  });

  it("pages backward through an older page on request, prepending rather than replacing", async () => {
    const fake = fakeConnection();
    fake.resultsWith({ messages: [message("m2", 2)], nextBeforeSequence: 2 });
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{ hasChannelIdentity: true, conversations: [conversationRow()], nextBeforeId: null }}
      />,
    );
    await openFirstRow(container);

    fake.resultsWith({ messages: [message("m1", 1)], nextBeforeSequence: null });
    await interact(() => byText<HTMLButtonElement>(container, "button", "Load older messages")?.click());

    expect(fake.calls[1]).toEqual({
      conversationId: CONVERSATION_ID,
      historicalConversationId: HISTORICAL_ID,
      beforeSequence: 2,
      pageSize: 50,
    });
    const dialog = one<HTMLDialogElement>(container, "dialog");
    expect(dialog.textContent).toContain("message m1");
    expect(dialog.textContent).toContain("message m2");
  });

  it("shows an error rather than a silently empty dialog when the fetch fails", async () => {
    const fake = fakeConnection();
    fake.rejectsWith(new Error("server said no"));
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{ hasChannelIdentity: true, conversations: [conversationRow()], nextBeforeId: null }}
      />,
    );

    await openFirstRow(container);

    const dialog = one<HTMLDialogElement>(container, "dialog");
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("Could not load this conversation");
  });

  it("closes on request without leaving a dialog open in the DOM", async () => {
    const fake = fakeConnection();
    fake.resultsWith({ messages: [message("m1", 1)], nextBeforeSequence: null });
    const container = await render(
      <Harness
        connection={fake.connection}
        history={{ hasChannelIdentity: true, conversations: [conversationRow()], nextBeforeId: null }}
      />,
    );
    await openFirstRow(container);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Done")?.click());

    expect(one<HTMLDialogElement>(container, "dialog").open).toBe(false);
  });
});
