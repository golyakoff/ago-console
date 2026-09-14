import { describe, expect, it } from "vitest";
import { isValidSeatCount } from "./billingValidation.js";

/** `25-23`: the bounds arrive from `GET .../billing/status`'s own `seatPricing` now, so these are
 * `SubscriptionTierBands.MinSeats`/`MaxSeats`' real current values (2 and **5**) written down once,
 * here, as the fixture a test needs - not re-exported constants the application reads. */
const MIN = 2;
const MAX = 5;

describe("isValidSeatCount", () => {
  it("accepts the boundary values the server itself named", () => {
    expect(isValidSeatCount(MIN, MIN, MAX)).toBe(true);
    expect(isValidSeatCount(MAX, MIN, MAX)).toBe(true);
  });

  it("rejects below the minimum and above the maximum", () => {
    expect(isValidSeatCount(MIN - 1, MIN, MAX)).toBe(false);
    expect(isValidSeatCount(MAX + 1, MIN, MAX)).toBe(false);
  });

  it("rejects a non-integer seat count", () => {
    expect(isValidSeatCount(3.5, MIN, MAX)).toBe(false);
  });

  // `25-23`'s own reason for deleting this module's `MAX_SEATS = 100` constant rather than
  // correcting it: the old hardcoded ceiling accepted everything up to 100, so a 20-seat request
  // passed the console and was then refused by `TryResolveTier`. With the bound supplied by the
  // server there is no second number left to drift.
  it("rejects a count the old hardcoded 100-seat ceiling used to wave through", () => {
    expect(isValidSeatCount(20, MIN, MAX)).toBe(false);
  });
});
