import { useEffect } from "react";
import type { User } from "oidc-client-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/AuthContext.js";
import { interact, render, unmount } from "../testing/dom.js";
import { ConversationsAttentionProvider } from "./ConversationsAttentionProvider.js";
import { useConversationsAttention } from "./ConversationsAttentionContext.js";

const conversationsApi = vi.hoisted(() => ({ fetchOperatorQueue: vi.fn() }));
vi.mock("../api/conversationsApi.js", () => conversationsApi);

function signedIn(): User {
  return { access_token: "token", profile: { sub: "operator-sub" } } as unknown as User;
}

function Signed({ children }: { children: React.ReactNode }) {
  const auth: AuthState = {
    user: signedIn(),
    isLoading: false,
    isSigningOut: false,
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function queueOf(counts: Record<string, number>) {
  return {
    assignedToMe: Object.entries(counts).map(([conversationId, operatorUnreadCount]) => ({
      conversationId,
      visitorId: `visitor-${conversationId}`,
      state: "Assigned",
      createdAt: "2026-08-25T09:00:00+00:00",
      operatorUnreadCount,
    })),
    waiting: [],
  };
}

function Probe({ onResult }: { onResult: (total: number, applyEvent: ReturnType<typeof useConversationsAttention>["applyEvent"]) => void }) {
  const { unreadTotal, applyEvent } = useConversationsAttention();
  useEffect(() => {
    onResult(unreadTotal, applyEvent);
  });
  return null;
}

afterEach(async () => {
  await unmount();
});

beforeEach(() => {
  conversationsApi.fetchOperatorQueue.mockReset();
});

describe("ConversationsAttentionProvider", () => {
  it("reports 0, and reads no queue, when nothing is mounted inside it (the fallback every unrelated shell test relies on)", async () => {
    const results: number[] = [];

    await render(<Probe onResult={(total) => results.push(total)} />);

    expect(conversationsApi.fetchOperatorQueue).not.toHaveBeenCalled();
    expect(results.at(-1)).toBe(0);
  });

  it("fetches the queue with no tag filter at all, and sums every assigned conversation's own unread count", async () => {
    conversationsApi.fetchOperatorQueue.mockResolvedValue(queueOf({ "conv-1": 2, "conv-2": 3 }));
    const results: number[] = [];

    await render(
      <Signed>
        <ConversationsAttentionProvider>
          <Probe onResult={(total) => results.push(total)} />
        </ConversationsAttentionProvider>
      </Signed>,
    );

    // No tag filter - `undefined` (`ago-api/queue` reads `tagIds ?? []`, appending nothing) - the
    // provider's own always-unfiltered vantage point, never `WorkspaceLayout`'s own narrowed one.
    expect(conversationsApi.fetchOperatorQueue).toHaveBeenCalledWith("token");
    expect(results.at(-1)).toBe(5);
  });

  it("drops a conversation's own contribution immediately on a forwarded 'cleared' event - no waiting for the next poll", async () => {
    // `25-51`'s own Done-when: reading a conversation clears its badge. `WorkspaceLayout` forwards
    // this event the instant its own `markConversationRead` call succeeds - this proves the total
    // reacts to that forward synchronously, not on this provider's own next unfiltered poll.
    conversationsApi.fetchOperatorQueue.mockResolvedValue(queueOf({ "conv-1": 2, "conv-2": 3 }));
    let applyEvent: ReturnType<typeof useConversationsAttention>["applyEvent"] = () => {};
    const results: number[] = [];

    await render(
      <Signed>
        <ConversationsAttentionProvider>
          <Probe onResult={(total, apply) => {
            results.push(total);
            applyEvent = apply;
          }} />
        </ConversationsAttentionProvider>
      </Signed>,
    );

    expect(results.at(-1)).toBe(5);

    await interact(() => applyEvent({ kind: "cleared", conversationId: "conv-1" }));

    expect(results.at(-1)).toBe(3);
    // No second fetch was needed to learn this - the whole point of forwarding the event.
    expect(conversationsApi.fetchOperatorQueue).toHaveBeenCalledTimes(1);
  });

  it("counts a live 'incoming' event immediately, on top of the last fetched snapshot", async () => {
    conversationsApi.fetchOperatorQueue.mockResolvedValue(queueOf({ "conv-1": 2 }));
    let applyEvent: ReturnType<typeof useConversationsAttention>["applyEvent"] = () => {};
    const results: number[] = [];

    await render(
      <Signed>
        <ConversationsAttentionProvider>
          <Probe onResult={(total, apply) => {
            results.push(total);
            applyEvent = apply;
          }} />
        </ConversationsAttentionProvider>
      </Signed>,
    );

    expect(results.at(-1)).toBe(2);

    await interact(() => applyEvent({ kind: "incoming", conversationId: "conv-1" }));

    expect(results.at(-1)).toBe(3);
  });
});
