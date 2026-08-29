import { describe, expect, it } from "vitest";
import { isValidSeatCount, MAX_SEATS, MIN_SEATS } from "./billingValidation.js";

describe("isValidSeatCount", () => {
  it("accepts the boundary values", () => {
    expect(isValidSeatCount(MIN_SEATS)).toBe(true);
    expect(isValidSeatCount(MAX_SEATS)).toBe(true);
  });

  it("rejects below the minimum and above the maximum", () => {
    expect(isValidSeatCount(MIN_SEATS - 1)).toBe(false);
    expect(isValidSeatCount(MAX_SEATS + 1)).toBe(false);
  });

  it("rejects a non-integer seat count", () => {
    expect(isValidSeatCount(5.5)).toBe(false);
  });
});
