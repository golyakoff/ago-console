import { describe, expect, it } from "vitest";
import {
  canonicalRuPhone,
  digitCountForMaskedOffset,
  formatRuPhoneForDisplay,
  isExplicitNonRussianPhoneValue,
  isRuPhoneComplete,
  maskRuNational,
  maskedOffsetForDigitCount,
  nextRuPhoneEdit,
  normalizeRuNationalDigits,
  ruNationalDigits,
} from "./phoneFormat.js";

/**
 * `26-326`: this file's own test cases mirror `RuPhoneFieldTest.kt` (`ago-android`) test for test where
 * a function is a direct port - `normalizeRuNationalDigits`/`canonicalRuPhone`/`isRuPhoneComplete`/
 * `ruNationalDigits`/`maskRuNational`/`maskedOffsetForDigitCount`/`digitCountForMaskedOffset`/
 * `formatRuPhoneForDisplay` - so a reviewer can check behaviour parity by reading the two files side by
 * side. `isExplicitNonRussianPhoneValue` (a console-only escape hatch, `phoneFormat.ts`'s own doc
 * comment) and `nextRuPhoneEdit` (the console-only caret bridge, same file) have no Android counterpart
 * and are covered by their own new cases at the bottom.
 */
describe("phoneFormat", () => {
  describe("normalizeRuNationalDigits: paste + keystroke normalisation", () => {
    it("drops a leading 8 once the run is longer than 10 digits", () => {
      expect(normalizeRuNationalDigits("89211234567")).toBe("9211234567");
    });

    it("drops a leading 7 once the run is longer than 10 digits", () => {
      expect(normalizeRuNationalDigits("79211234567")).toBe("9211234567");
    });

    it("normalises a pasted +7 with spaces and dashes to the bare 10 digits", () => {
      expect(normalizeRuNationalDigits("+7 921 123-45-67")).toBe("9211234567");
    });

    it("normalises a pasted number with a leading 7 and spaces, no plus", () => {
      expect(normalizeRuNationalDigits("7 9211234567")).toBe("9211234567");
    });

    it("passes bare 10 digits through unchanged", () => {
      expect(normalizeRuNationalDigits("9211234567")).toBe("9211234567");
    });

    it("never mistakes a short, incomplete run for a leading country digit", () => {
      expect(normalizeRuNationalDigits("921")).toBe("921");
      expect(normalizeRuNationalDigits("7")).toBe("7");
      expect(normalizeRuNationalDigits("78")).toBe("78");
    });

    it("rejects extra digits past 10 rather than appending them", () => {
      expect(normalizeRuNationalDigits("921123456789")).toBe("9211234567");
      expect(normalizeRuNationalDigits("8921123456789")).toBe("9211234567");
    });

    it("strips non-digit characters even with no leading country marker", () => {
      expect(normalizeRuNationalDigits("(921) 123-45-67")).toBe("9211234567");
    });
  });

  describe("canonicalRuPhone / isRuPhoneComplete / ruNationalDigits", () => {
    it("canonicalRuPhone is blank for no digits and prefixed for any digits typed", () => {
      expect(canonicalRuPhone("")).toBe("");
      expect(canonicalRuPhone("9")).toBe("+79");
      expect(canonicalRuPhone("921123456")).toBe("+7921123456");
      expect(canonicalRuPhone("9211234567")).toBe("+79211234567");
    });

    it("isRuPhoneComplete is false for blank/partial and true only at exactly 10 national digits", () => {
      expect(isRuPhoneComplete("")).toBe(false);
      expect(isRuPhoneComplete("+7")).toBe(false);
      expect(isRuPhoneComplete("+792")).toBe(false);
      expect(isRuPhoneComplete("+7921123456")).toBe(false);
      expect(isRuPhoneComplete("+79211234567")).toBe(true);
    });

    it("ruNationalDigits round-trips canonicalRuPhone's own output at every length", () => {
      const full = "9211234567";
      for (let length = 0; length <= 10; length += 1) {
        const digits = full.slice(0, length);
        expect(ruNationalDigits(canonicalRuPhone(digits))).toBe(digits);
      }
    });

    it("ruNationalDigits also recovers digits from a value that never went through this field", () => {
      expect(ruNationalDigits("+7 900 111 22 33")).toBe("9001112233");
      expect(ruNationalDigits("89211234567")).toBe("9211234567");
    });
  });

  describe("maskRuNational: the live +7 (XXX) XXX-XX-XX formatting", () => {
    it("grows one group at a time as digits arrive", () => {
      expect(maskRuNational("")).toBe("+7 ");
      expect(maskRuNational("9")).toBe("+7 (9");
      expect(maskRuNational("92")).toBe("+7 (92");
      expect(maskRuNational("921")).toBe("+7 (921) ");
      expect(maskRuNational("9211")).toBe("+7 (921) 1");
      expect(maskRuNational("921123")).toBe("+7 (921) 123-");
      expect(maskRuNational("9211234")).toBe("+7 (921) 123-4");
      expect(maskRuNational("92112345")).toBe("+7 (921) 123-45-");
      expect(maskRuNational("921123456")).toBe("+7 (921) 123-45-6");
      expect(maskRuNational("9211234567")).toBe("+7 (921) 123-45-67");
    });
  });

  describe("offset mapping: the caret staying correct through the mask", () => {
    it("maskedOffsetForDigitCount lands right after the digit just typed, punctuation included", () => {
      expect(maskedOffsetForDigitCount(0)).toBe("+7 ".length);
      expect(maskedOffsetForDigitCount(1)).toBe("+7 (9".length);
      expect(maskedOffsetForDigitCount(3)).toBe("+7 (921) ".length);
      expect(maskedOffsetForDigitCount(6)).toBe("+7 (921) 123-".length);
      expect(maskedOffsetForDigitCount(8)).toBe("+7 (921) 123-45-".length);
      expect(maskedOffsetForDigitCount(10)).toBe("+7 (921) 123-45-67".length);
    });

    it("digitCountForMaskedOffset is the exact inverse of maskedOffsetForDigitCount", () => {
      for (let count = 0; count <= 10; count += 1) {
        const offset = maskedOffsetForDigitCount(count);
        expect(digitCountForMaskedOffset(offset, 10)).toBe(count);
      }
    });

    it("a tap landing inside punctuation snaps forward to the next digit slot", () => {
      const masked = maskRuNational("9211234567");
      expect(masked).toBe("+7 (921) 123-45-67");
      const closingParenIndex = masked.indexOf(")");
      expect(digitCountForMaskedOffset(closingParenIndex, 10)).toBe(3);
      expect(digitCountForMaskedOffset(closingParenIndex + 1, 10)).toBe(3);
    });

    it("digitCountForMaskedOffset clamps to totalDigits for an offset past the end", () => {
      expect(digitCountForMaskedOffset(999, 5)).toBe(5);
    });
  });

  describe("formatRuPhoneForDisplay: the read-only counterpart to the mask above", () => {
    it("formats a canonical +7 number into the grouped display shape", () => {
      expect(formatRuPhoneForDisplay("+79162222222")).toBe("+7 (916) 222-22-22");
    });

    it("formats bare 10 national digits with no plus", () => {
      expect(formatRuPhoneForDisplay("9211234567")).toBe("+7 (921) 123-45-67");
    });

    it("normalises domestic-dialling spellings the same as the mask's own input path", () => {
      expect(formatRuPhoneForDisplay("89211234567")).toBe("+7 (921) 123-45-67");
      expect(formatRuPhoneForDisplay("79211234567")).toBe("+7 (921) 123-45-67");
    });

    it("formats a +7 number that already carries punctuation or spaces", () => {
      expect(formatRuPhoneForDisplay("+7 921 123-45-67")).toBe("+7 (921) 123-45-67");
    });

    it("never mangles a foreign number into a fake +7, even at the same digit count", () => {
      // Norway's +47 country code plus an 8-digit subscriber number runs exactly 10 digits once the "+"
      // is stripped - the same length a bare Russian national number would have. Only the explicit,
      // different "+47" prefix tells the two apart.
      expect(formatRuPhoneForDisplay("+4758655828")).toBe("+4758655828");
    });

    it("passes other foreign numbers through unchanged regardless of shape", () => {
      expect(formatRuPhoneForDisplay("+12025550123")).toBe("+12025550123");
      expect(formatRuPhoneForDisplay("+442071234567")).toBe("+442071234567");
    });

    it("is idempotent - formatting an already-formatted number changes nothing further", () => {
      const formatted = formatRuPhoneForDisplay("+79162222222");
      expect(formatRuPhoneForDisplay(formatted)).toBe(formatted);
    });

    it("passes an incomplete or malformed value through unchanged", () => {
      expect(formatRuPhoneForDisplay("+7")).toBe("+7");
      expect(formatRuPhoneForDisplay("+79211234")).toBe("+79211234");
      expect(formatRuPhoneForDisplay("921")).toBe("921");
    });

    it("never reformats a masked server preview into a fake full number", () => {
      expect(formatRuPhoneForDisplay("+7 ··· 08")).toBe("+7 ··· 08");
    });

    it("passes blank and empty values through unchanged", () => {
      expect(formatRuPhoneForDisplay("")).toBe("");
      expect(formatRuPhoneForDisplay("   ")).toBe("   ");
    });
  });

  describe("isExplicitNonRussianPhoneValue: the 25-209 escape hatch", () => {
    it("is false for blank, a plain RU-shaped value, and an explicit +7", () => {
      expect(isExplicitNonRussianPhoneValue("")).toBe(false);
      expect(isExplicitNonRussianPhoneValue("(916) 291-11-29")).toBe(false);
      expect(isExplicitNonRussianPhoneValue("+7 (916) 291-11-29")).toBe(false);
    });

    it("is true for an explicit non-Russian country code, a bare '+' included", () => {
      expect(isExplicitNonRussianPhoneValue("+1 555 019 4567")).toBe(true);
      expect(isExplicitNonRussianPhoneValue("+")).toBe(true);
    });
  });

  describe("nextRuPhoneEdit: bridging a raw, already-masked DOM edit back to canonical + caret", () => {
    it("typing the first digit right after the fixed +7 lead", () => {
      const result = nextRuPhoneEdit("+7 9", 4);
      expect(result.canonical).toBe("+79");
      expect(result.maskedOffset).toBe(maskedOffsetForDigitCount(1));
    });

    it("clearing the whole field snaps back to the bare, non-deletable +7 lead", () => {
      const result = nextRuPhoneEdit("", 0);
      expect(result.canonical).toBe("");
      expect(result.maskedOffset).toBe(maskedOffsetForDigitCount(0));
    });

    it("a full paste of the 89… domestic-dialling shape drops the leading 8 and lands the caret at the end", () => {
      const raw = "89211234567";
      const result = nextRuPhoneEdit(raw, raw.length);
      expect(result.canonical).toBe("+79211234567");
      expect(result.maskedOffset).toBe(maskedOffsetForDigitCount(10));
    });

    it("a full paste of the spec's +7 921 123-45-67 shape lands the caret at the end", () => {
      const raw = "+7 921 123-45-67";
      const result = nextRuPhoneEdit(raw, raw.length);
      expect(result.canonical).toBe("+79211234567");
      expect(result.maskedOffset).toBe(maskedOffsetForDigitCount(10));
    });

    it("inserting a digit mid-string keeps the caret right after the digit just typed", () => {
      // Starting from the fully-typed mask "+7 (921) 123-45-67", inserting "9" right after "(921) "
      // (offset 9, itself maskedOffsetForDigitCount(3)) produces "+7 (921) 9123-45-67" - one digit past
      // capacity, so the mask's own cap-at-10 rule drops the run's last digit rather than the inserted
      // one, and the caret still lands right after the "9" the operator just typed.
      const insertAt = maskedOffsetForDigitCount(3);
      const raw = `+7 (921) 9123-45-67`;
      const result = nextRuPhoneEdit(raw, insertAt + 1);
      expect(result.canonical).toBe(`+7${"9219123456"}`);
      expect(result.maskedOffset).toBe(maskedOffsetForDigitCount(4));
    });
  });
});
