import { describe, expect, it } from "vitest";
import { visitorEmojiPrefix } from "./visitorEmoji.js";

/** `25-56`: the null-handling this helper exists to centralise, proved once here rather than only
 * through the two components that call it (`ConversationList.test.tsx`, `ConversationPage.test.tsx`) -
 * this is the unit-level case, those are the render-level ones. */
describe("visitorEmojiPrefix", () => {
  it("renders the pair, trailing space included, when both halves are present", () => {
    expect(visitorEmojiPrefix({ emojiCreature: "🐔", emojiFood: "🍊" })).toBe("🐔🍊 ");
  });

  it("renders nothing when both are absent", () => {
    expect(visitorEmojiPrefix({})).toBe("");
  });

  it("renders nothing when both are explicitly null", () => {
    expect(visitorEmojiPrefix({ emojiCreature: null, emojiFood: null })).toBe("");
  });

  it("renders nothing when only the creature half is present", () => {
    expect(visitorEmojiPrefix({ emojiCreature: "🐔", emojiFood: null })).toBe("");
  });

  it("renders nothing when only the food half is present", () => {
    expect(visitorEmojiPrefix({ emojiCreature: null, emojiFood: "🍊" })).toBe("");
  });
});
