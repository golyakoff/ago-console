import { describe, expect, it } from "vitest";
import { truncateToLines } from "./textTruncation.js";

/**
 * `25-24`'s own boundary - "truncated to the first 10 lines" is exact, so the two lines either side
 * of that number are what this proves, plus the shapes `WidgetConfigPage` actually feeds it (empty,
 * single-line, `\n`-only content).
 */
describe("truncateToLines", () => {
  it("returns the text unchanged, and reports no truncation, when it has fewer lines than the limit", () => {
    const result = truncateToLines("one\ntwo\nthree", 10);

    expect(result).toEqual({ visible: "one\ntwo\nthree", truncated: false });
  });

  it("returns the text unchanged at exactly the limit", () => {
    const tenLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");

    const result = truncateToLines(tenLines, 10);

    expect(result).toEqual({ visible: tenLines, truncated: false });
  });

  it("cuts to the first `maxLines` lines and reports truncation for one line over the limit", () => {
    const elevenLines = Array.from({ length: 11 }, (_, i) => `Line ${i + 1}`).join("\n");
    const tenLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");

    const result = truncateToLines(elevenLines, 10);

    expect(result).toEqual({ visible: tenLines, truncated: true });
  });

  it("treats an empty string as one (empty) line - never truncated", () => {
    const result = truncateToLines("", 10);

    expect(result).toEqual({ visible: "", truncated: false });
  });

  it("counts a whole paragraph with no newline at all as a single line", () => {
    const result = truncateToLines("a very long single-line sentence with no breaks in it at all", 10);

    expect(result.truncated).toBe(false);
  });
});
