import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import { NotConnectedError, type OperatorConnection } from "../realtime/operatorConnection.js";
import type { TeamMessageDto } from "../realtime/protocol/types.js";
import { TeamChatPage } from "./TeamChatPage.js";
import { interact, one, render, unmount } from "../testing/dom.js";

/**
 * `23-32`: what the team chat page itself decides - loading the room, rendering the owner's own
 * label, sending, and living through a disconnect - mirroring `ConversationPage.test.tsx`'s own
 * "hand-written fake connection, not a mocked `@microsoft/signalr`" call for the identical reason:
 * this file is about the page's decisions, and `operatorConnection.test.tsx` already covers the
 * transport layer underneath at the level that needs a fake hub.
 */
// `ConversationPage.test.tsx`'s own precedent, needed for the identical reason: importing the real
// `NotConnectedError` class below evaluates `operatorConnection.ts`'s module body, which reads
// `config.ts` at import time - `config.required()` throws outside a real `.env.local`/CI build. The
// class identity itself (used by this file's `instanceof`-shaped fake) is untouched by mocking the
// module it happens to be re-exported alongside.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

function teamMessage(id: string, sequence: number, overrides: Partial<TeamMessageDto> = {}): TeamMessageDto {
  return {
    id,
    sequence,
    authorOperatorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    authorDisplayName: "Alex",
    authorEmail: "alex@example.invalid",
    authorIsAdmin: false,
    body: `message ${id}`,
    createdAt: "2026-09-06T09:00:00+00:00",
    ...overrides,
  };
}

/** Only the methods `TeamChatPage` reaches for. */
function fakeConnection() {
  let pushMessage: ((message: TeamMessageDto) => void) | null = null;
  let nextSendFails: "not-connected" | null = null;
  const sends: { body: string; clientMessageId: string }[] = [];

  const connection = {
    onTeamMessage(listener: (message: TeamMessageDto) => void) {
      pushMessage = listener;
    },
    getTeamHistory: vi.fn(() => Promise.resolve({ messages: [] as TeamMessageDto[], nextBeforeSequence: null })),
    getTeamDelta: vi.fn(() => Promise.resolve({ messages: [] as TeamMessageDto[], nextBeforeSequence: null })),
    sendTeamMessage: vi.fn((body: string, clientMessageId: string) => {
      sends.push({ body, clientMessageId });
      if (nextSendFails === "not-connected") {
        return Promise.reject(new NotConnectedError());
      }

      return Promise.resolve(1);
    }),
  };

  return {
    connection: connection as unknown as OperatorConnection,
    sends,
    getTeamHistory: connection.getTeamHistory,
    getTeamDelta: connection.getTeamDelta,
    historyReturns(messages: TeamMessageDto[]) {
      connection.getTeamHistory.mockResolvedValue({ messages, nextBeforeSequence: null });
    },
    deltaReturns(messages: TeamMessageDto[]) {
      connection.getTeamDelta.mockResolvedValue({ messages, nextBeforeSequence: null });
    },
    failNextSend() {
      nextSendFails = "not-connected";
    },
    push(message: TeamMessageDto) {
      pushMessage?.(message);
    },
  };
}

function harness(connection: OperatorConnection, connectionState: OperatorConnectionState["connectionState"] = "connected") {
  const state: OperatorConnectionState = {
    connection,
    connectionState,
    serverDraining: false,
    isAway: false,
    setAway: () => Promise.resolve(),
  };

  return (
    <OperatorConnectionContext.Provider value={state}>
      <TeamChatPage />
    </OperatorConnectionContext.Provider>
  );
}

function typeAndSend(container: HTMLElement, body: string): Promise<void> {
  return interact(() => {
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, body);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("TeamChatPage", () => {
  it("loads and renders the room's history, oldest first", async () => {
    const fake = fakeConnection();
    // The keyset page comes back newest-first (the wire convention every history page uses) - the
    // page's own job is to reverse it back into reading order.
    fake.historyReturns([teamMessage("m2", 2, { body: "second" }), teamMessage("m1", 1, { body: "first" })]);

    const container = await render(harness(fake.connection));

    const bodies = Array.from(container.querySelectorAll(".ago-team-message__body")).map((el) => el.textContent);
    expect(bodies).toEqual(["first", "second"]);
  });

  it("labels an admin's own message and nobody else's", async () => {
    const fake = fakeConnection();
    fake.historyReturns([
      teamMessage("m1", 1, { authorIsAdmin: true, authorDisplayName: "The owner" }),
      teamMessage("m2", 2, { authorIsAdmin: false, authorDisplayName: "An operator" }),
    ]);

    const container = await render(harness(fake.connection));

    const badges = Array.from(container.querySelectorAll(".ago-team-message .ago-badge")).map((el) => el.textContent);
    expect(badges).toEqual(["Owner"]);
  });

  it("falls back to a placeholder name for an author with none recorded", async () => {
    const fake = fakeConnection();
    fake.historyReturns([teamMessage("m1", 1, { authorDisplayName: null })]);

    const container = await render(harness(fake.connection));

    expect(one(container, ".ago-team-message__author").textContent).toBe("A colleague");
  });

  it("shows an empty-state message when the room has never had one", async () => {
    const fake = fakeConnection();
    fake.historyReturns([]);

    const container = await render(harness(fake.connection));

    expect(container.textContent).toContain("Nobody has said anything here yet.");
  });

  it("shows a retry action when the initial load fails, and recovers on retry", async () => {
    const fake = fakeConnection();
    fake.getTeamHistory.mockRejectedValueOnce(new Error("network error"));
    fake.historyReturns([teamMessage("m1", 1)]);

    const container = await render(harness(fake.connection));

    expect(container.textContent).toContain("Could not load the team chat");
    await interact(() => {
      const retry = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retry");
      retry?.click();
    });

    expect(one(container, ".ago-team-message__body").textContent).toBe("message m1");
  });

  it("sends on Enter, clears the composer, and renders the live push", async () => {
    const fake = fakeConnection();
    fake.historyReturns([]);
    const container = await render(harness(fake.connection));

    await typeAndSend(container, "hello team");

    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0]?.body).toBe("hello team");
    expect(one<HTMLTextAreaElement>(container, "textarea").value).toBe("");

    // The server never renders anything from the send itself - only the hub's own local-echo push
    // (`OperatorHub.SendTeamMessageAsync`) does, so a real client only ever sees the message once
    // that arrives.
    await interact(() => fake.push(teamMessage("sent-1", 1, { body: "hello team", clientMessageId: fake.sends[0]?.clientMessageId })));

    expect(one(container, ".ago-team-message__body").textContent).toBe("hello team");
  });

  it("shows a send error and keeps the typed text when not connected", async () => {
    const fake = fakeConnection();
    fake.historyReturns([]);
    fake.failNextSend();
    const container = await render(harness(fake.connection));

    await typeAndSend(container, "will this go through");

    expect(container.textContent).toContain("Could not send that message");
    expect(one<HTMLTextAreaElement>(container, "textarea").value).toBe("will this go through");
  });

  it("does not deliver the same message twice when the fan-out echoes the sender's own push", async () => {
    const fake = fakeConnection();
    fake.historyReturns([]);
    const container = await render(harness(fake.connection));

    const dto = teamMessage("dup-1", 1, { body: "once" });
    await interact(() => fake.push(dto));
    await interact(() => fake.push(dto));

    expect(container.querySelectorAll(".ago-team-message").length).toBe(1);
  });

  it("does not call the hub at all until the connection actually reports connected", async () => {
    // `23-32`: the real bug the ux-gate's own `team-chat` screen caught - `OperatorConnectionProvider`
    // starts every session in "connecting" and mounts this page immediately, before the first
    // `connection.start()` resolves. A first cut of this page called `getTeamHistory` unconditionally
    // on mount and crashed with `OperatorConnection`'s own "no connection has been started yet" - a
    // fake connection (this file's own `fakeConnection()`) never reproduces that, because a fake has
    // no connection lifecycle to be caught not having started, which is exactly why this test asserts
    // the call count instead of trusting a resolved promise to mean the timing was safe.
    const fake = fakeConnection();
    fake.historyReturns([teamMessage("m1", 1)]);

    await render(harness(fake.connection, "connecting"));

    expect(fake.getTeamHistory).not.toHaveBeenCalled();
    expect(fake.getTeamDelta).not.toHaveBeenCalled();
  });

  it("loads history the moment the connection first reports connected, even after starting disconnected", async () => {
    const fake = fakeConnection();
    fake.historyReturns([teamMessage("m1", 1, { body: "hello" })]);

    const container = await render(harness(fake.connection, "connecting"));
    expect(fake.getTeamHistory).not.toHaveBeenCalled();

    await render(harness(fake.connection, "connected"));

    expect(fake.getTeamHistory).toHaveBeenCalledTimes(1);
    // The very first "connected" a page ever sees is the initial load, never the reconnect delta -
    // there is nothing to have missed yet.
    expect(fake.getTeamDelta).not.toHaveBeenCalled();
    expect(one(container, ".ago-team-message__body").textContent).toBe("hello");
  });

  it("catches up on a genuine reconnect (after history was already loaded once) by asking for the delta since the last sequence it saw", async () => {
    const fake = fakeConnection();
    fake.historyReturns([teamMessage("m1", 1, { body: "before" })]);
    fake.deltaReturns([teamMessage("m2", 2, { body: "missed while disconnected" })]);

    // First connect: loads history normally.
    const container = await render(harness(fake.connection, "connected"));
    expect(fake.getTeamHistory).toHaveBeenCalledTimes(1);
    expect(fake.getTeamDelta).not.toHaveBeenCalled();

    // The socket drops, then comes back - only *this* transition is the reconnect.
    await render(harness(fake.connection, "reconnecting"));
    await render(harness(fake.connection, "connected"));

    expect(fake.getTeamDelta).toHaveBeenCalledWith(1);
    expect(fake.getTeamHistory).toHaveBeenCalledTimes(1); // never re-fetched as a whole page.
    const bodies = Array.from(container.querySelectorAll(".ago-team-message__body")).map((el) => el.textContent);
    expect(bodies).toEqual(["before", "missed while disconnected"]);
  });
});
