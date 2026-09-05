import { describe, expect, it } from "vitest";
import { validatePenaltySeconds } from "./assignmentPenaltyValidation.js";

/**
 * `23-05`: the console's own pre-flight check for `sites.assignment_penalty_seconds` - deliberately
 * tested as a pure function rather than through the page, the same reasoning
 * `offlineAutoReplyValidation.test.ts` states for its own sibling: what a reviewer needs to see is
 * that the rule enforced is the server's own (`Site.UpdateAssignmentPenalty`'s guard), not that a
 * form renders.
 */
describe("the assignment-penalty draft", () => {
  it("refuses an empty value", () => {
    expect(validatePenaltySeconds("")).not.toBeNull();
    expect(validatePenaltySeconds("   ")).not.toBeNull();
  });

  it("refuses zero and negative values", () => {
    expect(validatePenaltySeconds("0")).not.toBeNull();
    expect(validatePenaltySeconds("-5")).not.toBeNull();
  });

  it("refuses a non-integer value", () => {
    expect(validatePenaltySeconds("1.5")).not.toBeNull();
    expect(validatePenaltySeconds("abc")).not.toBeNull();
  });

  it("accepts a positive whole number of seconds", () => {
    expect(validatePenaltySeconds("120")).toBeNull();
    expect(validatePenaltySeconds("1")).toBeNull();
  });
});
