import { describe, expect, it } from "vitest";
import { visitorDisplayPrefix, visitorEmojiPrefix } from "./visitorEmoji.js";

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

/** `25-56`'s own second half: the same unit-level/render-level split - this proves
 * `visitorDisplayPrefix`'s own composition rule (pair, then name, then the space the short code
 * needs), `ConversationList.test.tsx`/`ConversationPage.test.tsx` prove it renders at the two real
 * call sites. */
describe("visitorDisplayPrefix", () => {
  it("renders the pair, the name, and a trailing space, when both are known", () => {
    expect(visitorDisplayPrefix({ emojiCreature: "🐔", emojiFood: "🍊", visitorName: "Иван Иванов" })).toBe(
      "🐔🍊 Иван Иванов ",
    );
  });

  it("renders only the pair, exactly as visitorEmojiPrefix would, when the name is not yet given", () => {
    expect(visitorDisplayPrefix({ emojiCreature: "🐔", emojiFood: "🍊", visitorName: null })).toBe("🐔🍊 ");
  });

  it("renders only the name, no leading space, when the pair is absent", () => {
    expect(visitorDisplayPrefix({ visitorName: "Иван Иванов" })).toBe("Иван Иванов ");
  });

  it("renders nothing when neither is known", () => {
    expect(visitorDisplayPrefix({})).toBe("");
  });

  it("treats a blank name the same as an absent one", () => {
    expect(visitorDisplayPrefix({ emojiCreature: "🐔", emojiFood: "🍊", visitorName: "   " })).toBe("🐔🍊 ");
  });
});
