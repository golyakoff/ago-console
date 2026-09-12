import { describe, expect, it } from "vitest";
import { operatorInitials } from "./operatorInitials.js";

describe("operatorInitials", () => {
  it("takes the first letter of the first two words, in order, for a Cyrillic name", () => {
    expect(operatorInitials("Андрей Голяков")).toBe("АГ");
  });

  it("takes the first letter of the first two words for a Latin name", () => {
    expect(operatorInitials("Andrey Golyakov")).toBe("AG");
  });

  it("ignores a third word - two words is the whole budget", () => {
    expect(operatorInitials("Andrey B Golyakov")).toBe("AB");
  });

  it("tolerates repeated internal whitespace", () => {
    expect(operatorInitials("Andrey   Golyakov")).toBe("AG");
  });

  it("trims leading and trailing whitespace before splitting", () => {
    expect(operatorInitials("  Andrey Golyakov  ")).toBe("AG");
  });

  it("falls back to the first two characters of a single, bare word", () => {
    expect(operatorInitials("golyakoff")).toBe("GO");
  });

  it("falls back to the first two characters for a raw subject id", () => {
    expect(operatorInitials("operator-sub-1")).toBe("OP");
  });

  it("upper-cases a lower-case single word with no second word to draw from", () => {
    expect(operatorInitials("k")).toBe("K");
  });

  it("returns the empty string for an empty name", () => {
    expect(operatorInitials("")).toBe("");
  });

  it("returns the empty string for a name that is only whitespace", () => {
    expect(operatorInitials("   ")).toBe("");
  });
});
