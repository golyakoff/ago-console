import { describe, expect, it } from "vitest";
import { visitorEmojiNamesEn } from "../i18n/visitorEmojiNames.js";
import {
  hasEmojiPair,
  visitorDisplayPrefix,
  visitorEmojiPrefix,
  visitorFallbackLabel,
  visitorLabel,
  visitorLabelWithShortId,
  visitorQueueRowLabel,
} from "./visitorEmoji.js";

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

describe("hasEmojiPair", () => {
  it("is true only when both halves are present", () => {
    expect(hasEmojiPair({ emojiCreature: "🐔", emojiFood: "🍊" })).toBe(true);
  });

  it("is false when both are absent, both are null, or only one half is present", () => {
    expect(hasEmojiPair({})).toBe(false);
    expect(hasEmojiPair({ emojiCreature: null, emojiFood: null })).toBe(false);
    expect(hasEmojiPair({ emojiCreature: "🐔", emojiFood: null })).toBe(false);
    expect(hasEmojiPair({ emojiCreature: null, emojiFood: "🍊" })).toBe(false);
  });
});

/**
 * `25-207`: the fallback half of this item's own Scope - a nameless visitor's label reads as
 * `{localized creature} · {localized food}` rather than the bare glyphs. Uses the real English table
 * (`visitorEmojiNamesEn`), not a hand-built stand-in - `visitorEmojiNames.test.ts` is the file that
 * proves the table's own completeness against `VisitorEmojiDictionary.cs`; this file only proves the
 * composition rule built on top of it.
 */
describe("visitorFallbackLabel", () => {
  it("renders the localized pair, joined by a middle dot, with a trailing space", () => {
    expect(visitorFallbackLabel({ emojiCreature: "🦉", emojiFood: "🍓" }, visitorEmojiNamesEn)).toBe(
      "Owl · Strawberry ",
    );
  });

  it("renders nothing when the pair is absent", () => {
    expect(visitorFallbackLabel({}, visitorEmojiNamesEn)).toBe("");
  });

  it("renders nothing when only one half of the pair is present", () => {
    expect(visitorFallbackLabel({ emojiCreature: "🦉", emojiFood: null }, visitorEmojiNamesEn)).toBe("");
  });

  it("falls back to the raw glyph for a glyph missing from the table, rather than throwing or going blank", () => {
    expect(visitorFallbackLabel({ emojiCreature: "🦉", emojiFood: "🛸" }, visitorEmojiNamesEn)).toBe("Owl · 🛸 ");
  });
});

/**
 * `25-207`'s own call-site function: a real name always wins (reusing `visitorNameSuffix` unchanged -
 * proving that branch is untouched, not merely asserting it), and the localized pair is only ever the
 * fallback for the exact case `visitorNameSuffix` already treats as "no name".
 */
describe("visitorLabel", () => {
  it("renders the real name, unchanged, when one is known - the pair plays no part", () => {
    expect(
      visitorLabel({ emojiCreature: "🦉", emojiFood: "🍓", visitorName: "Иван Иванов" }, visitorEmojiNamesEn),
    ).toBe("Иван Иванов ");
  });

  it("falls through to the localized pair label when no real name is known", () => {
    expect(visitorLabel({ emojiCreature: "🦉", emojiFood: "🍓", visitorName: null }, visitorEmojiNamesEn)).toBe(
      "Owl · Strawberry ",
    );
  });

  it("treats a blank name the same as an absent one, falling through to the pair label", () => {
    expect(visitorLabel({ emojiCreature: "🦉", emojiFood: "🍓", visitorName: "   " }, visitorEmojiNamesEn)).toBe(
      "Owl · Strawberry ",
    );
  });

  it("renders nothing when neither a name nor a pair is known - the pre-25-207 case, unchanged", () => {
    expect(visitorLabel({}, visitorEmojiNamesEn)).toBe("");
  });
});

/**
 * `26-31`: the queue row's own label, and specifically the one case the short code survives.
 */
describe("visitorQueueRowLabel", () => {
  const id = "0a1b2c3d-4444-4444-4444-444444444444";

  it("is the visitor's own name, with no short code after it", () => {
    expect(
      visitorQueueRowLabel(
        { emojiCreature: "🦉", emojiFood: "🍓", visitorName: "Иван Иванов", visitorId: id },
        visitorEmojiNamesEn,
      ),
    ).toBe("Иван Иванов");
  });

  it("is the localized pair label, with no short code after it, when no name is known", () => {
    expect(
      visitorQueueRowLabel({ emojiCreature: "🦉", emojiFood: "🍓", visitorName: null, visitorId: id }, visitorEmojiNamesEn),
    ).toBe("Owl · Strawberry");
  });

  it("falls back to the short code for a visitor with neither a name nor a pair - never a blank badge", () => {
    expect(visitorQueueRowLabel({ visitorId: id }, visitorEmojiNamesEn)).toBe("0a1b2c3d");
  });

  it("falls back to the short code when only one half of the pair is present", () => {
    expect(
      visitorQueueRowLabel({ emojiCreature: "🦉", emojiFood: null, visitorId: id }, visitorEmojiNamesEn),
    ).toBe("0a1b2c3d");
  });
});

/**
 * `26-201`: the "Name (id)" variant `AdminConversationsPage`'s visitor column and a message alert's
 * body both share - unlike `visitorQueueRowLabel`, the short id is never dropped: it survives
 * parenthesised after whatever label `visitorLabel` produced, since both those call sites keep an
 * existing reader's ability to quote the short id verbatim even once a human-readable label sits
 * beside it.
 */
describe("visitorLabelWithShortId", () => {
  const id = "0a1b2c3d-4444-4444-4444-444444444444";

  it("is the visitor's own name, with the short id kept alongside in parens", () => {
    expect(
      visitorLabelWithShortId(
        { emojiCreature: "🦉", emojiFood: "🍓", visitorName: "Иван Иванов", visitorId: id },
        visitorEmojiNamesEn,
      ),
    ).toBe("Иван Иванов (0a1b2c3d)");
  });

  it("is the localized pair label, with the short id kept alongside in parens, when no name is known", () => {
    expect(
      visitorLabelWithShortId({ emojiCreature: "🦉", emojiFood: "🍓", visitorName: null, visitorId: id }, visitorEmojiNamesEn),
    ).toBe("Owl · Strawberry (0a1b2c3d)");
  });

  it("falls back to the bare short id, with no parens, for a visitor with neither a name nor a pair", () => {
    expect(visitorLabelWithShortId({ visitorId: id }, visitorEmojiNamesEn)).toBe("0a1b2c3d");
  });

  it("falls back to the bare short id when only one half of the pair is present", () => {
    expect(
      visitorLabelWithShortId({ emojiCreature: "🦉", emojiFood: null, visitorId: id }, visitorEmojiNamesEn),
    ).toBe("0a1b2c3d");
  });
});
