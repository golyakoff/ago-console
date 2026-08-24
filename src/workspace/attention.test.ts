import { describe, expect, it } from "vitest";
import {
  applyAttentionEvent,
  documentTitleFor,
  isNewlyAssigned,
  oldestFirst,
  totalUnread,
  unreadCountFor,
  type ReadStateMap,
} from "./attention.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

function conversation(
  conversationId: string,
  overrides: Partial<ConversationSummaryDto> = {},
): ConversationSummaryDto {
  return {
    conversationId,
    visitorId: `visitor-${conversationId}`,
    state: "Assigned",
    createdAt: "2026-08-24T10:00:00+00:00",
    operatorUnreadCount: 0,
    ...overrides,
  };
}

describe("unreadCountFor", () => {
  it("falls back to the server's count for a conversation this session has never opened", () => {
    const c = conversation("a", { operatorUnreadCount: 3 });
    expect(unreadCountFor(c, {})).toBe(3);
  });

  it("drops the server's count once the operator has actually opened the conversation", () => {
    // The server's counter is monotonic - nothing in ago-chat ever clears it - so continuing to
    // trust it after the operator has read the thread is what would make the badge a lie.
    const c = conversation("a", { operatorUnreadCount: 12 });
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(0);
  });

  it("counts messages that arrive while the operator is looking at a different conversation", () => {
    const c = conversation("a", { operatorUnreadCount: 12 });
    let states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "incoming", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "incoming", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(2);
  });

  it("adds arrivals on top of the server count for a conversation never opened here", () => {
    const c = conversation("a", { operatorUnreadCount: 1 });
    const states = applyAttentionEvent({}, { kind: "incoming", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(2);
  });

  it("clears again when the operator re-opens it", () => {
    const c = conversation("a", { operatorUnreadCount: 4 });
    let states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "incoming", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "opened", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(0);
  });
});

describe("applyAttentionEvent", () => {
  it("returns the identical state object for a redundant open, so React does not re-render", () => {
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });
    expect(applyAttentionEvent(states, { kind: "opened", conversationId: "a" })).toBe(states);
  });

  it("does not mark a conversation the operator is already looking at as newly assigned", () => {
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });
    const after = applyAttentionEvent(states, { kind: "assigned", conversationId: "a" });

    expect(isNewlyAssigned(conversation("a"), after)).toBe(false);
    expect(after).toBe(states);
  });

  it("marks an assignment that arrives for a conversation not on screen", () => {
    const states = applyAttentionEvent({}, { kind: "assigned", conversationId: "b" });
    expect(isNewlyAssigned(conversation("b"), states)).toBe(true);
  });

  it("clears the new marker as soon as the conversation is opened", () => {
    let states: ReadStateMap = applyAttentionEvent({}, { kind: "assigned", conversationId: "b" });
    states = applyAttentionEvent(states, { kind: "opened", conversationId: "b" });

    expect(isNewlyAssigned(conversation("b"), states)).toBe(false);
  });
});

describe("totalUnread", () => {
  it("sums across the assigned list only", () => {
    const assigned = [conversation("a", { operatorUnreadCount: 2 }), conversation("b", { operatorUnreadCount: 3 })];
    expect(totalUnread(assigned, {})).toBe(5);
  });

  it("respects what has already been read", () => {
    const assigned = [conversation("a", { operatorUnreadCount: 2 }), conversation("b", { operatorUnreadCount: 3 })];
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });

    expect(totalUnread(assigned, states)).toBe(3);
  });
});

describe("documentTitleFor", () => {
  it("puts the count first, where a truncated tab title still shows it", () => {
    expect(documentTitleFor(3, "AGO Chat operator console")).toBe("(3) AGO Chat operator console");
  });

  it("leaves the title alone at zero rather than rendering (0)", () => {
    expect(documentTitleFor(0, "AGO Chat operator console")).toBe("AGO Chat operator console");
  });
});

describe("oldestFirst", () => {
  it("puts the longest-waiting conversation at the top", () => {
    const rows = [
      conversation("new", { createdAt: "2026-08-24T12:00:00+00:00" }),
      conversation("old", { createdAt: "2026-08-24T09:00:00+00:00" }),
      conversation("middle", { createdAt: "2026-08-24T10:30:00+00:00" }),
    ];

    expect(oldestFirst(rows).map((c) => c.conversationId)).toEqual(["old", "middle", "new"]);
  });

  it("breaks a tie deterministically, so the list does not reshuffle on every poll", () => {
    const rows = [conversation("b"), conversation("a")];
    expect(oldestFirst(rows).map((c) => c.conversationId)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [conversation("b", { createdAt: "2026-08-24T12:00:00+00:00" }), conversation("a")];
    oldestFirst(rows);

    expect(rows.map((c) => c.conversationId)).toEqual(["b", "a"]);
  });
});
