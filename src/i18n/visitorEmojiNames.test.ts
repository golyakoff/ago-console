import { describe, expect, it } from "vitest";
import { localizedEmojiName, visitorEmojiNamesEn, visitorEmojiNamesRu } from "./visitorEmojiNames.js";

/**
 * `25-207`: the build-time check its own backlog item's Done-when asks for, in place of "a one-time
 * manual copy" - `ago-console` cannot literally import `VisitorEmojiDictionary.cs`, so the realistic
 * mechanism (named in the backlog item itself) is a second, independent copy-paste of the same 40
 * glyphs, hardcoded here as its own string literal, asserting every one of them resolves to a real
 * name in both `visitorEmojiNamesEn` and `visitorEmojiNamesRu`.
 *
 * This is deliberately a **second** transcription, not a shared import from `visitorEmojiNames.ts`
 * itself - a test that imports the same array it is checking would pass even if that array silently
 * dropped a member (or carried the wrong, variation-selector-mismatched glyph), which is exactly the
 * "we were careful once" failure mode this test exists to be stronger than. Both this list and
 * `visitorEmojiNames.ts`'s own two source arrays were copy-pasted independently, at different times,
 * from the same `ago-chat/src/Ago.Chat.Domain/VisitorEmojiDictionary.cs` - never retyped from an OS
 * emoji picker or any other source, and never from each other.
 */
// Copied byte-for-byte from `VisitorEmojiDictionary.Creatures` (`ago-chat`) - do not retype.
const EXPECTED_CREATURES = [
  "🐔", "🐠", "🐳", "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻",
  "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐦", "🦉",
];

// Copied byte-for-byte from `VisitorEmojiDictionary.Foods` (`ago-chat`) - do not retype.
const EXPECTED_FOODS = [
  "🍊", "🥝", "🌭", "🍕", "🍔", "🍟", "🌮", "🍣", "🍩", "🍪",
  "🍦", "🍎", "🍌", "🍇", "🍉", "🍓", "🍒", "🍑", "🥑", "🍍",
];

const EXPECTED_GLYPHS = [...EXPECTED_CREATURES, ...EXPECTED_FOODS];

describe("visitorEmojiNames: completeness against VisitorEmojiDictionary.cs", () => {
  it("has exactly 40 expected glyphs in this test's own list - 20 creatures, 20 foods, no accidental duplicate", () => {
    expect(EXPECTED_CREATURES).toHaveLength(20);
    expect(EXPECTED_FOODS).toHaveLength(20);
    expect(new Set(EXPECTED_GLYPHS).size).toBe(40);
  });

  it.each(EXPECTED_GLYPHS)("%s has an English name", (glyph) => {
    expect(visitorEmojiNamesEn[glyph], `missing English name for ${glyph} (VisitorEmojiDictionary.cs)`).toBeTruthy();
  });

  it.each(EXPECTED_GLYPHS)("%s has a Russian name", (glyph) => {
    expect(visitorEmojiNamesRu[glyph], `missing Russian name for ${glyph} (VisitorEmojiDictionary.cs)`).toBeTruthy();
  });

  it("carries no extra glyph in either table beyond these 40 - a stale entry would go silently unused", () => {
    expect(Object.keys(visitorEmojiNamesEn).sort()).toEqual([...EXPECTED_GLYPHS].sort());
    expect(Object.keys(visitorEmojiNamesRu).sort()).toEqual([...EXPECTED_GLYPHS].sort());
  });
});

describe("localizedEmojiName", () => {
  it("resolves a known glyph from the given table", () => {
    expect(localizedEmojiName("🦉", visitorEmojiNamesEn)).toBe("Owl");
    expect(localizedEmojiName("🦉", visitorEmojiNamesRu)).toBe("Сова");
  });

  it("falls back to the raw glyph, never throwing, for a glyph missing from the table", () => {
    expect(localizedEmojiName("🛸", visitorEmojiNamesEn)).toBe("🛸");
  });
});
