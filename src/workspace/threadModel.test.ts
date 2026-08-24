import { describe, expect, it } from "vitest";
import { buildThread } from "./threadModel.js";
import type { MessageDto } from "../realtime/protocol/types.js";

function message(sequence: number, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: `m${sequence}`,
    sequence,
    authorKind: "Visitor",
    authorId: "visitor-1",
    body: `message ${sequence}`,
    createdAt: "2026-08-24T10:00:00+00:00",
    ...overrides,
  };
}

const MOSCOW = "Europe/Moscow";

describe("buildThread", () => {
  it("orders by sequence, never by the timestamp on the message", () => {
    // Deliberately contradictory: the later sequence carries the earlier clock reading, which is
    // exactly what two clocks disagreeing looks like. Sequence wins.
    const items = buildThread(
      [
        message(2, { createdAt: "2026-08-24T10:00:00+00:00" }),
        message(1, { createdAt: "2026-08-24T10:00:05+00:00" }),
      ],
      "UTC",
    );

    expect(items.filter((i) => i.kind === "message").map((i) => i.message.sequence)).toEqual([1, 2]);
  });

  it("opens the thread with a day separator", () => {
    const items = buildThread([message(1)], "UTC");

    expect(items[0]).toMatchObject({ kind: "day", key: "2026-08-24" });
    expect(items[1]).toMatchObject({ kind: "message" });
  });

  it("inserts a separator when the day changes in the rendering zone", () => {
    // 20:30 and 21:30 UTC are the same UTC day but straddle midnight in Moscow (+03:00). Deriving
    // the day from the ISO string would render one day separator here instead of two.
    const items = buildThread(
      [message(1, { createdAt: "2026-08-24T20:30:00+00:00" }), message(2, { createdAt: "2026-08-24T21:30:00+00:00" })],
      MOSCOW,
    );

    expect(items.filter((i) => i.kind === "day").map((i) => i.key)).toEqual(["2026-08-24", "2026-08-25"]);
  });

  it("groups consecutive messages from the same author", () => {
    const items = buildThread([message(1), message(2), message(3)], "UTC");
    const messages = items.filter((i) => i.kind === "message");

    expect(messages.map((i) => i.startsGroup)).toEqual([true, false, false]);
  });

  it("starts a new group when the other side speaks", () => {
    const items = buildThread(
      [
        message(1),
        message(2, { authorKind: "Operator", authorId: "operator-1" }),
        message(3, { authorKind: "Operator", authorId: "operator-1" }),
        message(4),
      ],
      "UTC",
    );

    expect(items.filter((i) => i.kind === "message").map((i) => i.startsGroup)).toEqual([true, true, false, true]);
  });

  it("starts a new group for a different operator, not just a different side", () => {
    const items = buildThread(
      [
        message(1, { authorKind: "Operator", authorId: "operator-1" }),
        message(2, { authorKind: "Operator", authorId: "operator-2" }),
      ],
      "UTC",
    );

    expect(items.filter((i) => i.kind === "message").map((i) => i.startsGroup)).toEqual([true, true]);
  });

  it("breaks the group across a day boundary even for the same author", () => {
    const items = buildThread(
      [message(1, { createdAt: "2026-08-24T10:00:00+00:00" }), message(2, { createdAt: "2026-08-25T10:00:00+00:00" })],
      "UTC",
    );

    expect(items.filter((i) => i.kind === "message").map((i) => i.startsGroup)).toEqual([true, true]);
  });

  it("keeps a message with an unusable timestamp in the thread rather than dropping it", () => {
    const items = buildThread([message(1), message(2, { createdAt: "nonsense" })], "UTC");
    const messages = items.filter((i) => i.kind === "message");

    expect(messages).toHaveLength(2);
    expect(messages[1]?.at).toBeNull();
    // It joins the open day rather than opening a spurious second separator.
    expect(items.filter((i) => i.kind === "day")).toHaveLength(1);
  });

  it("returns nothing for an empty thread", () => {
    expect(buildThread([], "UTC")).toEqual([]);
  });
});
