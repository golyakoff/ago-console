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
  it("uses the server's count as-is when nothing has happened since it was fetched", () => {
    // `5-15`: this is no longer a "fallback" - the server's number is now the truth, because the
    // server finally has a way to bring it down.
    const c = conversation("a", { operatorUnreadCount: 3 });
    expect(unreadCountFor(c, {})).toBe(3);
  });

  it("ignores the snapshot's count once a mark-read has succeeded against it", () => {
    // Opening alone no longer clears the badge - a confirmed server write does. Until the next queue
    // fetch, the snapshot in hand still carries the pre-clear number, so it is the one ignored.
    const c = conversation("a", { operatorUnreadCount: 12 });
    const states = applyAttentionEvent({}, { kind: "cleared", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(0);
  });

  it("does not clear the badge on open alone, before the server has confirmed", () => {
    const c = conversation("a", { operatorUnreadCount: 12 });
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(12);
  });

  it("counts messages that arrive while the operator is looking at a different conversation", () => {
    const c = conversation("a", { operatorUnreadCount: 12 });
    let states = applyAttentionEvent({}, { kind: "cleared", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "incoming", conversationId: "a" });
    states = applyAttentionEvent(states, { kind: "incoming", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(2);
  });

  it("adds arrivals on top of the server count for a conversation nothing has happened to here", () => {
    const c = conversation("a", { operatorUnreadCount: 1 });
    const states = applyAttentionEvent({}, { kind: "incoming", conversationId: "a" });

    expect(unreadCountFor(c, states)).toBe(2);
  });

  it("stops double-counting an arrival once the queue snapshot has caught up with it", () => {
    // The bug `11-06`'s version had and `5-15` fixes: a locally counted message stayed added on top
    // of every later snapshot, including the ones that already contained it.
    const before = conversation("a", { operatorUnreadCount: 1 });
    const afterPoll = conversation("a", { operatorUnreadCount: 2 });
    let states = applyAttentionEvent({}, { kind: "incoming", conversationId: "a" });
    expect(unreadCountFor(before, states)).toBe(2);

    states = applyAttentionEvent(states, { kind: "refetched" });
    expect(unreadCountFor(afterPoll, states)).toBe(2);
  });

  it("stops suppressing a cleared count once the queue snapshot reflects the clear", () => {
    const stale = conversation("a", { operatorUnreadCount: 5 });
    const fresh = conversation("a", { operatorUnreadCount: 0 });
    let states = applyAttentionEvent({}, { kind: "cleared", conversationId: "a" });
    expect(unreadCountFor(stale, states)).toBe(0);

    states = applyAttentionEvent(states, { kind: "refetched" });
    expect(unreadCountFor(fresh, states)).toBe(0);
    // And a message that genuinely arrived after the clear is counted by the server, not hidden.
    expect(unreadCountFor(conversation("a", { operatorUnreadCount: 1 }), states)).toBe(1);
  });
});

describe("applyAttentionEvent", () => {
  it("returns the identical state object for a redundant open, so React does not re-render", () => {
    const states = applyAttentionEvent({}, { kind: "opened", conversationId: "a" });
    expect(applyAttentionEvent(states, { kind: "opened", conversationId: "a" })).toBe(states);
  });

  it("returns the identical state object for a redundant clear", () => {
    // The console re-issues mark-read whenever the newest sequence moves; a repeat for a position
    // already confirmed must not churn React state.
    const states = applyAttentionEvent({}, { kind: "cleared", conversationId: "a" });
    expect(applyAttentionEvent(states, { kind: "cleared", conversationId: "a" })).toBe(states);
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

  it("keeps the new marker across a queue refetch", () => {
    // A snapshot says nothing about whether the operator has looked at a row, so a refetch is not
    // evidence against the marker - unlike the two freshness adjustments, which it supersedes.
    let states: ReadStateMap = applyAttentionEvent({}, { kind: "assigned", conversationId: "b" });
    states = applyAttentionEvent(states, { kind: "refetched" });

    expect(isNewlyAssigned(conversation("b"), states)).toBe(true);
  });
});

describe("totalUnread", () => {
  it("sums across the assigned list only", () => {
    const assigned = [conversation("a", { operatorUnreadCount: 2 }), conversation("b", { operatorUnreadCount: 3 })];
    expect(totalUnread(assigned, {})).toBe(5);
  });

  it("respects a conversation the server has confirmed read", () => {
    const assigned = [conversation("a", { operatorUnreadCount: 2 }), conversation("b", { operatorUnreadCount: 3 })];
    const states = applyAttentionEvent({}, { kind: "cleared", conversationId: "a" });

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
