import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import type { OperatorConnection } from "../realtime/operatorConnection.js";
import type { TeamMessageDto } from "../realtime/protocol/types.js";
import { interact, render, unmount } from "../testing/dom.js";
import { TeamChatUnreadProvider } from "./TeamChatUnreadProvider.js";
import { useTeamChatUnread, useTeamChatUnreadBadge } from "./TeamChatUnreadContext.js";

const MY_OPERATOR_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_OPERATOR_ID = "22222222-2222-2222-2222-222222222222";

function teamMessage(overrides: Partial<TeamMessageDto> = {}): TeamMessageDto {
  return {
    id: "msg-1",
    sequence: 1,
    authorOperatorId: OTHER_OPERATOR_ID,
    authorDisplayName: "Kim",
    authorEmail: null,
    authorIsAdmin: false,
    body: "Hello",
    createdAt: "2026-09-19T09:00:00+00:00",
    ...overrides,
  };
}

function permissionsValue(): PermissionsState {
  return {
    permissions: [],
    operatorId: MY_OPERATOR_ID,
    siteId: null,
    locale: null,
    enabledModules: [],
    credentialsArePublished: false,
    hasPermission: () => false,
    tenancies: null,
    activeSiteId: null,
    switchTenancy: () => undefined,
  };
}

/** Captures whichever callback `TeamChatUnreadProvider` registers via `connection.onTeamMessage` so
 * a test can simulate a hub push by simply invoking it - the identical "fake connection with a
 * capturing mock" shape `TeamChatPage.test.tsx`'s own harness already uses for the same method. */
function fakeConnection(): { connection: OperatorConnection; push: (message: TeamMessageDto) => void } {
  let listener: ((message: TeamMessageDto) => void) | null = null;
  const connection = {
    onTeamMessage: vi.fn((l: (message: TeamMessageDto) => void) => {
      listener = l;
    }),
  } as unknown as OperatorConnection;

  return {
    connection,
    push: (message) => {
      if (listener === null) {
        throw new Error("onTeamMessage was never registered");
      }
      (listener)(message);
    },
  };
}

function connectionState(connection: OperatorConnection): OperatorConnectionState {
  return { connection, connectionState: "connected", serverDraining: false, isAway: false, setAway: () => Promise.resolve() };
}

function Probe({
  onResult,
}: {
  onResult: (value: ReturnType<typeof useTeamChatUnread>) => void;
}) {
  const value = useTeamChatUnread();
  useEffect(() => {
    onResult(value);
  });
  return null;
}

function BadgeProbe({ onResult }: { onResult: (count: number) => void }) {
  const count = useTeamChatUnreadBadge();
  useEffect(() => {
    onResult(count);
  });
  return null;
}

afterEach(async () => {
  await unmount();
});

/**
 * `25-163`'s own Done-when: "'Общение' shows an unread-count badge in the nav when there are unread
 * team-chat messages" and "the badge clears (or decrements) when those messages are read" - both
 * proved here, at the provider level, by simulating a real hub push through the identical
 * `onTeamMessage` registration `TeamChatUnreadProvider` actually makes, not by calling its internal
 * state setters directly.
 */
describe("TeamChatUnreadProvider", () => {
  it("increments the unread count when a team message arrives from another operator", async () => {
    const fake = fakeConnection();
    const results: number[] = [];

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <Probe onResult={(value) => results.push(value.unreadCount)} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    expect(results.at(-1)).toBe(0);

    await interact(() => fake.push(teamMessage({ id: "msg-1" })));
    expect(results.at(-1)).toBe(1);

    await interact(() => fake.push(teamMessage({ id: "msg-2" })));
    expect(results.at(-1)).toBe(2);
  });

  it("does not count this operator's own message, echoed back through the identical push", async () => {
    const fake = fakeConnection();
    const results: number[] = [];

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <Probe onResult={(value) => results.push(value.unreadCount)} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    await interact(() => fake.push(teamMessage({ authorOperatorId: MY_OPERATOR_ID })));

    expect(results.at(-1)).toBe(0);
  });

  it("clears the count once 'Общение' reports itself open - the badge's own 'read' signal", async () => {
    const fake = fakeConnection();
    const results: number[] = [];
    let value: ReturnType<typeof useTeamChatUnread> | null = null;

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <Probe onResult={(v) => {
              results.push(v.unreadCount);
              value = v;
            }} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    await interact(() => fake.push(teamMessage()));
    expect(results.at(-1)).toBe(1);

    await interact(() => value?.notifyOpen(true));
    expect(results.at(-1)).toBe(0);
  });

  it("does not increment while 'Общение' is open - the page itself already shows the message live", async () => {
    const fake = fakeConnection();
    const results: number[] = [];
    let value: ReturnType<typeof useTeamChatUnread> | null = null;

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <Probe onResult={(v) => {
              results.push(v.unreadCount);
              value = v;
            }} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    await interact(() => value?.notifyOpen(true));
    await interact(() => fake.push(teamMessage()));

    expect(results.at(-1)).toBe(0);
  });

  it("delivers every push to a subscriber - TeamChatPage's own way of rendering the live message", async () => {
    const fake = fakeConnection();
    const received: TeamMessageDto[] = [];
    let value: ReturnType<typeof useTeamChatUnread> | null = null;

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <Probe onResult={(v) => { value = v; }} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    const unsubscribe = value.subscribe((message) => received.push(message));
    const sent = teamMessage({ id: "msg-live" });
    await interact(() => fake.push(sent));

    expect(received).toEqual([sent]);

    unsubscribe();
    await interact(() => fake.push(teamMessage({ id: "msg-after-unsubscribe" })));
    expect(received).toEqual([sent]);
  });
});

/** `25-163`: `OperatorShell` reads this tolerant hook, not `useTeamChatUnread()` - the identical
 * "several test harnesses mount this shell without every provider" reason `usePendingBookingsBadge`
 * already states for its own bare `useContext` read. */
describe("useTeamChatUnreadBadge", () => {
  it("reports 0, and calls nothing, when no TeamChatUnreadProvider is mounted", async () => {
    const results: number[] = [];

    await render(<BadgeProbe onResult={(count) => results.push(count)} />);

    expect(results.at(-1)).toBe(0);
  });

  it("reports the real count once a provider is mounted", async () => {
    const fake = fakeConnection();
    const results: number[] = [];

    await render(
      <PermissionsContext.Provider value={permissionsValue()}>
        <OperatorConnectionContext.Provider value={connectionState(fake.connection)}>
          <TeamChatUnreadProvider>
            <BadgeProbe onResult={(count) => results.push(count)} />
          </TeamChatUnreadProvider>
        </OperatorConnectionContext.Provider>
      </PermissionsContext.Provider>,
    );

    await interact(() => fake.push(teamMessage()));

    expect(results.at(-1)).toBe(1);
  });
});
